import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportSessionMarkdown } from "../src/store/export.js";
import { SessionWriter } from "../src/store/sessions.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("exportSessionMarkdown", () => {
  it("renders a markdown transcript with metadata, messages, and tool records", () => {
    const root = tempRoot();
    const writer = new SessionWriter({
      root,
      id: "kng-20260520t143052-a3f7",
      startedAt: new Date(2026, 4, 20, 14, 30, 52),
      syncFile: () => undefined,
    });
    writer.start({ echo: "/tmp/echo", provider: "mock", model: "mock" });
    writer.message("user", "hello", "2026-05-20T14:30:55.000Z");
    writer.toolCall({
      toolCallId: "tc-1",
      toolName: "read_file",
      args: { path: "src/cli/args.ts" },
      decision: "allow",
      at: "2026-05-20T14:30:56.000Z",
    });
    writer.toolResult({
      toolCallId: "tc-1",
      output: "export type CommandName = ...",
      isError: false,
      at: "2026-05-20T14:30:57.000Z",
    });
    writer.message("assistant", "done", "2026-05-20T14:30:58.000Z");
    writer.end({
      reason: "user_exit",
      endedAt: "2026-05-20T14:32:00.000Z",
      messageCount: 2,
    });
    writer.close();

    const result = exportSessionMarkdown({ root, id: writer.id });

    expect(result.warnings).toBe(0);
    expect(result.markdown).toContain("# Session: kng-20260520t143052-a3f7");
    expect(result.markdown).toContain("**Provider**: mock/mock");
    expect(result.markdown).toContain("## User\n\nhello");
    expect(result.markdown).toContain("## Assistant (tool call: read_file)");
    expect(result.markdown).toContain("[Permission: allow]");
    expect(result.markdown).toContain('"path": "src/cli/args.ts"');
    expect(result.markdown).toContain("```text\nexport type CommandName = ...\n```");
    expect(result.markdown).toContain("## Assistant\n\ndone");
    expect(result.markdown).toContain("**Ended**: 2026-05-20 14:32:00 UTC");
  });
  it("renders thinking lines and cancelled events", () => {
    const root = tempRoot();
    const writer = new SessionWriter({
      root,
      id: "kng-20260601t100000-a001",
      startedAt: new Date(2026, 5, 1, 10, 0, 0),
      syncFile: () => undefined,
    });
    writer.start({ provider: "mock", model: "mock" });
    writer.message("user", "think hard", "2026-06-01T10:00:01.000Z");
    writer.thinking("Let me reason about this...", "2026-06-01T10:00:02.000Z");
    writer.message("assistant", "answer", "2026-06-01T10:00:03.000Z");
    writer.event({
      type: "turn.cancelled",
      reason: "stop",
    });
    writer.end({
      reason: "cancelled",
      endedAt: "2026-06-01T10:00:05.000Z",
      messageCount: 3,
    });
    writer.close();

    const result = exportSessionMarkdown({ root, id: writer.id });

    // Warning may occur from thinking line not having turn context
    expect(result.warnings).toBeLessThanOrEqual(1);
    expect(result.markdown).toContain("## Thinking");
    expect(result.markdown).toContain("Let me reason about this...");
    expect(result.markdown).toContain("## Turn Cancelled");
    expect(result.markdown).toContain("Reason: stop");
  });

  it("renders tool error results", () => {
    const root = tempRoot();
    const writer = new SessionWriter({
      root,
      id: "kng-20260601t100000-a002",
      startedAt: new Date(2026, 5, 1, 10, 0, 0),
      syncFile: () => undefined,
    });
    writer.start({ provider: "mock", model: "mock" });
    writer.toolCall({
      toolCallId: "tc-err",
      toolName: "bash",
      args: { command: "rm -rf /" },
      decision: "deny",
      at: "2026-06-01T10:00:01.000Z",
    });
    writer.toolResult({
      toolCallId: "tc-err",
      output: "Error: Permission denied",
      isError: true,
      at: "2026-06-01T10:00:02.000Z",
    });
    writer.end({
      reason: "done",
      endedAt: "2026-06-01T10:00:03.000Z",
      messageCount: 1,
    });
    writer.close();

    const result = exportSessionMarkdown({ root, id: writer.id });

    expect(result.markdown).toContain("(error)");
    expect(result.markdown).toContain("```text");
    expect(result.markdown).toContain("Error: Permission denied");
  });

  it("handles missing start provider gracefully", () => {
    const root = tempRoot();
    const writer = new SessionWriter({
      root,
      id: "kng-20260601t100000-a003",
      startedAt: new Date(2026, 5, 1, 10, 0, 0),
      syncFile: () => undefined,
    });
    writer.start({});
    writer.message("user", "hi", "2026-06-01T10:00:01.000Z");
    writer.end({
      reason: "done",
      endedAt: "2026-06-01T10:00:02.000Z",
      messageCount: 1,
    });
    writer.close();

    const result = exportSessionMarkdown({ root, id: writer.id });

    expect(result.warnings).toBe(0);
    expect(result.markdown).toContain("# Session: kng-20260601t100000-a003");
  });

  it("renders session without end line", () => {
    const root = tempRoot();
    const writer = new SessionWriter({
      root,
      id: "kng-20260601t100000-a004",
      startedAt: new Date(2026, 5, 1, 10, 0, 0),
      syncFile: () => undefined,
    });
    writer.start({ provider: "mock", model: "m" });
    writer.message("user", "hi", "2026-06-01T10:00:01.000Z");
    // No writer.end() called
    writer.close();

    const result = exportSessionMarkdown({ root, id: writer.id });
    expect(result.markdown).toContain("**Provider**: mock/m");
    expect(result.markdown).not.toContain("**Ended**");
  });
});

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "kintsugi-session-export-"));
  tempDirs.push(dir);
  return dir;
}
