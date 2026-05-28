import { describe, expect, it } from "vitest";
import { bootRuntime } from "../src/runtime/runtime.js";
import { runTurn } from "../src/runtime/loop.js";
import { MockProvider } from "../src/providers/mock.js";
import { OpenAIChatProvider } from "../src/providers/openai-chat.js";
import type { Provider, ProviderTurnRequest } from "../src/providers/provider.js";
import type { RuntimeEvent } from "../src/protocol/events.js";
import { PermissionPolicy } from "../src/runtime/permissions.js";

describe("runTurn", () => {
  it("yields provider events and records user and assistant messages", async () => {
    const runtime = bootRuntime({ noSubstrate: true });
    const provider = new MockProvider({ responseText: "hi there", delayMs: 0 });

    const events = await collect(runTurn(runtime, provider, "hello"));

    expect(events.map((event) => event.type)).toEqual([
      "turn.started",
      "assistant.delta",
      "assistant.completed",
      "turn.completed",
    ]);
    expect(runtime.prompts.map((message) => [message.role, message.text])).toEqual([
      ["user", "hello"],
      ["assistant", "hi there"],
    ]);
  });

  it("sends assembled prompt messages to the provider", async () => {
    const runtime = bootRuntime({ noSubstrate: true });
    let captured: ProviderTurnRequest | undefined;
    const provider: Provider = {
      id: "capture",
      async *streamTurn(request: ProviderTurnRequest): AsyncIterable<RuntimeEvent> {
        captured = request;
        yield { type: "assistant.completed", text: "done" };
      },
    };

    await collect(runTurn(runtime, provider, "hello"));

    expect(captured?.messages.at(0)).toMatchObject({
      role: "system",
    });
    expect(captured?.messages.at(-1)).toEqual({
      role: "user",
      content: "hello",
    });
  });

  it("includes Echo through the prompt assembler", async () => {
    const runtime = bootRuntime({ noSubstrate: true });
    runtime.substrate = { path: "echo", content: "Kintsugi Echo" };
    let captured: ProviderTurnRequest | undefined;
    const provider: Provider = {
      id: "capture",
      async *streamTurn(request: ProviderTurnRequest): AsyncIterable<RuntimeEvent> {
        captured = request;
        yield { type: "assistant.completed", text: "done" };
      },
    };

    await collect(runTurn(runtime, provider, "hello"));

    expect(captured?.messages).toContainEqual({
      role: "system",
      content: "Kintsugi Echo",
    });
  });

  it("records accumulated deltas if a provider omits assistant.completed", async () => {
    const runtime = bootRuntime({ noSubstrate: true });
    const provider: Provider = {
      id: "delta-only",
      async *streamTurn(_request: ProviderTurnRequest): AsyncIterable<RuntimeEvent> {
        yield { type: "turn.started", id: "turn-1" };
        yield { type: "assistant.delta", text: "hel" };
        yield { type: "assistant.delta", text: "lo" };
        yield { type: "turn.completed" };
      },
    };

    await collect(runTurn(runtime, provider, "say hi"));

    expect(runtime.prompts.at(-1)).toMatchObject({
      role: "assistant",
      text: "hello",
    });
  });

  it("records runtime failures without assistant messages", async () => {
    const runtime = bootRuntime({ noSubstrate: true });
    const provider = new MockProvider({ failAfter: 0, delayMs: 0 });

    await collect(runTurn(runtime, provider, "hello"));

    expect(runtime.prompts.map((message) => message.role)).toEqual([
      "user",
      "runtime",
    ]);
    expect(runtime.prompts.at(-1)?.text).toBe("Mock provider failure");
  });

  it("works with a real-provider adapter using mocked fetch", async () => {
    const runtime = bootRuntime({ noSubstrate: true });
    const provider = new OpenAIChatProvider({
      apiKey: "sk-test",
      baseUrl: "https://example.test/v1",
      model: "test-model",
      maxTokens: 16,
      timeoutMs: 1000,
      anthropicVersion: "2023-06-01",
      fetchImpl: async () =>
        new Response(
          [
            'data: {"id":"turn-1","choices":[{"delta":{"content":"hi"},"index":0}]}',
            "",
            'data: {"id":"turn-1","choices":[{"delta":{},"finish_reason":"stop","index":0}]}',
            "",
            "data: [DONE]",
            "",
          ].join("\n"),
          { status: 200 }
        ),
    });

    await collect(runTurn(runtime, provider, "hello"));

    expect(runtime.prompts.map((message) => [message.role, message.text])).toEqual([
      ["user", "hello"],
      ["assistant", "hi"],
    ]);
  });

  it("executes allowed read-only tool requests", async () => {
    const runtime = bootRuntime();
    const provider = toolProvider({
      type: "tool.requested",
      id: "tc-1",
      name: "read_file",
      args: { path: "package.json", limit: 1 },
    });

    const events = await collect(runTurn(runtime, provider, "read package"));
    const completed = events.find((event) => event.type === "tool.completed");

    expect(completed).toMatchObject({
      type: "tool.completed",
      id: "tc-1",
    });
    expect(completed && "output" in completed ? completed.output : "").toContain("{");
  });

  it("denies ask-permission tools without a decider", async () => {
    const runtime = bootRuntime();
    const provider = toolProvider({
      type: "tool.requested",
      id: "tc-2",
      name: "write_file",
      args: { path: "tmp.txt", content: "nope" },
    });

    const events = await collect(runTurn(runtime, provider, "write"));

    expect(events).toContainEqual({
      type: "tool.completed",
      id: "tc-2",
      output: "Permission denied",
    });
  });

  it("uses runtime permission decider for ask-permission tools", async () => {
    const runtime = bootRuntime();
    runtime.permissionPolicy = new PermissionPolicy({
      defaultDecision: "ask",
      rules: [{ tool: "read_file", decision: "ask" }],
    });
    runtime.permissionDecider = async () => "allow";
    const provider = toolProvider({
      type: "tool.requested",
      id: "tc-3",
      name: "read_file",
      args: { path: "package.json", limit: 1 },
    });

    const events = await collect(runTurn(runtime, provider, "read"));
    const completed = events.find((event) => event.type === "tool.completed");

    expect(completed && "output" in completed ? completed.output : "").toContain("{");
  });

  it("passes abort signals to providers and emits cancellation", async () => {
    const runtime = bootRuntime({ noSubstrate: true });
    const controller = new AbortController();
    let providerSawSignal = false;
    const provider: Provider = {
      id: "abort-provider",
      async *streamTurn(request: ProviderTurnRequest): AsyncIterable<RuntimeEvent> {
        providerSawSignal = request.signal === controller.signal;
        yield { type: "turn.started", id: "turn-abort" };
        controller.abort();
        yield { type: "assistant.delta", text: "late" };
      },
    };

    const events = await collect(runTurn(runtime, provider, "stop me", undefined, {
      signal: controller.signal,
      cancelReason: "stop",
    }));

    expect(providerSawSignal).toBe(true);
    expect(events).toContainEqual({ type: "turn.cancelled", reason: "stop" });
    expect(runtime.prompts.map((message) => message.role)).toEqual(["user"]);
  });

  it("does not execute a pending permission after cancellation", async () => {
    const runtime = bootRuntime({ noSubstrate: true });
    const controller = new AbortController();
    runtime.permissionPolicy = new PermissionPolicy({
      defaultDecision: "ask",
      rules: [{ tool: "write_file", decision: "ask" }],
    });
    runtime.permissionDecider = async (_tool, _args, signal) => {
      controller.abort();
      expect(signal?.aborted).toBe(true);
      return "allow";
    };
    const provider = toolProvider({
      type: "tool.requested",
      id: "tc-cancel",
      name: "write_file",
      args: { path: "tmp.txt", content: "nope" },
    });

    const events = await collect(runTurn(runtime, provider, "write", undefined, {
      signal: controller.signal,
      cancelReason: "permission",
    }));

    expect(events).toContainEqual({ type: "turn.cancelled", reason: "permission" });
    expect(events.some((event) => event.type === "tool.completed")).toBe(false);
  });
});

function toolProvider(tool: Extract<RuntimeEvent, { type: "tool.requested" }>): Provider {
  return {
    id: "tool-provider",
    async *streamTurn(_request: ProviderTurnRequest): AsyncIterable<RuntimeEvent> {
      yield { type: "turn.started", id: "turn-tool" };
      yield tool;
      yield { type: "assistant.completed", text: "done" };
      yield { type: "turn.completed" };
    },
  };
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}
