import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { globToRegExp } from "./glob.js";
import { listFiles, toPosix } from "./list-files.js";
import { resolveAndValidate } from "./path.js";
import type { Tool, ToolContext, ToolSpec } from "./tool.js";
import {
  fail,
  ok,
  optionalStringArg,
  stringArg,
  toolCallIdFrom,
  truncateOutput,
} from "./utils.js";

const execFileAsync = promisify(execFile);

export const grepSpec: ToolSpec = {
  name: "grep",
  description: "Search file contents for a pattern",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex or string pattern" },
      path: { type: "string", description: "Directory or file to search" },
      include: { type: "string", description: "File glob filter (e.g. *.ts)" },
    },
    required: ["pattern", "path"],
  },
};

export class GrepTool implements Tool {
  readonly spec = grepSpec;

  async execute(args: Record<string, unknown>, context: ToolContext) {
    const toolCallId = toolCallIdFrom(args);
    try {
      const pattern = stringArg(args, "pattern");
      const searchPath = stringArg(args, "path");
      const include = optionalStringArg(args, "include");
      const resolved = await resolveAndValidate(
        searchPath,
        context.workspaceRoots,
        context.workingDir
      );
      const output = await grep(resolved.realPath, pattern, include);
      return ok(toolCallId, output);
    } catch (error) {
      return fail(toolCallId, error);
    }
  }
}

export async function grep(
  searchPath: string,
  pattern: string,
  include?: string
): Promise<string> {
  const rgOutput = await tryRipgrep(searchPath, pattern, include);
  if (rgOutput !== undefined) {
    return truncateOutput(rgOutput);
  }

  return truncateOutput(await grepFallback(searchPath, pattern, include));
}

async function tryRipgrep(
  searchPath: string,
  pattern: string,
  include?: string
): Promise<string | undefined> {
  const args = ["--line-number", "--no-heading", "--color", "never"];
  if (include) {
    args.push("--glob", include);
  }
  args.push("--", pattern, searchPath);

  try {
    const { stdout } = await execFileAsync("rg", args, {
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
    });
    return stdout;
  } catch (error) {
    if (isNoMatches(error)) {
      return "";
    }
    if (isCommandMissing(error)) {
      return undefined;
    }
    throw error;
  }
}

async function grepFallback(
  searchPath: string,
  pattern: string,
  include?: string
): Promise<string> {
  const searchStat = await stat(searchPath);
  const files = searchStat.isDirectory() ? await listFiles(searchPath) : [searchPath];
  const matcher = include ? globToRegExp(include) : undefined;
  const patternMatcher = compilePattern(pattern);
  const matches: string[] = [];

  for (const filePath of files) {
    const relativePath = toPosix(path.relative(searchPath, filePath));
    const displayPath = relativePath === "" ? path.basename(filePath) : relativePath;
    if (matcher && !matcher.test(displayPath)) {
      continue;
    }

    let contents: string;
    try {
      contents = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    const lines = contents.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (patternMatcher(line)) {
        matches.push(`${displayPath}:${index + 1}:${line}`);
      }
    });
  }

  return matches.join("\n");
}

function compilePattern(pattern: string): (line: string) => boolean {
  try {
    const regex = new RegExp(pattern);
    return (line) => regex.test(line);
  } catch {
    return (line) => line.includes(pattern);
  }
}

function isCommandMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isNoMatches(error: unknown): boolean {
  const code = error instanceof Error && "code" in error ? (error as { code: unknown }).code : undefined;
  return (
    error instanceof Error &&
    code === 1
  );
}
