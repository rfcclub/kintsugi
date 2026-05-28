import { randomUUID } from "node:crypto";
import type { RuntimeEvent, TokenUsage } from "../protocol/events.js";
import type { Provider, ProviderMessage, ProviderTurnRequest, ToolSpec } from "./provider.js";
import type { RealProviderConfig } from "./config.js";
import { mapHttpError, mapNetworkError, redactApiKey } from "./errors.js";
import { readSseEvents } from "./sse.js";

interface AnthropicEvent {
  type?: string;
  message?: {
    id?: string;
    usage?: AnthropicUsage;
  };
  delta?: {
    type?: string;
    text?: string;
    stop_reason?: string | null;
  };
  usage?: AnthropicUsage;
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
    input?: unknown;
  };
  error?: { message?: string };
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
}

export class AnthropicMessagesProvider implements Provider {
  readonly id = "anthropic-messages";

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
      const translated = toAnthropicMessages(request.messages);
      const body: Record<string, unknown> = {
        model: request.model ?? this.config.model,
        system: translated.system,
        messages: translated.messages,
        tools: request.tools?.map(toAnthropicTool),
        stream: true,
        max_tokens: mc?.maxTokens ?? this.config.maxTokens,
      };

      // Anthropic-specific model config
      if (mc?.temperature !== undefined) body.temperature = mc.temperature;
      else if (this.config.temperature !== undefined) body.temperature = this.config.temperature;
      if (mc?.top_p !== undefined) body.top_p = mc.top_p;
      else if (this.config.top_p !== undefined) body.top_p = this.config.top_p;
      if (mc?.stopSequences !== undefined) body.stop_sequences = mc.stopSequences;
      else if (this.config.stopSequences !== undefined) body.stop_sequences = this.config.stopSequences;

      const response = await (this.config.fetchImpl ?? fetch)(
        `${trimTrailingSlash(this.config.baseUrl)}/messages`,
        {
          method: "POST",
          headers: {
            "x-api-key": this.config.apiKey,
            "anthropic-version": this.config.anthropicVersion,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        yield mapHttpError(response.status, this.config.apiKey);
        return;
      }

      let text = "";
      let usage: TokenUsage | undefined;
      let stopReason: string | undefined;
      for await (const event of readSseEvents(response.body)) {
        if (request.signal?.aborted) {
          return;
        }
        const payload = event.data as AnthropicEvent;
        const type = payload.type ?? event.event;

        if (type === "message_start") {
          yield { type: "turn.started", id: payload.message?.id ?? randomUUID() };
          usage = mapAnthropicUsage(payload.message?.usage);
        } else if (type === "content_block_start" && payload.content_block?.type === "thinking") {
          const thinkingText = typeof payload.content_block.input === "string" ? payload.content_block.input : "";
          if (thinkingText) {
            yield { type: "thinking.delta", text: thinkingText };
          }
        } else if (type === "content_block_start" && payload.content_block?.type === "tool_use") {
          yield {
            type: "tool.requested",
            id: payload.content_block.id ?? randomUUID(),
            name: payload.content_block.name ?? "unknown",
            args: payload.content_block.input ?? {},
          };
        } else if (type === "content_block_delta" && payload.delta?.type === "thinking_delta") {
          const delta = payload.delta.text ?? "";
          yield { type: "thinking.delta", text: delta };
        } else if (type === "content_block_delta" && payload.delta?.type === "text_delta") {
          const delta = payload.delta.text ?? "";
          text += delta;
          yield { type: "assistant.delta", text: delta };
        } else if (type === "message_delta") {
          usage = mapAnthropicUsage(payload.usage) ?? usage;
          stopReason = payload.delta?.stop_reason ?? stopReason;
          if (stopReason === "max_tokens") {
            yield { type: "turn.truncated", reason: "max_tokens" };
          }
        } else if (type === "message_stop") {
          yield { type: "thinking.completed", text: "" };
          yield { type: "assistant.completed", text };
          yield { type: "turn.completed", usage };
        } else if (type === "error") {
          yield {
            type: "turn.failed",
            message: redactApiKey(payload.error?.message ?? "Provider error", this.config.apiKey),
          };
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

export function toAnthropicMessages(messages: ProviderMessage[]): {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string | Array<Record<string, unknown>> }>;
} {
  const system: string[] = [];
  const translated: Array<{ role: "user" | "assistant"; content: string | Array<Record<string, unknown>> }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      system.push(message.content);
    } else if (message.role === "assistant") {
      if (message.toolCalls?.length) {
        translated.push({
          role: "assistant",
          content: [
            ...(message.content ? [{ type: "text", text: message.content }] : []),
            ...message.toolCalls.map((call) => ({
              type: "tool_use",
              id: call.id,
              name: call.name,
              input: call.args ?? {},
            })),
          ],
        });
      } else {
        translated.push({ role: "assistant", content: message.content });
      }
    } else if (message.role === "tool") {
      translated.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: message.toolCallId,
          content: message.content,
        }],
      });
    } else {
      translated.push({ role: "user", content: message.content });
    }
  }

  return {
    system: system.join("\n\n"),
    messages: translated,
  };
}

function mapAnthropicUsage(usage: AnthropicUsage | undefined): TokenUsage | undefined {
  if (!usage) {
    return undefined;
  }
  const prompt = usage.input_tokens ?? 0;
  const completion = usage.output_tokens ?? 0;
  return { prompt, completion, total: prompt + completion };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function formatAnthropicToolMessages(
  toolCalls: Array<{ id: string; name: string; args: unknown }>,
  toolResults: Array<{ id: string; name: string; output: string; isError: boolean }>,
  assistantText?: string
): ProviderMessage[] {
  const messages: ProviderMessage[] = [];

  // Assistant message — Anthropic needs tool_use info embedded in content
  const assistantParts: string[] = [];
  if (assistantText) {
    assistantParts.push(assistantText);
  }
  for (const call of toolCalls) {
    assistantParts.push(
      `[tool_use id="${call.id}" name="${call.name}"]${JSON.stringify(call.args)}[/tool_use]`
    );
  }
  messages.push({
    role: "assistant",
    content: assistantParts.join("\n"),
    toolCalls,
  });

  // Tool results — Anthropic expects user role with tool_result content blocks
  for (const result of toolResults) {
    const prefix = result.isError ? "[error] " : "";
    messages.push({
      role: "tool",
      content: `${prefix}${result.output}`,
      toolCallId: result.id,
    });
  }

  return messages;
}

function toAnthropicTool(tool: ToolSpec): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  };
}
