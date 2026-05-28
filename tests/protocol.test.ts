import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "../src/protocol/events.js";
import type { RuntimeMessage } from "../src/protocol/messages.js";

describe("RuntimeEvent protocol", () => {
  it("covers all event types", () => {
    const types: RuntimeEvent["type"][] = [
      "turn.started",
      "assistant.delta",
      "assistant.completed",
      "thinking.delta",
      "thinking.completed",
      "tool.requested",
      "tool.completed",
      "turn.cancelled",
      "turn.failed",
      "turn.truncated",
      "turn.completed",
    ];

    expect(types).toHaveLength(11);
    expect(new Set(types).size).toBe(11);
  });

  it("narrows assistant.delta to text", () => {
    const event: RuntimeEvent = { type: "assistant.delta", text: "hello" };

    if (event.type === "assistant.delta") {
      expect(event.text).toBe("hello");
    }
  });

  it("narrows tool.requested to name and args", () => {
    const event: RuntimeEvent = {
      type: "tool.requested",
      id: "t1",
      name: "read_file",
      args: { path: "/tmp/x" },
    };

    if (event.type === "tool.requested") {
      expect(event.name).toBe("read_file");
      expect(event.args).toEqual({ path: "/tmp/x" });
    }
  });

  it("narrowing turn.completed includes optional usage", () => {
    const withUsage: RuntimeEvent = {
      type: "turn.completed",
      usage: { prompt: 10, completion: 20, total: 30 },
    };
    const withoutUsage: RuntimeEvent = { type: "turn.completed" };

    if (withUsage.type === "turn.completed") {
      expect(withUsage.usage?.total).toBe(30);
    }
    if (withoutUsage.type === "turn.completed") {
      expect(withoutUsage.usage).toBeUndefined();
    }
  });
});

describe("RuntimeMessage protocol", () => {
  it("supports all roles", () => {
    const roles: RuntimeMessage["role"][] = ["user", "assistant", "runtime", "tool"];

    expect(roles).toHaveLength(4);
  });

  it("carries text and timestamp", () => {
    const msg: RuntimeMessage = { role: "user", text: "hello", at: "2026-01-01T00:00:00Z" };

    expect(msg.text).toBe("hello");
    expect(msg.at).toBeTruthy();
  });
});
