import { describe, expect, it } from "vitest";
import {
  OpenAIResponsesProvider,
  toResponsesInput,
} from "../src/providers/openai-responses.js";
import type { RealProviderConfig } from "../src/providers/config.js";

describe("OpenAIResponsesProvider", () => {
  it("translates provider messages into Responses input", () => {
    expect(
      toResponsesInput([
        { role: "system", content: "system" },
        { role: "user", content: "user" },
        { role: "assistant", content: "assistant" },
        { role: "tool", content: "tool output", toolCallId: "call-1" },
      ])
    ).toEqual([
      { role: "developer", content: "system" },
      { role: "user", content: "user" },
      { role: "assistant", content: "assistant" },
      { type: "function_call_output", call_id: "call-1", output: "tool output" },
    ]);
  });

  it("streams Responses API events", async () => {
    let body: unknown;
    const provider = new OpenAIResponsesProvider(
      config(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return sseResponse([
          { type: "response.created", response: { id: "resp-1" } },
          { type: "response.output_text.delta", delta: "hi" },
          {
            type: "response.completed",
            response: {
              usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
            },
          },
        ]);
      })
    );

    const events = await collect(provider.streamTurn({ messages: [{ role: "user", content: "hi" }] }));

    expect(body).toMatchObject({
      model: "test-model",
      stream: true,
      max_output_tokens: 16,
      input: [{ role: "user", content: "hi" }],
    });
    expect(events).toEqual([
      { type: "turn.started", id: "resp-1" },
      { type: "assistant.delta", text: "hi" },
      { type: "thinking.completed", text: "" },
      { type: "assistant.completed", text: "hi" },
      { type: "turn.completed", usage: { prompt: 4, completion: 2, total: 6 } },
    ]);
  });

  it("maps incomplete max token status to truncation", async () => {
    const provider = new OpenAIResponsesProvider(
      config(async () =>
        sseResponse([
          { type: "response.created", response: { id: "resp-1" } },
          {
            type: "response.completed",
            response: {
              status: "incomplete",
              incomplete_details: { reason: "max_output_tokens" },
            },
          },
        ])
      )
    );

    const events = await collect(provider.streamTurn({ messages: [] }));

    expect(events).toContainEqual({
      type: "turn.truncated",
      reason: "max_output_tokens",
    });
  });

  it("serializes per-turn model config into Responses request body", async () => {
    let body: Record<string, unknown> = {};
    const provider = new OpenAIResponsesProvider(
      config(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return sseResponse([
          { type: "response.created", response: { id: "resp-1" } },
          { type: "response.completed", response: {} },
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
      max_output_tokens: 64,
      temperature: 0.2,
      top_p: 0.9,
      stop: ["STOP"],
      presence_penalty: 0.1,
      frequency_penalty: 0.2,
    });
  });

  it("serializes tool definitions and assistant tool calls for Responses", async () => {
    let body: Record<string, unknown> = {};
    const provider = new OpenAIResponsesProvider(
      config(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return sseResponse([
          { type: "response.created", response: { id: "resp-1" } },
          { type: "response.completed", response: {} },
        ]);
      })
    );

    await collect(provider.streamTurn({
      messages: [
        { role: "assistant", content: "", toolCalls: [{ id: "call-1", name: "read_file", args: { path: "x" } }] },
        { role: "tool", content: "file contents", toolCallId: "call-1" },
      ],
      tools: [{ name: "read_file", description: "Read file", parameters: { type: "object" } }],
    }));

    expect(body.tools).toEqual([{
      type: "function",
      name: "read_file",
      description: "Read file",
      parameters: { type: "object" },
    }]);
    expect(body.input).toEqual([
      { type: "function_call", call_id: "call-1", name: "read_file", arguments: JSON.stringify({ path: "x" }) },
      { type: "function_call_output", call_id: "call-1", output: "file contents" },
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
