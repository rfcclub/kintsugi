import { mkdtemp, mkdir, writeFile, readFile, access } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MkdirTool } from "../src/tools/mkdir.js";
import { MoveFileTool } from "../src/tools/move.js";
import { DeleteFileTool } from "../src/tools/delete.js";
import { StatFileTool } from "../src/tools/stat.js";
import { ApplyPatchTool } from "../src/tools/apply-patch.js";
import { GitStatusTool, GitDiffTool, GitLogTool } from "../src/tools/git.js";
import type { ToolContext } from "../src/tools/tool.js";

async function makeWorkspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "kintsugi-newtools-"));
}

function context(root: string): ToolContext {
  return {
    workingDir: root,
    workspaceRoots: [root],
    permission: "allow",
  };
}

describe("mkdir tool", () => {
  it("creates a directory", async () => {
    const root = await makeWorkspace();
    const tool = new MkdirTool();
    const result = await tool.execute(
      { path: "new-dir" },
      context(root)
    );
    expect(result.isError).toBe(false);
    const stat = statSync(path.join(root, "new-dir"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("creates nested directories with recursive", async () => {
    const root = await makeWorkspace();
    const tool = new MkdirTool();
    const result = await tool.execute(
      { path: "a/b/c" },
      context(root)
    );
    expect(result.isError).toBe(false);
    const stat = statSync(path.join(root, "a", "b", "c"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("rejects paths outside workspace", async () => {
    const root = await makeWorkspace();
    const tool = new MkdirTool();
    const result = await tool.execute(
      { path: os.tmpdir() + "/evil" },
      context(root)
    );
    expect(result.isError).toBe(true);
  });

  it("handles missing path argument", async () => {
    const root = await makeWorkspace();
    const tool = new MkdirTool();
    const result = await tool.execute({}, context(root));
    expect(result.isError).toBe(true);
  });
});

describe("move_file tool", () => {
  it("renames a file", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "old.txt"), "content", "utf8");
    const tool = new MoveFileTool();
    const result = await tool.execute(
      { source: "old.txt", destination: "new.txt" },
      context(root)
    );
    expect(result.isError).toBe(false);
    expect(existsSync(path.join(root, "old.txt"))).toBe(false);
    const content = await readFile(path.join(root, "new.txt"), "utf8");
    expect(content).toBe("content");
  });

  it("fails when source does not exist", async () => {
    const root = await makeWorkspace();
    const tool = new MoveFileTool();
    const result = await tool.execute(
      { source: "nonexistent.txt", destination: "new.txt" },
      context(root)
    );
    expect(result.output).toContain("does not exist");
  });

  it("rejects paths outside workspace", async () => {
    const root = await makeWorkspace();
    const tool = new MoveFileTool();
    const result = await tool.execute(
      { source: "/etc/passwd", destination: "stolen.txt" },
      context(root)
    );
    expect(result.isError).toBe(true);
  });
});

describe("delete_file tool", () => {
  it("deletes a file", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "doomed.txt"), "bye", "utf8");
    const tool = new DeleteFileTool();
    const result = await tool.execute(
      { path: "doomed.txt" },
      context(root)
    );
    expect(result.isError).toBe(false);
    expect(existsSync(path.join(root, "doomed.txt"))).toBe(false);
  });

  it("deletes a directory recursively", async () => {
    const root = await makeWorkspace();
    await mkdir(path.join(root, "sub"), { recursive: true });
    await writeFile(path.join(root, "sub", "file.txt"), "x", "utf8");
    const tool = new DeleteFileTool();
    const result = await tool.execute(
      { path: "sub" },
      context(root)
    );
    expect(result.isError).toBe(false);
    expect(existsSync(path.join(root, "sub"))).toBe(false);
  });

  it("handles nonexistent path", async () => {
    const root = await makeWorkspace();
    const tool = new DeleteFileTool();
    const result = await tool.execute(
      { path: "ghost" },
      context(root)
    );
    expect(result.output).toContain("does not exist");
  });
});

describe("stat_file tool", () => {
  it("stats a file", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "info.txt"), "hello", "utf8");
    const tool = new StatFileTool();
    const result = await tool.execute(
      { path: "info.txt" },
      context(root)
    );
    expect(result.isError).toBe(false);
    const info = JSON.parse(result.output);
    expect(info.type).toBe("file");
    expect(info.size).toBe(5);
    expect(info.path).toBe("info.txt");
  });

  it("stats a directory", async () => {
    const root = await makeWorkspace();
    await mkdir(path.join(root, "mydir"), { recursive: true });
    const tool = new StatFileTool();
    const result = await tool.execute(
      { path: "mydir" },
      context(root)
    );
    expect(result.isError).toBe(false);
    const info = JSON.parse(result.output);
    expect(info.type).toBe("directory");
  });

  it("handles nonexistent path", async () => {
    const root = await makeWorkspace();
    const tool = new StatFileTool();
    const result = await tool.execute(
      { path: "nope" },
      context(root)
    );
    expect(result.output).toContain("does not exist");
  });
});

describe("apply_patch tool", () => {
  it("applies a single hunk", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "code.ts"), "const x = 1;\nconst y = 2;\n", "utf8");
    const tool = new ApplyPatchTool();
    const result = await tool.execute(
      {
        path: "code.ts",
        patches: JSON.stringify([{ old_string: "const x = 1;", new_string: "const x = 42;" }]),
      },
      context(root)
    );
    expect(result.isError).toBe(false);
    expect(result.output).toContain("1 hunks");
    const content = await readFile(path.join(root, "code.ts"), "utf8");
    expect(content).toContain("const x = 42;");
  });

  it("applies multiple hunks", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "code.ts"), "aaa\nbbb\nccc\n", "utf8");
    const tool = new ApplyPatchTool();
    const result = await tool.execute(
      {
        path: "code.ts",
        patches: JSON.stringify([
          { old_string: "aaa", new_string: "AAA" },
          { old_string: "ccc", new_string: "CCC" },
        ]),
      },
      context(root)
    );
    expect(result.isError).toBe(false);
    expect(result.output).toContain("2 hunks");
    const content = await readFile(path.join(root, "code.ts"), "utf8");
    expect(content).toContain("AAA");
    expect(content).toContain("CCC");
  });

  it("fails when old_string not found", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "code.ts"), "const x = 1;\n", "utf8");
    const tool = new ApplyPatchTool();
    const result = await tool.execute(
      {
        path: "code.ts",
        patches: JSON.stringify([{ old_string: "NOT FOUND", new_string: "replaced" }]),
      },
      context(root)
    );
    expect(result.output).toContain("not found");
  });

  it("fails with empty patches array", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "code.ts"), "x", "utf8");
    const tool = new ApplyPatchTool();
    const result = await tool.execute(
      { path: "code.ts", patches: "[]" },
      context(root)
    );
    expect(result.output).toContain("non-empty");
  });

  it("fails with invalid JSON", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "code.ts"), "x", "utf8");
    const tool = new ApplyPatchTool();
    const result = await tool.execute(
      { path: "code.ts", patches: "not-json" },
      context(root)
    );
    expect(result.isError).toBe(true);
  });

  it("fails when file does not exist", async () => {
    const root = await makeWorkspace();
    const tool = new ApplyPatchTool();
    const result = await tool.execute(
      {
        path: "missing.ts",
        patches: JSON.stringify([{ old_string: "a", new_string: "b" }]),
      },
      context(root)
    );
    expect(result.output).toContain("does not exist");
  });

  it("fails when hunk missing old_string", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "code.ts"), "content\n", "utf8");
    const tool = new ApplyPatchTool();
    const result = await tool.execute(
      {
        path: "code.ts",
        patches: JSON.stringify([{ new_string: "replaced" }]),
      },
      context(root)
    );
    expect(result.output).toContain("missing old_string");
  });

  it("fails when hunk missing new_string", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "code.ts"), "content\n", "utf8");
    const tool = new ApplyPatchTool();
    const result = await tool.execute(
      {
        path: "code.ts",
        patches: JSON.stringify([{ old_string: "content" }]),
      },
      context(root)
    );
    expect(result.output).toContain("missing new_string");
  });
});

describe("git tools", () => {
  it("git_status runs without error", async () => {
    const root = await makeWorkspace();
    const tool = new GitStatusTool();
    const result = await tool.execute({}, context(root));
    expect(typeof result.output).toBe("string");
  });

  it("git_diff runs without error", async () => {
    const root = await makeWorkspace();
    const tool = new GitDiffTool();
    const result = await tool.execute({}, context(root));
    expect(typeof result.output).toBe("string");
  });

  it("git_diff with cached flag", async () => {
    const root = await makeWorkspace();
    const tool = new GitDiffTool();
    const result = await tool.execute({ cached: "true" }, context(root));
    expect(typeof result.output).toBe("string");
  });

  it("git_log runs without error", async () => {
    const root = await makeWorkspace();
    const tool = new GitLogTool();
    const result = await tool.execute({ limit: "3" }, context(root));
    expect(typeof result.output).toBe("string");
  });
});
