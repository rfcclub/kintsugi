import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { grep, GrepTool } from "../src/tools/grep.js";
import type { ToolContext } from "../src/tools/tool.js";

async function makeWorkspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "kintsugi-grep-"));
}

function context(root: string): ToolContext {
  return {
    workingDir: root,
    workspaceRoots: [root],
    permission: "allow",
  };
}

describe("grep extended", () => {
  it("finds matches across multiple files", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "a.ts"), "hello world\nfoo bar\n", "utf8");
    await writeFile(path.join(root, "b.ts"), "hello again\nbaz\n", "utf8");

    const result = await grep(root, "hello");
    expect(result).toContain("a.ts:1:");
    expect(result).toContain("b.ts:1:");
  });

  it("returns empty string when no matches", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "a.ts"), "nothing here\n", "utf8");

    const result = await grep(root, "zzzznotfound");
    expect(result).toBe("");
  });

  it("handles regex patterns", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "a.ts"), "const x = 42;\nconst y = 'hello';\n", "utf8");

    const result = await grep(root, "\\d+");
    expect(result).toContain("42");
  });

  it("handles literal strings with special regex chars via rg", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "a.ts"), "value = [1, 2, 3]\n", "utf8");

    const result = await grep(root, "\\[1, 2, 3\\]");
    expect(result).toContain("[1, 2, 3]");
  });

  it("handles single file search path", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "target.ts"), "needle in haystack\n", "utf8");

    const result = await grep(path.join(root, "target.ts"), "needle");
    expect(result).toContain("needle");
  });

  it("respects include filter on file names", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "a.ts"), "matchme\n", "utf8");
    await writeFile(path.join(root, "a.py"), "matchme\n", "utf8");

    const result = await grep(root, "matchme", "*.py");
    expect(result).toContain("a.py");
    expect(result).not.toContain("a.ts");
  });

  it("grep tool rejects outside workspace", async () => {
    const root = await makeWorkspace();
    const tool = new GrepTool();
    const result = await tool.execute(
      { pattern: "test", path: os.tmpdir() },
      context(root)
    );
    expect(result.isError).toBe(true);
    expect(result.output).toContain("outside the workspace roots");
  });

  it("grep tool handles missing pattern arg", async () => {
    const root = await makeWorkspace();
    const tool = new GrepTool();
    const result = await tool.execute({ path: root }, context(root));
    expect(result.isError).toBe(true);
  });

  it("grep tool handles missing path arg", async () => {
    const root = await makeWorkspace();
    const tool = new GrepTool();
    const result = await tool.execute({ pattern: "test" }, context(root));
    expect(result.isError).toBe(true);
  });

  it("grep handles empty directory", async () => {
    const root = await makeWorkspace();
    await mkdir(path.join(root, "empty"), { recursive: true });

    const result = await grep(path.join(root, "empty"), "anything");
    expect(result).toBe("");
  });
});
