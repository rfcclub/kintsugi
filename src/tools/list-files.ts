import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { globToRegExp } from "./glob.js";
import { resolveAndValidate } from "./path.js";
import type { Tool, ToolContext, ToolSpec } from "./tool.js";
import {
  fail,
  ok,
  optionalStringArg,
  stringArg,
  toolCallIdFrom,
} from "./utils.js";

export const listFilesSpec: ToolSpec = {
  name: "list_files",
  description: "List files in a directory",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path" },
      pattern: { type: "string", description: "Glob pattern (default: **/*)" },
    },
    required: ["path"],
  },
};

export class ListFilesTool implements Tool {
  readonly spec = listFilesSpec;

  async execute(args: Record<string, unknown>, context: ToolContext) {
    const toolCallId = toolCallIdFrom(args);
    try {
      const directoryPath = stringArg(args, "path");
      const pattern = optionalStringArg(args, "pattern") ?? "**/*";
      const resolved = await resolveAndValidate(
        directoryPath,
        context.workspaceRoots,
        context.workingDir
      );
      const directoryStat = await stat(resolved.realPath);
      if (!directoryStat.isDirectory()) {
        throw new Error("Path is not a directory");
      }

      const matcher = globToRegExp(pattern);
      const files = await listFiles(resolved.realPath);
      const matched = files
        .map((filePath) => toPosix(path.relative(resolved.realPath, filePath)))
        .filter((relativePath) => matcher.test(relativePath))
        .sort();

      return ok(toolCallId, matched.join("\n"));
    } catch (error) {
      return fail(toolCallId, error);
    }
  }
}

export async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

export function toPosix(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
