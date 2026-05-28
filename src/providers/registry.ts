import { MockProvider, type MockProviderConfig } from "./mock.js";
import type { Provider, ProviderMessage, ToolCall, ToolResult, ToolMessageFormatter } from "./provider.js";
import {
  isProviderType,
  resolveRealProviderConfig,
  type ProviderConfigInput,
  type ProviderType,
} from "./config.js";
import { OpenAIChatProvider, formatOpenAIToolMessages } from "./openai-chat.js";
import { OpenAIResponsesProvider, formatResponsesToolMessages } from "./openai-responses.js";
import { AnthropicMessagesProvider, formatAnthropicToolMessages } from "./anthropic-messages.js";

const toolFormatters: Record<string, ToolMessageFormatter> = {
  "openai-chat": formatOpenAIToolMessages,
  "openai-responses": formatResponsesToolMessages,
  "anthropic-messages": formatAnthropicToolMessages,
};

export function getToolMessageFormatter(providerId: string): ToolMessageFormatter {
  const formatter = toolFormatters[providerId];
  if (!formatter) {
    // Default formatter for unknown providers — simple tool role messages
    return (
      toolCalls: ToolCall[],
      toolResults: ToolResult[],
      assistantText?: string
    ): ProviderMessage[] => {
      const messages: ProviderMessage[] = [];
      messages.push({ role: "assistant", content: assistantText ?? "" });
      for (const result of toolResults) {
        messages.push({ role: "tool", content: result.output, toolCallId: result.id });
      }
      return messages;
    };
  }
  return formatter;
}

export interface CreateProviderOptions extends ProviderConfigInput {
  mock?: MockProviderConfig;
}

export function createProvider(
  type: ProviderType = "mock",
  options: CreateProviderOptions = {}
): Provider {
  switch (type) {
    case "mock":
      return new MockProvider(options.mock);
    case "openai-chat":
      return new OpenAIChatProvider(resolveRealProviderConfig(type, options));
    case "openai-responses":
      return new OpenAIResponsesProvider(resolveRealProviderConfig(type, options));
    case "anthropic-messages":
      return new AnthropicMessagesProvider(resolveRealProviderConfig(type, options));
  }
}

export function parseProviderType(value: string): ProviderType {
  if (isProviderType(value)) {
    return value;
  }
  throw new Error(`Unknown provider: ${value}`);
}
