import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolveAndValidate } from "./path.js";
import type { Tool, ToolContext, ToolSpec } from "./tool.js";
import { fail, ok, stringArg, toolCallIdFrom } from "./utils.js";

export const applyPatchSpec: ToolSpec = {
  name: "apply_patch",
  description: "Apply a multi-hunk text patch to a file. Uses old_string/new_string pairs.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File to patch" },
      patches: {
        type: "string",
        description: "JSON array of {old_string, new_string} hunks",
      },
    },
    required: ["path", "patches"],
  },
};

export interface PatchHunk {
  old_string: string;
  new_string: string;
}

export class ApplyPatchTool implements Tool {
  readonly spec = applyPatchSpec;

  async execute(args: Record<string, unknown>, context: ToolContext) {
    const toolCallId = toolCallIdFrom(args);
    try {
      const filePath = stringArg(args, "path");
      const patchesRaw = stringArg(args, "patches");
      const hunks: PatchHunk[] = JSON.parse(patchesRaw);

      if (!Array.isArray(hunks) || hunks.length === 0) {
        return ok(toolCallId, "Error: patches must be a non-empty JSON array of {old_string, new_string}");
      }

      const resolved = await resolveAndValidate(
        filePath,
        context.workspaceRoots,
        context.workingDir
      );

      if (!existsSync(resolved.realPath)) {
        return ok(toolCallId, `Error: file does not exist: ${filePath}`);
      }

      let content = readFileSync(resolved.realPath, "utf8");
      const applied: string[] = [];

      for (let i = 0; i < hunks.length; i++) {
        const hunk = hunks[i];
        if (!hunk.old_string && hunk.old_string !== "") {
          return ok(toolCallId, `Error: hunk ${i} missing old_string`);
        }
        if (hunk.new_string === undefined) {
          return ok(toolCallId, `Error: hunk ${i} missing new_string`);
        }
        if (!content.includes(hunk.old_string)) {
          return ok(toolCallId, `Error: hunk ${i} old_string not found in file`);
        }
        content = content.replace(hunk.old_string, hunk.new_string);
        applied.push(`hunk ${i}`);
      }

      writeFileSync(resolved.realPath, content, "utf8");
      return ok(toolCallId, `Applied ${applied.length} hunks to ${filePath}`);
    } catch (error) {
      return fail(toolCallId, error);
    }
  }
}
