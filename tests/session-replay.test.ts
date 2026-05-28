import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { replaySession, SessionNotFoundError } from "../src/store/replay.js";
import { SessionWriter } from "../src/store/sessions.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("replaySession", () => {
  it("reconstructs runtime messages and reloads Echo from session.start", () => {
    const root = tempRoot();
    const echo = tempFile("Kintsugi Echo");
    const writer = new SessionWriter({
      root,
      id: "kng-20260520t143052-a3f7",
      startedAt: new Date(2026, 4, 20, 14, 30, 52),
      syncFile: () => undefined,
    });
    writer.start({ echo, provider: "mock", model: "mock" });
    writer.message("user", "hello", "2026-05-20T14:30:55.000Z");
    writer.message("assistant", "hi", "2026-05-20T14:30:56.000Z");
    writer.close();

    const result = replaySession({ root, id: writer.id });

    expect(result.provider).toBe("mock");
    expect(result.model).toBe("mock");
    expect(result.warnings).toBe(0);
    expect(result.runtime.substrate).toEqual({ path: echo, content: "Kintsugi Echo" });
    expect(result.runtime.prompts.map((message) => [message.role, message.text])).toEqual([
      ["user", "hello"],
      ["assistant", "hi"],
    ]);
  });

  it("skips malformed lines and exposes a warning counter", () => {
    const root = tempRoot();
    const writer = new SessionWriter({
      root,
      id: "kng-20260520t143052-a3f7",
      startedAt: new Date(2026, 4, 20, 14, 30, 52),
      syncFile: () => undefined,
    });
    writer.start({ provider: "mock" });
    writer.message("user", "hello", "2026-05-20T14:30:55.000Z");
    writer.close();
    appendFileSync(writer.filePath, '{"type":"message","role":\n', "utf-8");
    appendFileSync(
      writer.filePath,
      JSON.stringify({ type: "message", role: "assistant", text: "hi", at: "2026-05-20T14:30:56.000Z" }) +
        "\n",
      "utf-8"
    );

    const result = replaySession({ filePath: writer.filePath });

    expect(result.warnings).toBe(1);
    expect(result.runtime.prompts.map((message) => message.text)).toEqual(["hello", "hi"]);
  });

  it("throws a clear session-not-found error for missing files", () => {
    expect(() =>
      replaySession({ root: tempRoot(), id: "kng-20260520t143052-a3f7" })
    ).toThrow(SessionNotFoundError);
    expect(() =>
      replaySession({ root: tempRoot(), id: "kng-20260520t143052-a3f7" })
    ).toThrow("Session not found: kng-20260520t143052-a3f7");
  });
});

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "kintsugi-session-replay-"));
  tempDirs.push(dir);
  return dir;
}

function tempFile(content: string): string {
  const dir = tempRoot();
  const file = join(dir, "echo.md");
  writeFileSync(file, content, "utf-8");
  return file;
}
