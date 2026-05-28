import type { RuntimeEvent } from "../protocol/events.js";
import type { ModelConfig } from "./config.js";

export interface ProviderTurnRequest {
  messages: ProviderMessage[];
  model?: string;
  tools?: ToolSpec[];
  modelConfig?: ModelConfig;
  signal?: AbortSignal;
}

export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface ToolResult {
  id: string;
  name: string;
  output: string;
  isError: boolean;
}

export type ToolMessageFormatter = (
  toolCalls: ToolCall[],
  toolResults: ToolResult[],
  assistantText?: string
) => ProviderMessage[];

export interface Provider {
  readonly id: string;
  streamTurn(request: ProviderTurnRequest): AsyncIterable<RuntimeEvent>;
}
