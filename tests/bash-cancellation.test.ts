import { describe, expect, it } from "vitest";
import { bootRuntime } from "../src/runtime/runtime.js";
import { runTurn } from "../src/runtime/loop.js";
import { PermissionPolicy } from "../src/runtime/permissions.js";
import type { Provider, ProviderTurnRequest } from "../src/providers/provider.js";
import type { RuntimeEvent } from "../src/protocol/events.js";

describe("bash tool cancellation", () => {
  it("passes AbortSignal to BashTool and aborts a long-running command", async () => {
    const runtime = bootRuntime({ noSubstrate: true });
    runtime.permissionPolicy = new PermissionPolicy({
      defaultDecision: "deny",
      rules: [{ tool: "bash", decision: "allow" }],
    });

    const controller = new AbortController();
    const provider = toolProvider({
      type: "tool.requested",
      id: "bash-cancel",
      name: "bash",
      args: {
        command: `${JSON.stringify(process.execPath)} -e "setTimeout(() => {}, 10000)"`,
        timeoutMs: 10_000,
      },
    });

    const startedAt = Date.now();
    const eventsPromise = collect(
      runTurn(runtime, provider, "run a slow command", undefined, {
        signal: controller.signal,
        cancelReason: "stop",
      })
    );

    setTimeout(() => controller.abort(), 50);
    const events = await eventsPromise;

    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(events).toContainEqual({ type: "turn.cancelled", reason: "stop" });
    expect(events.some((event) => event.type === "tool.completed")).toBe(false);
    expect(runtime.prompts.map((message) => message.role)).toEqual(["user"]);
  });
});

function toolProvider(tool: Extract<RuntimeEvent, { type: "tool.requested" }>): Provider {
  return {
    id: "tool-provider",
    async *streamTurn(_request: ProviderTurnRequest): AsyncIterable<RuntimeEvent> {
      yield { type: "turn.started", id: "turn-tool" };
      yield tool;
      yield { type: "assistant.completed", text: "late" };
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
