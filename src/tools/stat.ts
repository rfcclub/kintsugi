import { statSync, existsSync } from "node:fs";
import { resolveAndValidate } from "./path.js";
import type { Tool, ToolContext, ToolSpec } from "./tool.js";
import { fail, ok, stringArg, toolCallIdFrom } from "./utils.js";

export const statSpec: ToolSpec = {
  name: "stat_file",
  description: "Get file or directory metadata (size, type, modification time)",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to inspect" },
    },
    required: ["path"],
  },
};

export class StatFileTool implements Tool {
  readonly spec = statSpec;

  async execute(args: Record<string, unknown>, context: ToolContext) {
    const toolCallId = toolCallIdFrom(args);
    try {
      const target = stringArg(args, "path");
      const resolved = await resolveAndValidate(
        target,
        context.workspaceRoots,
        context.workingDir
      );
      if (!existsSync(resolved.realPath)) {
        return ok(toolCallId, `Error: path does not exist: ${target}`);
      }
      const s = statSync(resolved.realPath);
      const info = {
        path: target,
        type: s.isDirectory() ? "directory" : s.isSymbolicLink() ? "symlink" : "file",
        size: s.size,
        modified: s.mtime.toISOString(),
        created: s.birthtime.toISOString(),
        permissions: (s.mode & 0o777).toString(8),
      };
      return ok(toolCallId, JSON.stringify(info, null, 2));
    } catch (error) {
      return fail(toolCallId, error);
    }
  }
}
