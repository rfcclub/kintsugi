import { describe, expect, it } from "vitest";
import { bootRuntime } from "../src/runtime/runtime.js";
import { runTurn } from "../src/runtime/loop.js";
import { OpenAIChatProvider } from "../src/providers/openai-chat.js";
import { OpenAIResponsesProvider } from "../src/providers/openai-responses.js";
import { AnthropicMessagesProvider } from "../src/providers/anthropic-messages.js";
import type { Provider } from "../src/providers/provider.js";
import type { RealProviderConfig } from "../src/providers/config.js";

describe("provider conformance", () => {
  it.each([
    ["openai-chat", () => new OpenAIChatProvider(config(async () => sse([
      data({ id: "chat", choices: [{ delta: { content: "CHAT_OK" }, index: 0 }] }),
      data({ id: "chat", choices: [{ delta: {}, finish_reason: "stop", index: 0 }] }),
      data("[DONE]"),
    ])))],
    ["openai-responses", () => new OpenAIResponsesProvider(config(async () => sse([
      event("response.created", { type: "response.created", response: { id: "responses" } }),
      event("response.output_text.delta", { type: "response.output_text.delta", delta: "RESPONSES_OK" }),
      event("response.completed", { type: "response.completed", response: { status: "completed" } }),
      data("[DONE]"),
    ])))],
    ["anthropic-messages", () => new AnthropicMessagesProvider(config(async () => sse([
      event("message_start", { type: "message_start", message: { id: "anthropic" } }),
      event("content_block_delta", { type: "content_block_delta", delta: { type: "text_delta", text: "ANTHROPIC_OK" } }),
      event("message_stop", { type: "message_stop" }),
    ])))],
  ] satisfies Array<[string, () => Provider]>)("streams assistant output for %s", async (_name, create) => {
    const output = await assistantOutput(create());
    expect(output).toContain("_OK");
  });

  it("continues an OpenAI Chat tool call with the read_file result", async () => {
    const provider = new OpenAIChatProvider(config(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      const last = body.messages.at(-1);
      if (last?.role === "tool") {
        expect(last.content).toContain("ProviderType");
        return sse([
          data({ id: "chat", choices: [{ delta: { content: "TOOL_OK" }, index: 0 }] }),
          data({ id: "chat", choices: [{ delta: {}, finish_reason: "stop", index: 0 }] }),
          data("[DONE]"),
        ]);
      }
      expect(body.tools.some((tool: { type?: string; function?: { name?: string } }) =>
        tool.type === "function" && tool.function?.name === "read_file"
      )).toBe(true);
      return sse([
        data({
          id: "tool",
          choices: [{
            delta: {
              tool_calls: [{
                id: "call-read",
                function: { name: "read_file", arguments: JSON.stringify({ path: "src/cli/args.ts", limit: 12 }) },
              }],
            },
            finish_reason: "tool_calls",
            index: 0,
          }],
        }),
        data("[DONE]"),
      ]);
    }));

    const output = await assistantOutput(provider);
    expect(output).toContain("TOOL_OK");
  });

  it("continues an OpenAI Responses tool call with the read_file result", async () => {
    const provider = new OpenAIResponsesProvider(config(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      const last = body.input.at(-1);
      if (last?.type === "function_call_output") {
        expect(last.output).toContain("ProviderType");
        return sse([
          event("response.created", { type: "response.created", response: { id: "responses-tool" } }),
          event("response.output_text.delta", { type: "response.output_text.delta", delta: "RESPONSES_TOOL_OK" }),
          event("response.completed", { type: "response.completed", response: { status: "completed" } }),
          data("[DONE]"),
        ]);
      }
      expect(body.tools.some((tool: { type?: string; name?: string }) =>
        tool.type === "function" && tool.name === "read_file"
      )).toBe(true);
      return sse([
        event("response.created", { type: "response.created", response: { id: "responses-tool" } }),
        event("response.output_item.done", {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-read-responses",
            name: "read_file",
            arguments: JSON.stringify({ path: "src/cli/args.ts", limit: 12 }),
          },
        }),
        data("[DONE]"),
      ]);
    }));

    const output = await assistantOutput(provider);
    expect(output).toContain("RESPONSES_TOOL_OK");
  });

  it("continues an Anthropic Messages tool call with the read_file result", async () => {
    const provider = new AnthropicMessagesProvider(config(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      const last = body.messages.at(-1);
      if (last?.role === "user" && Array.isArray(last.content)) {
        const toolResult = last.content.find((part: { type?: string }) => part.type === "tool_result");
        if (toolResult) {
          expect(toolResult.content).toContain("ProviderType");
          return sse([
            event("message_start", { type: "message_start", message: { id: "anthropic-tool" } }),
            event("content_block_delta", { type: "content_block_delta", delta: { type: "text_delta", text: "ANTHROPIC_TOOL_OK" } }),
            event("message_stop", { type: "message_stop" }),
          ]);
        }
      }
      expect(body.tools.some((tool: { name?: string; input_schema?: unknown }) =>
        tool.name === "read_file" && tool.input_schema
      )).toBe(true);
      return sse([
        event("message_start", { type: "message_start", message: { id: "anthropic-tool" } }),
        event("content_block_start", {
          type: "content_block_start",
          content_block: {
            type: "tool_use",
            id: "call-read-anthropic",
            name: "read_file",
            input: { path: "src/cli/args.ts", limit: 12 },
          },
        }),
        event("message_stop", { type: "message_stop" }),
      ]);
    }));

    const output = await assistantOutput(provider);
    expect(output).toContain("ANTHROPIC_TOOL_OK");
  });

  it("emits turn.cancelled and stops continuation after cancellation", async () => {
    const controller = new AbortController();
    let calls = 0;
    const provider: Provider = {
      id: "slow-conformance",
      async *streamTurn() {
        calls += 1;
        yield { type: "turn.started", id: "slow" };
        controller.abort();
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
    };

    const events = await collect(runTurn(runtime(), provider, "cancel", undefined, {
      signal: controller.signal,
      cancelReason: "stop",
    }));

    expect(events).toContainEqual({ type: "turn.cancelled", reason: "stop" });
    expect(calls).toBe(1);
  });

  it("redacts provider errors and normalizes trailing base URL slashes", async () => {
    let requestedUrl = "";
    const provider = new OpenAIChatProvider(config(async (input) => {
      requestedUrl = String(input);
      throw new Error("bad key sk-test");
    }, { baseUrl: "https://example.test/v1///" }));

    const events = await collect(provider.streamTurn({ messages: [{ role: "user", content: "hi" }] }));

    expect(requestedUrl).toBe("https://example.test/v1/chat/completions");
    expect(JSON.stringify(events)).toContain("[REDACTED]");
    expect(JSON.stringify(events)).not.toContain("sk-test");
  });
});

async function assistantOutput(provider: Provider): Promise<string> {
  const events = await collect(runTurn(runtime(), provider, "hi"));
  const failed = events.find((event) => event.type === "turn.failed");
  expect(failed).toBeUndefined();
  return events
    .filter((event) => event.type === "assistant.delta" || event.type === "assistant.completed")
    .map((event) => event.text)
    .join("");
}

function runtime() {
  return bootRuntime({ noSubstrate: true, workspaceRoots: [process.cwd()] });
}

function config(fetchImpl: typeof fetch, overrides: Partial<RealProviderConfig> = {}): RealProviderConfig {
  return {
    apiKey: "sk-test",
    baseUrl: "https://example.test/v1",
    model: "test-model",
    maxTokens: 16,
    timeoutMs: 1000,
    anthropicVersion: "2023-06-01",
    fetchImpl,
    ...overrides,
  };
}

function sse(chunks: string[]): Response {
  return new Response(chunks.join(""), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function data(payload: unknown): string {
  return `data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`;
}

function event(name: string, payload: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}
