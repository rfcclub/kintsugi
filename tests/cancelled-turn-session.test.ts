import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runTurn } from "../src/runtime/loop.js";
import { bootRuntime } from "../src/runtime/runtime.js";
import { SessionWriter, type SessionLine } from "../src/store/sessions.js";
import type { Provider, ProviderTurnRequest } from "../src/providers/provider.js";
import type { RuntimeEvent } from "../src/protocol/events.js";

describe("cancelled turn session recording", () => {
  it("records cancellation without an assistant message", async () => {
    const writer = new SessionWriter({
      root: mkdtempSync(join(tmpdir(), "kintsugi-cancel-")),
      id: "kng-20260522t120000-abcd",
      startedAt: new Date("2026-05-22T12:00:00.000Z"),
      syncFile: () => {},
    });
    const runtime = bootRuntime({ noSubstrate: true, sessionWriter: writer });
    const controller = new AbortController();
    const provider: Provider = {
      id: "cancel-after-completion",
      async *streamTurn(_request: ProviderTurnRequest): AsyncIterable<RuntimeEvent> {
        yield { type: "turn.started", id: "turn-cancel" };
        yield { type: "assistant.delta", text: "partial" };
        yield { type: "assistant.completed", text: "partial" };
        controller.abort();
        yield { type: "turn.completed" };
      },
    };

    const events = await collect(
      runTurn(runtime, provider, "stop before commit", undefined, {
        signal: controller.signal,
        cancelReason: "ctrl-c",
      })
    );
    writer.close();

    const lines = readSessionLines(writer.filePath);

    expect(events).toContainEqual({ type: "turn.cancelled", reason: "ctrl-c" });
    expect(runtime.prompts.map((message) => message.role)).toEqual(["user"]);
    expect(
      lines.some((line) => line.type === "message" && line.role === "assistant")
    ).toBe(false);
    expect(lines).toContainEqual({
      type: "event",
      event: { type: "turn.cancelled", reason: "ctrl-c" },
    });
  });
});

function readSessionLines(path: string): SessionLine[] {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SessionLine);
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}
