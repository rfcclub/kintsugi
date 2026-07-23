import { existsSync, rmSync, lstatSync } from "node:fs";
import { resolveAndValidate } from "./path.js";
import type { Tool, ToolContext, ToolSpec } from "./tool.js";
import { fail, ok, stringArg, toolCallIdFrom } from "./utils.js";

export const deleteSpec: ToolSpec = {
  name: "delete_file",
  description: "Delete a file or empty directory",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to delete" },
    },
    required: ["path"],
  },
};

export class DeleteFileTool implements Tool {
  readonly spec = deleteSpec;

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
      const stat = lstatSync(resolved.realPath);
      if (stat.isDirectory()) {
        rmSync(resolved.realPath, { recursive: true });
        return ok(toolCallId, `Deleted directory: ${target}`);
      }
      rmSync(resolved.realPath);
      return ok(toolCallId, `Deleted file: ${target}`);
    } catch (error) {
      return fail(toolCallId, error);
    }
  }
}
