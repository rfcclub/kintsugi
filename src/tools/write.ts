import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveAndValidate } from "./path.js";
import type { Tool, ToolContext, ToolSpec } from "./tool.js";
import { fail, ok, requireAllowed, stringArg, toolCallIdFrom } from "./utils.js";

export const writeFileSpec: ToolSpec = {
  name: "write_file",
  description: "Create or overwrite a file",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to write" },
      content: { type: "string", description: "File contents" },
    },
    required: ["path", "content"],
  },
};

export class WriteFileTool implements Tool {
  readonly spec = writeFileSpec;

  async execute(args: Record<string, unknown>, context: ToolContext) {
    const toolCallId = toolCallIdFrom(args);
    try {
      requireAllowed(context.permission);
      const filePath = stringArg(args, "path");
      const content = stringArg(args, "content");
      const resolved = await resolveAndValidate(
        filePath,
        context.workspaceRoots,
        context.workingDir
      );
      await mkdir(path.dirname(resolved.realPath), { recursive: true });
      await writeFile(resolved.realPath, content, "utf8");
      return ok(toolCallId, `Wrote ${resolved.absolutePath}`);
    } catch (error) {
      return fail(toolCallId, error);
    }
  }
}
