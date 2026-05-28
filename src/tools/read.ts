import { readFile } from "node:fs/promises";
import { resolveAndValidate } from "./path.js";
import type { Tool, ToolContext, ToolSpec } from "./tool.js";
import {
  fail,
  ok,
  optionalNumberArg,
  stringArg,
  toolCallIdFrom,
} from "./utils.js";

export const readFileSpec: ToolSpec = {
  name: "read_file",
  description: "Read the contents of a file",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to read" },
      offset: { type: "number", description: "Line offset (1-based)" },
      limit: { type: "number", description: "Max lines to read" },
    },
    required: ["path"],
  },
};

export class ReadFileTool implements Tool {
  readonly spec = readFileSpec;

  async execute(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<ReturnType<typeof ok>> {
    const toolCallId = toolCallIdFrom(args);
    try {
      const filePath = stringArg(args, "path");
      const offset = optionalNumberArg(args, "offset");
      const limit = optionalNumberArg(args, "limit");
      const resolved = await resolveAndValidate(
        filePath,
        context.workspaceRoots,
        context.workingDir
      );
      const contents = await readFile(resolved.realPath, "utf8");
      return ok(toolCallId, sliceLines(contents, offset, limit));
    } catch (error) {
      return fail(toolCallId, error);
    }
  }
}

export function sliceLines(
  contents: string,
  offset?: number,
  limit?: number
): string {
  if (offset === undefined && limit === undefined) {
    return contents;
  }

  const lines = contents.split(/\r?\n/);
  const start = offset === undefined ? 0 : Math.max(0, Math.trunc(offset) - 1);
  const end = limit === undefined ? undefined : start + Math.max(0, Math.trunc(limit));
  return lines.slice(start, end).join("\n");
}
