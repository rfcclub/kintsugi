import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// ─── git.ts mock ────────────────────────────────────────────────────────────
vi.mock("node:child_process", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { promisify } = require("node:util") as typeof import("node:util");
  const kCustom = promisify.custom;

  const mockExecFile = vi.fn();

  mockExecFile[kCustom] = function (
    cmd: string,
    args: string[],
    opts: unknown,
  ) {
    const { promise, resolve, reject } = Promise.withResolvers<{
      stdout: string;
      stderr: string;
    }>();
    mockExecFile(
      cmd,
      args,
      opts,
      (err: Error | null, stdout: string, stderr: string) => {
        if (err) return reject(err);
        resolve({ stdout, stderr });
      },
    );
    return promise;
  };

  return { execFile: mockExecFile };
});

// ─── subagent mock ──────────────────────────────────────────────────────────
const mockSpawn = vi.fn();
const mockSendMessage = vi.fn();

vi.mock("../../src/runtime/subagents.js", () => ({
  SubagentManager: class {
    spawn = mockSpawn;
    sendMessage = mockSendMessage;
  },
}));

// ─── fs/promises mock ───────────────────────────────────────────────────────
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<
    typeof import("node:fs/promises")
  >("node:fs/promises");
  const defaultExport = {
    ...actual,
    access: vi.fn(actual.access),
    realpath: vi.fn(actual.realpath),
    stat: vi.fn(actual.stat),
  };
  return { ...defaultExport, default: defaultExport };
});

// ─── imports (after mocks) ──────────────────────────────────────────────────
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { GitStatusTool, GitDiffTool, GitLogTool } from "../../src/tools/git.js";
import { InvokeSubagentTool } from "../../src/tools/invoke-subagent.js";
import { SendMessageTool } from "../../src/tools/send-message.js";
import {
  resolveAndValidate,
  isInside,
  PathValidationError,
} from "../../src/tools/path.js";
import { SubagentManager } from "../../src/runtime/subagents.js";
import type { ToolContext } from "../../src/tools/tool.js";

const mockExecFile = vi.mocked(execFile);
const mockStat = vi.mocked(fs.stat);

const realFs = await vi.importActual<typeof import("node:fs/promises")>(
  "node:fs/promises",
);

// ─── helpers ────────────────────────────────────────────────────────────────
const ctx: ToolContext = {
  workingDir: "/tmp/test-repo",
  workspaceRoots: ["/tmp/test-repo"],
  permission: "allow",
};

function okCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return { ...ctx, ...overrides };
}

function mockExec(stdout: string, stderr = ""): void {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], optsOrCb: unknown, cb?: unknown) => {
      const callback = typeof optsOrCb === "function" ? optsOrCb : cb;
      if (typeof callback === "function") callback(null, stdout, stderr);
    },
  );
}

function mockExecError(message: string): void {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], optsOrCb: unknown, cb?: unknown) => {
      const callback = typeof optsOrCb === "function" ? optsOrCb : cb;
      if (typeof callback === "function")
        callback(new Error(message), "", "");
    },
  );
}

// ════════════════════════════════════════════════════════════════════════════
// git.ts
// ════════════════════════════════════════════════════════════════════════════

describe("GitStatusTool", () => {
  const tool = new GitStatusTool();
  beforeEach(() => mockExecFile.mockReset());

  it("returns status output when present", async () => {
    mockExec("## main\nM  src/foo.ts\n");
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(false);
    expect(result.output).toContain("## main");
  });

  it("returns '(clean working tree)' when stdout is empty", async () => {
    mockExec("");
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(false);
    expect(result.output).toBe("(clean working tree)");
  });

  it("returns error when execFileAsync throws", async () => {
    mockExecError("git not found");
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(true);
    expect(result.output).toContain("git not found");
  });
});

describe("GitDiffTool", () => {
  const tool = new GitDiffTool();
  beforeEach(() => mockExecFile.mockReset());

  it("returns '(no changes)' when stdout is empty", async () => {
    mockExec("");
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(false);
    expect(result.output).toBe("(no changes)");
  });

  it("returns diff output when present", async () => {
    mockExec("diff --git a/src/foo.ts b/src/foo.ts\n");
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(false);
    expect(result.output).toContain("diff --git");
  });

  it("passes --path arg to git diff", async () => {
    mockExec("");
    await tool.execute({ path: "src/foo.ts" }, ctx);
    const callArgs = mockExecFile.mock.calls[0];
    expect(callArgs[1]).toContain("src/foo.ts");
    expect(callArgs[1]).toContain("--");
  });

  it("passes --cached when cached=true", async () => {
    mockExec("");
    await tool.execute({ cached: "true" }, ctx);
    const callArgs = mockExecFile.mock.calls[0];
    expect(callArgs[1]).toContain("--cached");
  });

  it("returns error when execFileAsync throws", async () => {
    mockExecError("git not found");
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(true);
    expect(result.output).toContain("git not found");
  });
});

describe("GitLogTool", () => {
  const tool = new GitLogTool();
  beforeEach(() => mockExecFile.mockReset());

  it("returns '(no commits)' when stdout is empty", async () => {
    mockExec("");
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(false);
    expect(result.output).toBe("(no commits)");
  });

  it("returns log output when present", async () => {
    mockExec("abc1234 initial commit\n");
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(false);
    expect(result.output).toContain("abc1234");
  });

  it("passes custom limit to git log", async () => {
    mockExec("");
    await tool.execute({ limit: "5" }, ctx);
    const callArgs = mockExecFile.mock.calls[0];
    expect(callArgs[1]).toContain("5");
  });

  it("uses default limit of 10 when limit not provided", async () => {
    mockExec("");
    await tool.execute({}, ctx);
    const callArgs = mockExecFile.mock.calls[0];
    const args = callArgs[1] as string[];
    const nIdx = args.indexOf("-n");
    expect(args[nIdx + 1]).toBe("10");
  });

  it("returns error when execFileAsync throws", async () => {
    mockExecError("git not found");
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(true);
    expect(result.output).toContain("git not found");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// invoke-subagent.ts
// ════════════════════════════════════════════════════════════════════════════

describe("InvokeSubagentTool", () => {
  const tool = new InvokeSubagentTool(new SubagentManager());
  beforeEach(() => mockSpawn.mockReset());

  const baseArgs = {
    id: "agent-1",
    role: "worker",
    prompt: "do something",
  };

  it("spawns subagent with array permissions", async () => {
    const result = await tool.execute(
      { ...baseArgs, permissions: ["read", "write"] },
      okCtx({ runtime: { sessionId: "s1" } }),
    );
    expect(result.isError).toBe(false);
    expect(mockSpawn).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ["read", "write"] }),
      expect.anything(),
    );
  });

  it("wraps string permissions into array (string branch)", async () => {
    const result = await tool.execute(
      { ...baseArgs, permissions: "read" },
      okCtx({ runtime: { sessionId: "s1" } }),
    );
    expect(result.isError).toBe(false);
    expect(mockSpawn).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ["read"] }),
      expect.anything(),
    );
  });

  it("defaults to empty permissions when undefined", async () => {
    await tool.execute(baseArgs, okCtx({ runtime: { sessionId: "s1" } }));
    expect(mockSpawn).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: [] }),
      expect.anything(),
    );
  });

  it("keeps empty permissions for non-array non-string values (fallback)", async () => {
    await tool.execute(
      { ...baseArgs, permissions: 42 },
      okCtx({ runtime: { sessionId: "s1" } }),
    );
    expect(mockSpawn).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: [] }),
      expect.anything(),
    );
  });

  it("throws 'Runtime context missing' when runtime absent", async () => {
    const result = await tool.execute(baseArgs, okCtx({ runtime: undefined }));
    expect(result.isError).toBe(true);
    expect(result.output).toBe("Runtime context missing");
  });

  it("returns error when permission is denied", async () => {
    const result = await tool.execute(
      baseArgs,
      okCtx({ permission: "deny", runtime: { sessionId: "s1" } }),
    );
    expect(result.isError).toBe(true);
    expect(result.output).toBe("Permission denied");
  });

  it("returns error when permission is 'ask'", async () => {
    const result = await tool.execute(
      baseArgs,
      okCtx({ permission: "ask", runtime: { sessionId: "s1" } }),
    );
    expect(result.isError).toBe(true);
    expect(result.output).toBe("Permission denied");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// send-message.ts
// ════════════════════════════════════════════════════════════════════════════

describe("SendMessageTool", () => {
  const tool = new SendMessageTool(new SubagentManager());
  beforeEach(() => mockSendMessage.mockReset());

  const baseArgs = {
    recipientId: "agent-2",
    content: "hello",
  };

  it("sends message successfully", async () => {
    const result = await tool.execute(
      baseArgs,
      okCtx({ runtime: { sessionId: "s1" } }),
    );
    expect(result.isError).toBe(false);
    expect(result.output).toContain("sent to agent-2");
  });

  it("uses 'parent' as sender when sessionId is absent", async () => {
    await tool.execute(baseArgs, okCtx({ runtime: {} }));
    expect(mockSendMessage).toHaveBeenCalledWith("parent", "agent-2", "hello");
  });

  it("throws 'Runtime context missing' when runtime absent", async () => {
    const result = await tool.execute(
      baseArgs,
      okCtx({ runtime: undefined }),
    );
    expect(result.isError).toBe(true);
    expect(result.output).toBe("Runtime context missing");
  });

  it("returns error when permission is denied", async () => {
    const result = await tool.execute(
      baseArgs,
      okCtx({ permission: "deny", runtime: { sessionId: "s1" } }),
    );
    expect(result.isError).toBe(true);
    expect(result.output).toBe("Permission denied");
  });

  it("returns error when permission is 'ask'", async () => {
    const result = await tool.execute(
      baseArgs,
      okCtx({ permission: "ask", runtime: { sessionId: "s1" } }),
    );
    expect(result.isError).toBe(true);
    expect(result.output).toBe("Permission denied");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// path.ts — isInside (pure, no I/O)
// ════════════════════════════════════════════════════════════════════════════

describe("isInside", () => {
  it("returns true when paths are identical (relative === '')", () => {
    expect(isInside("/workspace", "/workspace")).toBe(true);
  });
  it("returns true for a child path inside the root", () => {
    expect(isInside("/workspace", "/workspace/src/file.ts")).toBe(true);
  });
  it("returns false when path is outside the root (.. relative)", () => {
    expect(isInside("/workspace", "/other/file.ts")).toBe(false);
  });
  it("returns false for path at parent level", () => {
    expect(isInside("/workspace/src", "/workspace")).toBe(false);
  });
  it("returns true for deeply nested child", () => {
    expect(isInside("/a", "/a/b/c/d/e")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// path.ts — resolveAndValidate (real fs via vi.fn() pass-through mock)
// ════════════════════════════════════════════════════════════════════════════

describe("resolveAndValidate", () => {
  let tmpDir: string;

  beforeEach(() => {
    mockStat.mockReset();
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "kintsugi-path-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws PathValidationError for empty string path", async () => {
    await expect(resolveAndValidate("", [tmpDir])).rejects.toThrow(
      PathValidationError,
    );
  });

  it("throws PathValidationError for empty workspace roots", async () => {
    await expect(resolveAndValidate("somefile", [])).rejects.toThrow(
      "No workspace roots are configured",
    );
  });

  it("throws PathValidationError when path is outside workspace roots", async () => {
    const outsideDir = mkdtempSync(
      path.join(os.tmpdir(), "kintsugi-outside-"),
    );
    try {
      const realOutside = path.resolve(outsideDir);
      await expect(
        resolveAndValidate(path.join(realOutside, "file.txt"), [tmpDir]),
      ).rejects.toThrow("Path is outside the workspace roots");
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("resolves an existing file inside the workspace", async () => {
    const realTmpDir = await fs.realpath(tmpDir);
    writeFileSync(path.join(realTmpDir, "hello.txt"), "hi");
    const result = await resolveAndValidate(
      path.join(realTmpDir, "hello.txt"),
      [realTmpDir],
    );
    expect(result.requestedPath).toBe(path.join(realTmpDir, "hello.txt"));
    expect(result.workspaceRoot).toBe(realTmpDir);
  });

  it("resolves a non-existent path through its existing parent", async () => {
    const realTmpDir = await fs.realpath(tmpDir);
    const result = await resolveAndValidate(
      path.join(realTmpDir, "nonexistent", "deep", "file.txt"),
      [realTmpDir],
    );
    expect(result.requestedPath).toBe(
      path.join(realTmpDir, "nonexistent", "deep", "file.txt"),
    );
    expect(result.workspaceRoot).toBe(realTmpDir);
  });

  it("resolves a relative path against workingDir (line 43 false branch)", async () => {
    const realTmpDir = await fs.realpath(tmpDir);
    writeFileSync(path.join(realTmpDir, "rel.txt"), "data");
    const result = await resolveAndValidate(
      "rel.txt",
      [realTmpDir],
      realTmpDir,
    );
    expect(result.requestedPath).toBe("rel.txt");
    expect(result.workspaceRoot).toBe(realTmpDir);
  });

  it("throws PathValidationError when parent is not a directory (line 83+88)", async () => {
    const realTmpDir = await fs.realpath(tmpDir);
    const filePath = path.join(realTmpDir, "a-file");
    writeFileSync(filePath, "content");
    await expect(
      resolveAndValidate(path.join(realTmpDir, "a-file", "child.txt"), [
        realTmpDir,
      ]),
    ).rejects.toThrow("Path parent is not a directory");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// path.ts — line 93: parent does not exist at filesystem root
// ════════════════════════════════════════════════════════════════════════════

describe("resolveAndValidate — mocked fs for root-iteration edge case", () => {
  it("throws when all ancestor stat calls fail (line 93)", async () => {
    const realTmp = await fs.realpath(
      mkdtempSync(path.join(os.tmpdir(), "kintsugi-mock-")),
    );
    try {
      mockStat.mockImplementation(async (p: string | URL | Buffer) => {
        if (String(p) === "/") {
          const err = new Error("ENOENT") as NodeJS.ErrnoException;
          err.code = "ENOENT";
          throw err;
        }
        return realFs.stat(p);
      });

      await expect(
        resolveAndValidate("/nonexistent_file_at_root", [realTmp]),
      ).rejects.toThrow("Path parent does not exist");
    } finally {
      mockStat.mockReset();
      rmSync(realTmp, { recursive: true, force: true });
    }
  });
});
