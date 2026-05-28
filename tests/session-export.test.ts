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
});

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "kintsugi-session-export-"));
  tempDirs.push(dir);
  return dir;
}
