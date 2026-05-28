import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ListFilesTool } from "../src/tools/list-files.js";
import { ReadFileTool } from "../src/tools/read.js";
import type { ToolContext } from "../src/tools/tool.js";

async function makeWorkspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "kintsugi-tools-"));
}

function context(root: string): ToolContext {
  return {
    workingDir: root,
    workspaceRoots: [root],
    permission: "allow",
  };
}

describe("read_file", () => {
  it("reads files inside workspace roots", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "hello.txt"), "one\ntwo\nthree\n", "utf8");

    const result = await new ReadFileTool().execute(
      { path: "hello.txt", toolCallId: "call-1" },
      context(root)
    );

    expect(result).toEqual({
      toolCallId: "call-1",
      output: "one\ntwo\nthree\n",
      isError: false,
    });
  });

  it("supports 1-based offset and line limit", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "hello.txt"), "one\ntwo\nthree\nfour", "utf8");

    const result = await new ReadFileTool().execute(
      { path: "hello.txt", offset: 2, limit: 2 },
      context(root)
    );

    expect(result.output).toBe("two\nthree");
    expect(result.isError).toBe(false);
  });

  it("rejects paths outside workspace roots", async () => {
    const root = await makeWorkspace();
    const outside = path.join(os.tmpdir(), "kintsugi-outside.txt");
    await writeFile(outside, "outside", "utf8");

    const result = await new ReadFileTool().execute({ path: outside }, context(root));

    expect(result.isError).toBe(true);
    expect(result.output).toContain("outside the workspace roots");
  });

  it("rejects symlinks that escape workspace roots", async () => {
    const root = await makeWorkspace();
    const outsideDir = await makeWorkspace();
    await writeFile(path.join(outsideDir, "secret.txt"), "secret", "utf8");
    await symlink(outsideDir, path.join(root, "linked"));

    const result = await new ReadFileTool().execute(
      { path: "linked/secret.txt" },
      context(root)
    );

    expect(result.isError).toBe(true);
    expect(result.output).toContain("outside the workspace roots");
  });
});

describe("list_files", () => {
  it("lists files recursively with simple glob support", async () => {
    const root = await makeWorkspace();
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "app.ts"), "ts", "utf8");
    await writeFile(path.join(root, "src", "app.md"), "md", "utf8");
    await writeFile(path.join(root, "README.md"), "readme", "utf8");

    const result = await new ListFilesTool().execute(
      { path: ".", pattern: "**/*.ts" },
      context(root)
    );

    expect(result.isError).toBe(false);
    expect(result.output).toBe("src/app.ts");
  });
});
