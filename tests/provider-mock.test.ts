import { describe, expect, it } from "vitest";
import { MockProvider } from "../src/providers/mock.js";

describe("MockProvider", () => {
  it("streams a deterministic event sequence", async () => {
    const provider = new MockProvider({ responseText: "hello world", delayMs: 0 });

    const events = await collect(provider.streamTurn({ messages: [] }));

    expect(events.map((event) => event.type)).toEqual([
      "turn.started",
      "assistant.delta",
      "assistant.delta",
      "assistant.completed",
      "turn.completed",
    ]);
    expect(events.find((event) => event.type === "assistant.completed")).toEqual({
      type: "assistant.completed",
      text: "hello world",
    });
  });

  it("supports failure injection", async () => {
    const provider = new MockProvider({ failAfter: 0, delayMs: 0 });

    const events = await collect(provider.streamTurn({ messages: [] }));

    expect(events.map((event) => event.type)).toEqual([
      "turn.started",
      "turn.failed",
    ]);
  });

  it("can emit a configured tool call", async () => {
    const provider = new MockProvider({
      responseText: "using tool",
      delayMs: 0,
      toolCall: { name: "read_file", args: { path: "README.md" } },
    });

    const events = await collect(provider.streamTurn({ messages: [] }));
    const toolRequested = events.find((event) => event.type === "tool.requested");
    const toolCompleted = events.find((event) => event.type === "tool.completed");

    expect(toolRequested).toMatchObject({
      type: "tool.requested",
      name: "read_file",
      args: { path: "README.md" },
    });
    expect(toolCompleted).toMatchObject({
      type: "tool.completed",
      output: "mock tool output",
    });
  });
});

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}
