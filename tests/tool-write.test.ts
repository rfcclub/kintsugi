import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EditFileTool } from "../src/tools/edit.js";
import type { ToolContext } from "../src/tools/tool.js";
import { WriteFileTool } from "../src/tools/write.js";

async function makeWorkspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "kintsugi-tools-"));
}

function context(root: string, permission: ToolContext["permission"]): ToolContext {
  return {
    workingDir: root,
    workspaceRoots: [root],
    permission,
  };
}

describe("write_file", () => {
  it("writes files when permission is allowed", async () => {
    const root = await makeWorkspace();

    const result = await new WriteFileTool().execute(
      { path: "notes/new.txt", content: "hello" },
      context(root, "allow")
    );

    expect(result.isError).toBe(false);
    await expect(readFile(path.join(root, "notes", "new.txt"), "utf8")).resolves.toBe(
      "hello"
    );
  });

  it("requires permission before writing", async () => {
    const root = await makeWorkspace();

    const result = await new WriteFileTool().execute(
      { path: "new.txt", content: "hello" },
      context(root, "ask")
    );

    expect(result.isError).toBe(true);
    expect(result.output).toBe("Permission denied");
  });

  it("rejects paths outside workspace roots", async () => {
    const root = await makeWorkspace();
    const outside = path.join(os.tmpdir(), "kintsugi-write-outside.txt");

    const result = await new WriteFileTool().execute(
      { path: outside, content: "nope" },
      context(root, "allow")
    );

    expect(result.isError).toBe(true);
    expect(result.output).toContain("outside the workspace roots");
  });
});

describe("edit_file", () => {
  it("replaces an exact single occurrence", async () => {
    const root = await makeWorkspace();
    const filePath = path.join(root, "story.txt");
    await writeFile(filePath, "alpha beta gamma", "utf8");

    const result = await new EditFileTool().execute(
      { path: "story.txt", oldText: "beta", newText: "delta" },
      context(root, "allow")
    );

    expect(result.isError).toBe(false);
    await expect(readFile(filePath, "utf8")).resolves.toBe("alpha delta gamma");
  });

  it("fails when oldText matches multiple locations", async () => {
    const root = await makeWorkspace();
    const filePath = path.join(root, "story.txt");
    await writeFile(filePath, "same\nsame\n", "utf8");

    const result = await new EditFileTool().execute(
      { path: "story.txt", oldText: "same", newText: "changed" },
      context(root, "allow")
    );

    expect(result.isError).toBe(true);
    expect(result.output).toContain("oldText matched 2 locations");
    await expect(readFile(filePath, "utf8")).resolves.toBe("same\nsame\n");
  });
});
