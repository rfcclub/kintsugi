import { describe, expect, it } from "vitest";
import { OpenAIChatProvider } from "../src/providers/openai-chat.js";
import type { RealProviderConfig } from "../src/providers/config.js";

describe("OpenAIChatProvider", () => {
  it("streams chat completion chunks", async () => {
    let body: unknown;
    const provider = new OpenAIChatProvider(
      config(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return sseResponse([
          { id: "turn-1", choices: [{ delta: { content: "hel" }, index: 0 }] },
          { id: "turn-1", choices: [{ delta: { content: "lo" }, index: 0 }] },
          {
            id: "turn-1",
            choices: [{ delta: {}, finish_reason: "stop", index: 0 }],
          },
          { choices: [], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } },
          "[DONE]",
        ]);
      })
    );

    const events = await collect(provider.streamTurn({ messages: [{ role: "user", content: "hi" }] }));

    expect(body).toMatchObject({
      model: "test-model",
      stream: true,
    });
    expect(events.map((event) => event.type)).toEqual([
      "turn.started",
      "assistant.delta",
      "assistant.delta",
      "assistant.completed",
      "thinking.completed",
      "turn.completed",
    ]);
    expect(events.at(-1)).toEqual({
      type: "turn.completed",
      usage: { prompt: 2, completion: 3, total: 5 },
    });
  });

  it("maps length finish reason to a truncation event", async () => {
    const provider = new OpenAIChatProvider(
      config(async () =>
        sseResponse([
          { id: "turn-1", choices: [{ delta: { content: "hi" }, index: 0 }] },
          { id: "turn-1", choices: [{ delta: {}, finish_reason: "length", index: 0 }] },
          "[DONE]",
        ])
      )
    );

    const events = await collect(provider.streamTurn({ messages: [] }));

    expect(events).toContainEqual({ type: "turn.truncated", reason: "length" });
  });

  it("maps auth failure without leaking the key", async () => {
    const provider = new OpenAIChatProvider(
      config(async () => new Response("bad key sk-test", { status: 401 }))
    );

    const events = await collect(provider.streamTurn({ messages: [] }));

    expect(events).toEqual([{ type: "turn.failed", message: "Authentication failed" }]);
    expect(JSON.stringify(events)).not.toContain("sk-test");
  });

  it("serializes per-turn model config into chat request body", async () => {
    let body: Record<string, unknown> = {};
    const provider = new OpenAIChatProvider(
      config(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return sseResponse([
          { id: "turn-1", choices: [{ delta: {}, finish_reason: "stop", index: 0 }] },
          "[DONE]",
        ]);
      })
    );

    await collect(provider.streamTurn({
      messages: [{ role: "user", content: "hi" }],
      model: "turn-model",
      modelConfig: {
        maxTokens: 64,
        temperature: 0.2,
        top_p: 0.9,
        stopSequences: ["STOP"],
        presencePenalty: 0.1,
        frequencyPenalty: 0.2,
      },
    }));

    expect(body).toMatchObject({
      model: "turn-model",
      max_tokens: 64,
      temperature: 0.2,
      top_p: 0.9,
      stop: ["STOP"],
      presence_penalty: 0.1,
      frequency_penalty: 0.2,
    });
  });

  it("serializes tool definitions and continuation messages in Chat Completions format", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const provider = new OpenAIChatProvider(
      config(async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        return sseResponse([
          { id: "turn-1", choices: [{ delta: {}, finish_reason: "stop", index: 0 }] },
          "[DONE]",
        ]);
      })
    );

    await collect(provider.streamTurn({
      messages: [
        { role: "user", content: "read" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call-1", name: "read_file", args: { path: "src/cli/args.ts" } }],
        },
        { role: "tool", content: "file contents", toolCallId: "call-1" },
      ],
      tools: [{
        name: "read_file",
        description: "Read file",
        parameters: { type: "object", properties: { path: { type: "string" } } },
      }],
    }));

    expect(bodies[0].tools).toEqual([{
      type: "function",
      function: {
        name: "read_file",
        description: "Read file",
        parameters: { type: "object", properties: { path: { type: "string" } } },
      },
    }]);
    expect(bodies[0].messages).toEqual([
      { role: "user", content: "read" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{
          id: "call-1",
          type: "function",
          function: {
            name: "read_file",
            arguments: JSON.stringify({ path: "src/cli/args.ts" }),
          },
        }],
      },
      { role: "tool", content: "file contents", tool_call_id: "call-1" },
    ]);
  });
});

function config(fetchImpl: typeof fetch): RealProviderConfig {
  return {
    apiKey: "sk-test",
    baseUrl: "https://example.test/v1",
    model: "test-model",
    maxTokens: 16,
    timeoutMs: 1000,
    anthropicVersion: "2023-06-01",
    fetchImpl,
  };
}

function sseResponse(items: Array<object | string>): Response {
  const text = items
    .map((item) => `data: ${typeof item === "string" ? item : JSON.stringify(item)}\n\n`)
    .join("");
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
