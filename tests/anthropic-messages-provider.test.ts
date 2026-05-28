import { describe, expect, it } from "vitest";
import {
  AnthropicMessagesProvider,
  toAnthropicMessages,
} from "../src/providers/anthropic-messages.js";
import type { RealProviderConfig } from "../src/providers/config.js";

describe("AnthropicMessagesProvider", () => {
  it("translates system messages into Anthropic system text", () => {
    expect(
      toAnthropicMessages([
        { role: "system", content: "base" },
        { role: "system", content: "echo" },
        { role: "user", content: "hello" },
        { role: "assistant", content: "", toolCalls: [{ id: "call-1", name: "read_file", args: { path: "x" } }] },
        { role: "tool", content: "tool output", toolCallId: "call-1" },
      ])
    ).toEqual({
      system: "base\n\necho",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: [{ type: "tool_use", id: "call-1", name: "read_file", input: { path: "x" } }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "call-1", content: "tool output" }] },
      ],
    });
  });

  it("streams Anthropic Messages events", async () => {
    let body: unknown;
    let headers: Headers | undefined;
    const provider = new AnthropicMessagesProvider(
      config(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        headers = new Headers(init?.headers);
        return sseResponse([
          { type: "message_start", message: { id: "msg-1", usage: { input_tokens: 5 } } },
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "hello" },
          },
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn" },
            usage: { input_tokens: 5, output_tokens: 7 },
          },
          { type: "message_stop" },
        ]);
      })
    );

    const events = await collect(provider.streamTurn({ messages: [{ role: "user", content: "hi" }] }));

    expect(headers?.get("x-api-key")).toBe("sk-ant-test");
    expect(body).toMatchObject({
      model: "claude-test",
      stream: true,
      max_tokens: 16,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(events).toEqual([
      { type: "turn.started", id: "msg-1" },
      { type: "assistant.delta", text: "hello" },
      { type: "thinking.completed", text: "" },
      { type: "assistant.completed", text: "hello" },
      { type: "turn.completed", usage: { prompt: 5, completion: 7, total: 12 } },
    ]);
  });

  it("maps max_tokens stop reason to truncation", async () => {
    const provider = new AnthropicMessagesProvider(
      config(async () =>
        sseResponse([
          { type: "message_start", message: { id: "msg-1" } },
          { type: "message_delta", delta: { stop_reason: "max_tokens" } },
          { type: "message_stop" },
        ])
      )
    );

    const events = await collect(provider.streamTurn({ messages: [] }));

    expect(events).toContainEqual({ type: "turn.truncated", reason: "max_tokens" });
  });

  it("redacts API keys from provider error events", async () => {
    const provider = new AnthropicMessagesProvider(
      config(async () =>
        sseResponse([
          { type: "error", error: { message: "bad key sk-ant-test" } },
        ])
      )
    );

    const events = await collect(provider.streamTurn({ messages: [] }));

    expect(events).toEqual([{ type: "turn.failed", message: "bad key [REDACTED]" }]);
    expect(JSON.stringify(events)).not.toContain("sk-ant-test");
  });

  it("serializes per-turn model config into Messages request body", async () => {
    let body: Record<string, unknown> = {};
    const provider = new AnthropicMessagesProvider(
      config(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return sseResponse([
          { type: "message_start", message: { id: "msg-1" } },
          { type: "message_stop" },
        ]);
      })
    );

    await collect(provider.streamTurn({
      messages: [{ role: "user", content: "hi" }],
      model: "turn-claude",
      modelConfig: {
        maxTokens: 64,
        temperature: 0.2,
        top_p: 0.9,
        stopSequences: ["STOP"],
      },
    }));

    expect(body).toMatchObject({
      model: "turn-claude",
      max_tokens: 64,
      temperature: 0.2,
      top_p: 0.9,
      stop_sequences: ["STOP"],
    });
  });

  it("serializes tool definitions for Anthropic Messages", async () => {
    let body: Record<string, unknown> = {};
    const provider = new AnthropicMessagesProvider(
      config(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return sseResponse([
          { type: "message_start", message: { id: "msg-1" } },
          { type: "message_stop" },
        ]);
      })
    );

    await collect(provider.streamTurn({
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "read_file", description: "Read file", parameters: { type: "object" } }],
    }));

    expect(body.tools).toEqual([{
      name: "read_file",
      description: "Read file",
      input_schema: { type: "object" },
    }]);
  });
});

function config(fetchImpl: typeof fetch): RealProviderConfig {
  return {
    apiKey: "sk-ant-test",
    baseUrl: "https://example.test/v1",
    model: "claude-test",
    maxTokens: 16,
    timeoutMs: 1000,
    anthropicVersion: "2023-06-01",
    fetchImpl,
  };
}

function sseResponse(items: object[]): Response {
  const text = items.map((item) => `event: ${item.type}\ndata: ${JSON.stringify(item)}\n\n`).join("");
  return new Response(text, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}
