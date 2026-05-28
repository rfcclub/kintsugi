import { randomUUID } from "node:crypto";
import type { RuntimeEvent } from "../protocol/events.js";
import type { Provider, ProviderTurnRequest } from "./provider.js";

export interface MockProviderConfig {
  responseText?: string;
  delayMs?: number;
  failAfter?: number;
  toolCall?: {
    name: string;
    args: unknown;
  };
}

const DEFAULT_RESPONSE = "Mock response received.";
const DEFAULT_DELAY_MS = 50;
const CHUNK_SIZE = 10;

export class MockProvider implements Provider {
  readonly id = "mock";
  private turns = 0;

  constructor(private readonly config: MockProviderConfig = {}) {}

  async *streamTurn(_request: ProviderTurnRequest): AsyncIterable<RuntimeEvent> {
    this.turns += 1;
    yield { type: "turn.started", id: randomUUID() };

    if (this.config.failAfter !== undefined && this.turns > this.config.failAfter) {
      yield { type: "turn.failed", message: "Mock provider failure" };
      return;
    }

    const text = this.config.responseText ?? DEFAULT_RESPONSE;
    const delayMs = this.config.delayMs ?? DEFAULT_DELAY_MS;

    for (const chunk of splitChunks(text, CHUNK_SIZE)) {
      if (delayMs > 0) {
        await delay(delayMs);
      }
      yield { type: "assistant.delta", text: chunk };
    }

    if (this.config.toolCall) {
      const toolId = randomUUID();
      yield {
        type: "tool.requested",
        id: toolId,
        name: this.config.toolCall.name,
        args: this.config.toolCall.args,
      };
      yield { type: "tool.completed", id: toolId, output: "mock tool output" };
    }

    yield { type: "assistant.completed", text };
    yield {
      type: "turn.completed",
      usage: { prompt: 0, completion: 0, total: 0 },
    };
  }
}

function splitChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }
  return chunks.length > 0 ? chunks : [""];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
