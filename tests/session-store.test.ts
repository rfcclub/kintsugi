import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateSessionId,
  SessionWriter,
  sessionPathForDate,
} from "../src/store/sessions.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("SessionWriter", () => {
  it("generates kintsugi session ids with local timestamp and random hex", () => {
    const id = generateSessionId(new Date(2026, 4, 20, 14, 30, 52), "a3f7");

    expect(id).toBe("kng-20260520t143052-a3f7");
    expect(generateSessionId()).toMatch(/^kng-\d{8}t\d{6}-[0-9a-f]{4}$/);
  });

  it("appends JSONL lines under date directories and flushes every write", () => {
    const root = tempRoot();
    const startedAt = new Date(2026, 4, 20, 14, 30, 52);
    let syncs = 0;
    const writer = new SessionWriter({
      root,
      id: "kng-20260520t143052-a3f7",
      startedAt,
      syncFile: () => {
        syncs += 1;
      },
    });

    writer.start({ echo: "/tmp/echo", provider: "mock", model: "mock" });
    writer.message("user", "hello", "2026-05-20T14:30:55.000Z");
    writer.event({ type: "assistant.completed", text: "hi" });
    writer.toolCall({
      toolCallId: "tc-1",
      toolName: "read_file",
      args: { path: "src/cli/args.ts" },
      decision: "allow",
      at: "2026-05-20T14:30:56.000Z",
    });
    writer.toolResult({
      toolCallId: "tc-1",
      output: "content",
      isError: false,
      at: "2026-05-20T14:30:57.000Z",
    });
    writer.end({
      reason: "user_exit",
      endedAt: "2026-05-20T14:31:00.000Z",
      messageCount: 2,
    });
    writer.close();

    expect(syncs).toBe(6);
    expect(writer.filePath).toBe(
      sessionPathForDate(root, startedAt, "kng-20260520t143052-a3f7")
    );

    const lines = readJsonl(writer.filePath);
    expect(lines.map((line) => line.type)).toEqual([
      "session.start",
      "message",
      "event",
      "tool.call",
      "tool.result",
      "session.end",
    ]);
    expect(lines[0]).toMatchObject({
      id: "kng-20260520t143052-a3f7",
      echo: "/tmp/echo",
      provider: "mock",
      model: "mock",
    });
  });
});

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "kintsugi-session-store-"));
  tempDirs.push(dir);
  return dir;
}

function readJsonl(filePath: string): Array<Record<string, unknown>> {
  return readFileSync(filePath, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
