import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock execSync to avoid real git operations leaking into parent repos
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
import { isGitActive, createGitSnapshot, rollbackToTurn } from "../../src/runtime/git-rollback.js";

const mockedExec = vi.mocked(execSync);

describe("git-rollback", () => {
  const dir = "/fake/dir";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isGitActive", () => {
    it("returns true when git rev-parse returns true", () => {
      mockedExec.mockReturnValueOnce(Buffer.from("true\n"));
      expect(isGitActive(dir)).toBe(true);
      expect(mockedExec).toHaveBeenCalledWith(
        "git rev-parse --is-inside-work-tree",
        expect.objectContaining({ cwd: dir, stdio: "pipe" }),
      );
    });

    it("returns false when git rev-parse returns false", () => {
      mockedExec.mockReturnValueOnce(Buffer.from("false\n"));
      expect(isGitActive(dir)).toBe(false);
    });

    it("returns false when git command throws", () => {
      mockedExec.mockImplementationOnce(() => {
        throw new Error("not a git repo");
      });
      expect(isGitActive(dir)).toBe(false);
    });
  });

  describe("createGitSnapshot", () => {
    it("returns null when git is not active", () => {
      mockedExec.mockImplementationOnce(() => {
        throw new Error("not a git repo");
      });
      expect(createGitSnapshot(1, dir)).toBe(null);
    });

    it("creates commit and returns hash", () => {
      const fakeHash = "abc123def456789012345678901234567890abcd";
      // isGitActive → true
      mockedExec.mockReturnValueOnce(Buffer.from("true\n"));
      // git add -A → ok
      mockedExec.mockReturnValueOnce(Buffer.from(""));
      // git commit → ok
      mockedExec.mockReturnValueOnce(Buffer.from(""));
      // git rev-parse HEAD → hash
      mockedExec.mockReturnValueOnce(Buffer.from(fakeHash + "\n"));

      const result = createGitSnapshot(1, dir);
      expect(result).toBe(fakeHash);
      expect(mockedExec).toHaveBeenCalledTimes(4);
      // Verify commit message includes turn index
      expect(mockedExec).toHaveBeenCalledWith(
        expect.stringContaining('git commit --allow-empty -m "kintsugi-turn-snapshot: 1"'),
        expect.objectContaining({ cwd: dir }),
      );
    });

    it("returns null when commit fails", () => {
      // isGitActive → true
      mockedExec.mockReturnValueOnce(Buffer.from("true\n"));
      // git add -A → ok
      mockedExec.mockReturnValueOnce(Buffer.from(""));
      // git commit → throws
      mockedExec.mockImplementationOnce(() => {
        throw new Error("commit failed");
      });

      expect(createGitSnapshot(1, dir)).toBe(null);
    });
  });

  describe("rollbackToTurn", () => {
    it("throws when git is not active", () => {
      mockedExec.mockImplementationOnce(() => {
        throw new Error("not a git repo");
      });
      expect(() => rollbackToTurn(1, dir)).toThrow(/Git is not active/);
    });

    it("throws when git log query fails", () => {
      // isGitActive → true
      mockedExec.mockReturnValueOnce(Buffer.from("true\n"));
      // git log --grep → throws
      mockedExec.mockImplementationOnce(() => {
        throw new Error("git log failed");
      });
      expect(() => rollbackToTurn(1, dir)).toThrow(/Failed to query git log for turn 1/);
    });

    it("throws when no snapshot found (empty hash)", () => {
      mockedExec.mockReturnValueOnce(Buffer.from("true\n"));
      mockedExec.mockReturnValueOnce(Buffer.from("\n")); // empty hash
      expect(() => rollbackToTurn(1, dir)).toThrow(/No git snapshot found for turn 1/);
    });

    it("throws when uncommitted changes exist", () => {
      mockedExec.mockReturnValueOnce(Buffer.from("true\n")); // isGitActive
      mockedExec.mockReturnValueOnce(Buffer.from("abc123\n")); // commit hash
      mockedExec.mockReturnValueOnce(Buffer.from("M test.txt\n")); // dirty status

      expect(() => rollbackToTurn(1, dir)).toThrow(/Uncommitted manual changes/);
    });

    it("successfully resets to snapshot", () => {
      const fakeHash = "abc123def456789012345678901234567890abcd";
      mockedExec.mockReturnValueOnce(Buffer.from("true\n")); // isGitActive
      mockedExec.mockReturnValueOnce(Buffer.from(fakeHash + "\n")); // commit hash
      mockedExec.mockReturnValueOnce(Buffer.from("")); // clean status
      mockedExec.mockReturnValueOnce(Buffer.from("")); // git reset --hard ok

      expect(() => rollbackToTurn(1, dir)).not.toThrow();
      expect(mockedExec).toHaveBeenCalledWith(
        expect.stringContaining(`git reset --hard ${fakeHash}`),
        expect.objectContaining({ cwd: dir }),
      );
    });

    it("throws when git reset fails", () => {
      mockedExec.mockReturnValueOnce(Buffer.from("true\n")); // isGitActive
      mockedExec.mockReturnValueOnce(Buffer.from("abc123\n")); // commit hash
      mockedExec.mockReturnValueOnce(Buffer.from("")); // clean status
      mockedExec.mockImplementationOnce(() => {
        throw new Error("reset failed");
      });

      expect(() => rollbackToTurn(1, dir)).toThrow(/Failed to perform git reset to turn 1/);
    });

    it("throws when git status check fails", () => {
      mockedExec.mockReturnValueOnce(Buffer.from("true\n")); // isGitActive
      mockedExec.mockReturnValueOnce(Buffer.from("abc123\n")); // commit hash
      mockedExec.mockImplementationOnce(() => {
        throw new Error("status failed");
      });

      expect(() => rollbackToTurn(1, dir)).toThrow(/Failed to check git status/);
    });
  });
});
