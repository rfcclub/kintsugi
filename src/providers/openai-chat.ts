import { randomUUID } from "node:crypto";
import type { RuntimeEvent, TokenUsage } from "../protocol/events.js";
import type { Provider, ProviderMessage, ProviderTurnRequest, ToolSpec } from "./provider.js";
import type { RealProviderConfig } from "./config.js";
import { mapHttpError, mapNetworkError } from "./errors.js";
import { readSseEvents } from "./sse.js";

interface ChatChunk {
  id?: string;
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
}

export class OpenAIChatProvider implements Provider {
  readonly id = "openai-chat";

  constructor(private readonly config: RealProviderConfig) {}

  async *streamTurn(request: ProviderTurnRequest): AsyncIterable<RuntimeEvent> {
    const controller = new AbortController();
    if (request.signal?.aborted) {
      controller.abort();
    }
    const abort = () => controller.abort();
    request.signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const mc = request.modelConfig;

    try {
      const response = await (this.config.fetchImpl ?? fetch)(
        `${trimTrailingSlash(this.config.baseUrl)}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: request.model ?? this.config.model,
            messages: toOpenAIChatMessages(request.messages),
            tools: request.tools?.map(toOpenAIChatTool),
            stream: true,
            max_tokens: mc?.maxTokens ?? this.config.maxTokens,
            ...(mc?.temperature !== undefined ? { temperature: mc.temperature } : this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}),
            ...(mc?.top_p !== undefined ? { top_p: mc.top_p } : this.config.top_p !== undefined ? { top_p: this.config.top_p } : {}),
            ...(mc?.stopSequences !== undefined ? { stop: mc.stopSequences } : this.config.stopSequences !== undefined ? { stop: this.config.stopSequences } : {}),
            ...(mc?.presencePenalty !== undefined ? { presence_penalty: mc.presencePenalty } : this.config.presencePenalty !== undefined ? { presence_penalty: this.config.presencePenalty } : {}),
            ...(mc?.frequencyPenalty !== undefined ? { frequency_penalty: mc.frequencyPenalty } : this.config.frequencyPenalty !== undefined ? { frequency_penalty: this.config.frequencyPenalty } : {}),
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        yield mapHttpError(response.status, this.config.apiKey);
        return;
      }

      let started = false;
      let text = "";
      let thinkingText = "";
      let usage: TokenUsage | undefined;
      let completed = false;
      for await (const event of readSseEvents(response.body)) {
        if (request.signal?.aborted) {
          return;
        }
        if (event.data === "[DONE]") {
          continue;
        }
        const chunk = event.data as ChatChunk;
        if (!started) {
          yield { type: "turn.started", id: chunk.id ?? randomUUID() };
          started = true;
        }

        const chunkUsage = mapOpenAIUsage(chunk.usage);
        if (chunkUsage) {
          usage = chunkUsage;
        }

        for (const choice of chunk.choices ?? []) {
          const delta = choice.delta;
          if (delta?.content) {
            text += delta.content;
            yield { type: "assistant.delta", text: delta.content };
          }

          if (delta?.reasoning_content) {
            thinkingText += delta.reasoning_content;
            yield { type: "thinking.delta", text: delta.reasoning_content };
          }

          for (const toolCall of delta?.tool_calls ?? []) {
            if (toolCall.function?.name) {
              yield {
                type: "tool.requested",
                id: toolCall.id ?? randomUUID(),
                name: toolCall.function.name,
                args: parseJsonOrText(toolCall.function.arguments ?? ""),
              };
            }
          }

          if (choice.finish_reason) {
            if (choice.finish_reason === "length") {
              yield { type: "turn.truncated", reason: "length" };
            }
            yield { type: "assistant.completed", text: text || thinkingText };
            completed = true;
          }
        }
      }

      if (completed) {
        yield { type: "thinking.completed", text: '' };
        yield { type: "turn.completed", usage };
      }
    } catch (error) {
      if (request.signal?.aborted) {
        return;
      }
      yield mapNetworkError(error, this.config.apiKey);
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abort);
    }
  }
}

function mapOpenAIUsage(usage: ChatChunk["usage"]): TokenUsage | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    prompt: usage.prompt_tokens ?? 0,
    completion: usage.completion_tokens ?? 0,
    total: usage.total_tokens ?? 0,
  };
}

function parseJsonOrText(text: string): unknown {
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function formatOpenAIToolMessages(
  toolCalls: Array<{ id: string; name: string; args: unknown }>,
  toolResults: Array<{ id: string; name: string; output: string; isError: boolean }>,
  assistantText?: string
): ProviderMessage[] {
  const messages: ProviderMessage[] = [];

  // Assistant message (content from before tool calls)
  messages.push({
    role: "assistant",
    content: assistantText ?? "",
    toolCalls,
  });

  // Tool result messages — each tool call gets a result with matching toolCallId
  for (const result of toolResults) {
    messages.push({
      role: "tool",
      content: result.output,
      toolCallId: result.id,
    });
  }

  return messages;
}

function toOpenAIChatTool(tool: ToolSpec): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function toOpenAIChatMessages(messages: ProviderMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        tool_call_id: message.toolCallId,
      };
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      return {
        role: "assistant",
        content: message.content,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: {
            name: call.name,
            arguments: JSON.stringify(call.args ?? {}),
          },
        })),
      };
    }
    return {
      role: message.role,
      content: message.content,
    };
  });
}
