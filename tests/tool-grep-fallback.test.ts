import { mkdtemp, mkdir, writeFile, chmod } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// Mock child_process.execFile so that "rg" always throws ENOENT,
// forcing the fallback path. We must do this before importing grep.
vi.mock("node:child_process", () => {
  const actual = vi.importActual("node:child_process");
  return {
    ...actual,
    execFile: (
      cmd: string,
      args: string[],
      opts: unknown,
      cb?: Function
    ) => {
      if (typeof opts === "function") {
        cb = opts;
        opts = {};
      }
      if (cmd === "rg") {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        (cb as Function)(err, "", "");
        return;
      }
      // Delegate non-rg calls to real implementation
      return (actual as any).execFile(cmd, args, opts, cb);
    },
  };
});

// Dynamic import AFTER mock is set up
const { grep, GrepTool } = await import("../src/tools/grep.js");
const { default: toolModule } = await import("../src/tools/tool.js");
type ToolContext = toolModule.ToolContext;

async function makeWorkspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "kintsugi-grep-fb-"));
}

function context(root: string): ToolContext {
  return {
    workingDir: root,
    workspaceRoots: [root],
    permission: "allow",
  };
}

describe("grep fallback (no ripgrep)", () => {
  it("falls back to node-based grep when rg is missing", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "a.ts"), "hello world\n", "utf8");
    await writeFile(path.join(root, "b.py"), "hello python\n", "utf8");

    const result = await grep(root, "hello");
    expect(result).toContain("a.ts:1:");
    expect(result).toContain("b.py:1:");
    expect(result).toContain("hello");
  });

  it("respects include filter in fallback", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "a.ts"), "matchme\n", "utf8");
    await writeFile(path.join(root, "a.py"), "matchme\n", "utf8");

    const result = await grep(root, "matchme", "*.py");
    expect(result).toContain("a.py");
    expect(result).not.toContain("a.ts");
  });

  it("returns empty on no matches in fallback", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "a.ts"), "nothing here\n", "utf8");

    const result = await grep(root, "zzzznotfound");
    expect(result).toBe("");
  });

  it("handles single file path in fallback", async () => {
    const root = await makeWorkspace();
    const filePath = path.join(root, "target.ts");
    await writeFile(filePath, "needle in haystack\n", "utf8");

    const result = await grep(filePath, "needle");
    expect(result).toContain("needle");
  });

  it("handles empty directory in fallback", async () => {
    const root = await makeWorkspace();
    await mkdir(path.join(root, "empty"), { recursive: true });

    const result = await grep(path.join(root, "empty"), "anything");
    expect(result).toBe("");
  });

  it("skips unreadable files gracefully in fallback", async () => {
    const root = await makeWorkspace();
    const binaryFile = path.join(root, "binary.bin");
    await writeFile(binaryFile, Buffer.from([0x00, 0x01, 0x02]), "utf8");
    await chmod(binaryFile, 0o000);

    // Should not throw — just skips the file
    const result = await grep(root, "test");
    expect(typeof result).toBe("string");
  });

  it("matches regex patterns in fallback", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "a.ts"), "const x = 42;\nconst y = 'hello';\n", "utf8");

    const result = await grep(root, "\\d+");
    expect(result).toContain("42");
  });

  it("falls back to string includes for invalid regex in fallback", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "a.ts"), "value = [invalid\n", "utf8");

    // Invalid regex pattern — should fall back to line.includes(pattern)
    const result = await grep(root, "[invalid");
    expect(result).toContain("[invalid");
  });

  it("grep tool works in fallback mode", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "a.ts"), "hello fallback\n", "utf8");

    const tool = new GrepTool();
    const result = await tool.execute(
      { pattern: "hello", path: root },
      context(root)
    );

    expect(result.isError).toBe(false);
    expect(result.output).toContain("hello fallback");
  });
});

describe("grep compilePattern edge cases (fallback)", () => {
  it("handles multiple matches on different lines", async () => {
    const root = await makeWorkspace();
    await writeFile(
      path.join(root, "a.ts"),
      "line one needle\nline two\nline three needle again\n",
      "utf8"
    );

    const result = await grep(root, "needle");
    const lines = result.split("\n").filter((l) => l.includes("needle"));
    expect(lines.length).toBe(2);
  });

  it("handles patterns with dots and special chars", async () => {
    const root = await makeWorkspace();
    await writeFile(path.join(root, "a.ts"), "file.ts\nfile_js\n", "utf8");

    const result = await grep(root, "file\\.ts");
    expect(result).toContain("file.ts");
    expect(result).not.toContain("file_js");
  });
});
