import { renameSync, existsSync } from "node:fs";
import { resolveAndValidate } from "./path.js";
import type { Tool, ToolContext, ToolSpec } from "./tool.js";
import { fail, ok, stringArg, toolCallIdFrom } from "./utils.js";

export const moveSpec: ToolSpec = {
  name: "move_file",
  description: "Rename or move a file or directory",
  parameters: {
    type: "object",
    properties: {
      source: { type: "string", description: "Source path" },
      destination: { type: "string", description: "Destination path" },
    },
    required: ["source", "destination"],
  },
};

export class MoveFileTool implements Tool {
  readonly spec = moveSpec;

  async execute(args: Record<string, unknown>, context: ToolContext) {
    const toolCallId = toolCallIdFrom(args);
    try {
      const src = stringArg(args, "source");
      const dst = stringArg(args, "destination");
      const resolvedSrc = await resolveAndValidate(
        src,
        context.workspaceRoots,
        context.workingDir
      );
      const resolvedDst = await resolveAndValidate(
        dst,
        context.workspaceRoots,
        context.workingDir
      );
      if (!existsSync(resolvedSrc.realPath)) {
        return ok(toolCallId, `Error: source path does not exist: ${src}`);
      }
      renameSync(resolvedSrc.realPath, resolvedDst.realPath);
      return ok(toolCallId, `Moved ${src} -> ${dst}`);
    } catch (error) {
      return fail(toolCallId, error);
    }
  }
}
