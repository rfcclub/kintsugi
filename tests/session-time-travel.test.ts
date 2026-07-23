import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

import {
  SessionWriter,
  truncateSessionLog,
  branchSession,
} from "../src/store/sessions.js";
import { replaySession } from "../src/store/replay.js";
import { bootRuntime } from "../src/runtime/runtime.js";
import { runTurn } from "../src/runtime/loop.js";
import { MockProvider } from "../src/providers/mock.js";
import { rollbackToTurn } from "../src/runtime/git-rollback.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "kintsugi-time-travel-"));
  tempDirs.push(dir);
  return dir;
}

function initGitRepo(dir: string) {
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name 'Kintsugi Test'", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email 'test@kintsugi.local'", { cwd: dir, stdio: "pipe" });
  writeFileSync(join(dir, "README.md"), "# Test Repo\n", "utf-8");
  execSync("git add README.md", { cwd: dir, stdio: "pipe" });
  execSync("git commit -m 'initial commit'", { cwd: dir, stdio: "pipe" });
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

describe("Session Time Travel and Branching", () => {
  describe("Task 1: Log Truncation and Hydration", () => {
    it("truncating session JSONL to turnIndex removes all lines starting from the user prompt of turnIndex + 1", () => {
      const root = tempRoot();
      const startedAt = new Date(2026, 4, 20, 14, 30, 52);
      const writer = new SessionWriter({
        root,
        id: "kng-20260520t143052-a3f7",
        startedAt,
        syncFile: () => undefined,
      });

      writer.start({ provider: "mock", model: "mock" });
      
      // Turn 1
      writer.currentTurn = 1;
      writer.message("user", "prompt 1");
      writer.message("assistant", "response 1");
      
      // Turn 2
      writer.currentTurn = 2;
      writer.message("user", "prompt 2");
      writer.message("assistant", "response 2");

      // Turn 3
      writer.currentTurn = 3;
      writer.message("user", "prompt 3");
      writer.message("assistant", "response 3");

      writer.close();

      // Truncate to turn 2 (should remove turn 3)
      truncateSessionLog(writer.filePath, 2);

      const content = readFileSync(writer.filePath, "utf-8").trim().split("\n");
      const parsed = content.map(line => JSON.parse(line));
      
      expect(parsed.length).toBe(5);
      expect(parsed[0].type).toBe("session.start");
      
      const userPrompts = parsed.filter(p => p.type === "message" && p.role === "user");
      expect(userPrompts.length).toBe(2);
      expect(userPrompts[0].text).toBe("prompt 1");
      expect(userPrompts[1].text).toBe("prompt 2");
    });

    it("re-hydrating (replaying) the session loads the correct truncated history", () => {
      const root = tempRoot();
      const startedAt = new Date(2026, 4, 20, 14, 30, 52);
      const writer = new SessionWriter({
        root,
        id: "kng-20260520t143052-a3f7",
        startedAt,
        syncFile: () => undefined,
      });

      writer.start({ provider: "mock", model: "mock" });
      
      // Turn 1
      writer.currentTurn = 1;
      writer.message("user", "prompt 1");
      writer.message("assistant", "response 1");
      
      // Turn 2
      writer.currentTurn = 2;
      writer.message("user", "prompt 2");
      writer.message("assistant", "response 2");

      // Turn 3
      writer.currentTurn = 3;
      writer.message("user", "prompt 3");
      writer.message("assistant", "response 3");

      writer.close();

      // Truncate to turn 1 (keeps turn 1 only)
      truncateSessionLog(writer.filePath, 1);

      // Replay
      const result = replaySession({ filePath: writer.filePath });
      expect(result.runtime.messageCount).toBe(1);
      expect(result.runtime.prompts.map(p => [p.role, p.text])).toEqual([
        ["user", "prompt 1"],
        ["assistant", "response 1"],
      ]);
    });
  });

  describe("Task 2: Git Snapshotting and Rollback", () => {
    it("runs git commit after each turn when git is active", async () => {
      const gitDir = tempRoot();
      initGitRepo(gitDir);

      const runtime = bootRuntime({ noSubstrate: true });
      runtime.workspace = gitDir;
      const sessionRoot = tempRoot();
      runtime.sessionWriter = new SessionWriter({
        root: sessionRoot,
        id: "kng-20260520t143052-a3f7",
        startedAt: new Date(2026, 4, 20, 14, 30, 52),
        syncFile: () => undefined,
      });
      runtime.sessionId = runtime.sessionWriter.id;
      runtime.sessionWriter.start({ provider: "mock", model: "mock" });

      const provider = new MockProvider({ responseText: "hi there", delayMs: 0 });

      // Run Turn 1
      await collect(runTurn(runtime, provider, "first query"));

      // Verify Git has a commit with description kintsugi-turn-snapshot: 1
      const log = execSync("git log --oneline", { cwd: gitDir, stdio: "pipe" }).toString();
      expect(log).toContain("kintsugi-turn-snapshot: 1");

      // Run Turn 2
      await collect(runTurn(runtime, provider, "second query"));
      const log2 = execSync("git log --oneline", { cwd: gitDir, stdio: "pipe" }).toString();
      expect(log2).toContain("kintsugi-turn-snapshot: 2");

      runtime.sessionWriter.close();
    });

    it("rolls back to commit associated with turnIndex and fails on uncommitted manual changes", async () => {
      const gitDir = tempRoot();
      initGitRepo(gitDir);

      const runtime = bootRuntime({ noSubstrate: true });
      runtime.workspace = gitDir;
      const sessionRoot = tempRoot();
      runtime.sessionWriter = new SessionWriter({
        root: sessionRoot,
        id: "kng-20260520t143052-a3f7",
        startedAt: new Date(2026, 4, 20, 14, 30, 52),
        syncFile: () => undefined,
      });
      runtime.sessionId = runtime.sessionWriter.id;
      runtime.sessionWriter.start({ provider: "mock", model: "mock" });

      const provider = new MockProvider({ responseText: "response text", delayMs: 0 });

      // Turn 1
      await collect(runTurn(runtime, provider, "turn 1 prompt"));
      writeFileSync(join(gitDir, "file1.txt"), "state 1\n", "utf-8");
      
      // Turn 2
      await collect(runTurn(runtime, provider, "turn 2 prompt"));
      
      expect(existsSync(join(gitDir, "file1.txt"))).toBe(true);

      rollbackToTurn(1, gitDir);
      expect(existsSync(join(gitDir, "file1.txt"))).toBe(false);

      // Restore file1.txt and commit it manually, then run Turn 3
      writeFileSync(join(gitDir, "file2.txt"), "state 2\n", "utf-8");
      await collect(runTurn(runtime, provider, "turn 3 prompt"));

      // Now create an uncommitted manual change
      writeFileSync(join(gitDir, "dirty.txt"), "dirty content\n", "utf-8");

      expect(() => rollbackToTurn(1, gitDir)).toThrow("Uncommitted manual changes risk being lost");

      runtime.sessionWriter.close();
    });
  });

  describe("Task 3: Session Branching", () => {
    it("branches session copying active JSONL and updating runtime active session", () => {
      const root = tempRoot();
      const startedAt = new Date(2026, 4, 20, 14, 30, 52);
      
      const runtime = bootRuntime({ noSubstrate: true });
      runtime.sessionWriter = new SessionWriter({
        root,
        id: "kng-20260520t143052-a3f7",
        startedAt,
        syncFile: () => undefined,
      });
      runtime.sessionId = runtime.sessionWriter.id;

      runtime.sessionWriter.start({ provider: "mock", model: "mock" });
      runtime.sessionWriter.message("user", "hello");
      
      const originalPath = runtime.sessionWriter.filePath;
      const originalId = runtime.sessionId;

      const newId = branchSession(runtime, "feat-new");

      expect(newId).toBe(`${originalId}-branch-feat-new`);
      expect(runtime.sessionId).toBe(newId);
      expect(runtime.sessionWriter.filePath).not.toBe(originalPath);
      expect(existsSync(runtime.sessionWriter.filePath)).toBe(true);
      expect(existsSync(originalPath)).toBe(true);

      runtime.sessionWriter.message("user", "branched msg");
      runtime.sessionWriter.close();

      const originalLines = readFileSync(originalPath, "utf-8").trim().split("\n");
      const branchedLines = readFileSync(runtime.sessionWriter.filePath, "utf-8").trim().split("\n");

      expect(originalLines.length).toBe(2);
      expect(originalLines[1]).toContain("hello");
      expect(originalLines[1]).not.toContain("branched msg");

      expect(branchedLines.length).toBe(3);
      expect(branchedLines[1]).toContain("hello");
      expect(branchedLines[2]).toContain("branched msg");
    });
  });
});
