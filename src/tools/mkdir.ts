import { mkdirSync } from "node:fs";
import { resolveAndValidate } from "./path.js";
import type { Tool, ToolContext, ToolSpec } from "./tool.js";
import { fail, ok, stringArg, toolCallIdFrom } from "./utils.js";

export const mkdirSpec: ToolSpec = {
  name: "mkdir",
  description: "Create a directory, including parent directories",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path to create" },
    },
    required: ["path"],
  },
};

export class MkdirTool implements Tool {
  readonly spec = mkdirSpec;

  async execute(args: Record<string, unknown>, context: ToolContext) {
    const toolCallId = toolCallIdFrom(args);
    try {
      const target = stringArg(args, "path");
      const resolved = await resolveAndValidate(
        target,
        context.workspaceRoots,
        context.workingDir
      );
      mkdirSync(resolved.realPath, { recursive: true });
      return ok(toolCallId, `Created directory: ${target}`);
    } catch (error) {
      return fail(toolCallId, error);
    }
  }
}
