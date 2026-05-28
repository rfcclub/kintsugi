import { randomUUID } from "node:crypto";
import type { RuntimeEvent, TokenUsage } from "../protocol/events.js";
import type { Provider, ProviderMessage, ProviderTurnRequest, ToolSpec } from "./provider.js";
import type { RealProviderConfig } from "./config.js";
import { mapHttpError, mapNetworkError } from "./errors.js";
import { readSseEvents } from "./sse.js";

interface ResponsesEvent {
  type?: string;
  response?: {
    id?: string;
    status?: string;
    incomplete_details?: { reason?: string };
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    };
  };
  delta?: string;
  reasoning?: string;
  item?: {
    type?: string;
    name?: string;
    arguments?: string;
    call_id?: string;
  };
}

export class OpenAIResponsesProvider implements Provider {
  readonly id = "openai-responses";

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
        `${trimTrailingSlash(this.config.baseUrl)}/responses`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: request.model ?? this.config.model,
            input: toResponsesInput(request.messages),
            tools: request.tools?.map(toResponsesTool),
            stream: true,
            max_output_tokens: mc?.maxTokens ?? this.config.maxTokens,
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

      let text = "";
      let usage: TokenUsage | undefined;
      for await (const event of readSseEvents(response.body)) {
        if (request.signal?.aborted) {
          return;
        }
        if (event.data === "[DONE]") {
          continue;
        }
        const payload = event.data as ResponsesEvent;
        const type = payload.type ?? event.event;

        if (type === "response.created") {
          yield { type: "turn.started", id: payload.response?.id ?? randomUUID() };
        } else if (type === "response.output_text.delta" && payload.delta) {
          text += payload.delta;
          yield { type: "assistant.delta", text: payload.delta };
        } else if (type === "response.reasoning.delta" && payload.reasoning) {
          yield { type: "thinking.delta", text: payload.reasoning };
        } else if (type === "response.reasoning.completed") {
          yield { type: "thinking.completed", text: payload.reasoning ?? "" };
        } else if (type === "response.output_item.done" && payload.item?.type === "function_call") {
          yield {
            type: "tool.requested",
            id: payload.item.call_id ?? randomUUID(),
            name: payload.item.name ?? "unknown",
            args: parseJsonOrText(payload.item.arguments ?? ""),
          };
        } else if (type === "response.completed") {
          usage = mapResponsesUsage(payload.response?.usage);
          const reason = payload.response?.incomplete_details?.reason;
          if (payload.response?.status === "incomplete" || reason === "max_output_tokens") {
            yield { type: "turn.truncated", reason: reason ?? "incomplete" };
          }
          yield { type: "thinking.completed", text: "" };
          yield { type: "assistant.completed", text };
          yield { type: "turn.completed", usage };
        } else if (type === "response.failed") {
          yield { type: "turn.failed", message: "Provider error: response failed" };
          return;
        }
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

export function toResponsesInput(messages: ProviderMessage[]): Array<Record<string, unknown>> {
  return messages.flatMap((message): Array<Record<string, unknown>> => {
    if (message.role === "system") {
      return [{ role: "developer", content: message.content }];
    }
    if (message.role === "tool") {
      return [{
        type: "function_call_output",
        call_id: message.toolCallId ?? "",
        output: message.content,
      }];
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      return [
        ...(message.content ? [{ role: "assistant", content: message.content }] : []),
        ...message.toolCalls.map((call) => ({
          type: "function_call",
          call_id: call.id,
          name: call.name,
          arguments: JSON.stringify(call.args ?? {}),
        })),
      ];
    }
    return [{ role: message.role, content: message.content }];
  });
}

function mapResponsesUsage(
  usage:
    | {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
      }
    | undefined
): TokenUsage | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    prompt: usage.input_tokens ?? 0,
    completion: usage.output_tokens ?? 0,
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

export function formatResponsesToolMessages(
  toolCalls: Array<{ id: string; name: string; args: unknown }>,
  toolResults: Array<{ id: string; name: string; output: string; isError: boolean }>,
  assistantText?: string
): ProviderMessage[] {
  const messages: ProviderMessage[] = [];

  messages.push({
    role: "assistant",
    content: assistantText ?? "",
    toolCalls,
  });

  for (const result of toolResults) {
    messages.push({
      role: "tool",
      content: result.output,
      toolCallId: result.id,
    });
  }

  return messages;
}

function toResponsesTool(tool: ToolSpec): Record<string, unknown> {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}
