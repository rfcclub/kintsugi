import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GrepTool } from "../src/tools/grep.js";
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

describe("grep", () => {
  it("searches validated paths with an include filter", async () => {
    const root = await makeWorkspace();
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "app.ts"), "const needle = true;\n", "utf8");
    await writeFile(path.join(root, "src", "app.md"), "needle\n", "utf8");

    const result = await new GrepTool().execute(
      { path: "src", pattern: "needle", include: "*.ts" },
      context(root)
    );

    expect(result.isError).toBe(false);
    expect(result.output).toContain("app.ts");
    expect(result.output).toContain("needle");
    expect(result.output).not.toContain("app.md");
  });

  it("rejects paths outside workspace roots", async () => {
    const root = await makeWorkspace();

    const result = await new GrepTool().execute(
      { path: os.tmpdir(), pattern: "needle" },
      context(root)
    );

    expect(result.isError).toBe(true);
    expect(result.output).toContain("outside the workspace roots");
  });
});
