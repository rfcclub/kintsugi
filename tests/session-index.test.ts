import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionIndex } from "../src/store/index.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("SessionIndex", () => {
  it("appends index entries and keeps latest entry per session when listing", () => {
    const index = new SessionIndex({ root: tempRoot(), syncFile: () => undefined });

    index.appendStart({
      id: "kng-20260520t143052-a3f7",
      startedAt: "2026-05-20T14:30:52.000Z",
      provider: "mock",
      model: "mock",
    });
    index.appendStart({
      id: "kng-20260520t150000-b2e1",
      startedAt: "2026-05-20T15:00:00.000Z",
      provider: "openai",
      model: "gpt-4o",
    });
    index.appendEnd({
      id: "kng-20260520t143052-a3f7",
      startedAt: "2026-05-20T14:30:52.000Z",
      endedAt: "2026-05-20T14:32:00.000Z",
      messageCount: 3,
      provider: "mock",
      model: "mock",
      totalTokens: 42,
    });

    expect(index.read().entries).toHaveLength(3);
    expect(index.list()).toEqual([
      expect.objectContaining({
        id: "kng-20260520t150000-b2e1",
        endedAt: null,
        messageCount: 0,
      }),
      expect.objectContaining({
        id: "kng-20260520t143052-a3f7",
        endedAt: "2026-05-20T14:32:00.000Z",
        messageCount: 3,
        totalTokens: 42,
      }),
    ]);
  });

  it("skips malformed index lines and reports warnings", () => {
    const index = new SessionIndex({ root: tempRoot(), syncFile: () => undefined });
    index.appendStart({
      id: "kng-20260520t143052-a3f7",
      startedAt: "2026-05-20T14:30:52.000Z",
    });
    appendFileSync(index.indexPath, "{not json\n", "utf-8");

    const result = index.read();

    expect(result.entries).toHaveLength(1);
    expect(result.warnings).toBe(1);
  });
});

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "kintsugi-session-index-"));
  tempDirs.push(dir);
  return dir;
}
