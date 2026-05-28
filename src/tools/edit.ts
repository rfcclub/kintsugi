import { readFile, writeFile } from "node:fs/promises";
import { resolveAndValidate } from "./path.js";
import type { Tool, ToolContext, ToolSpec } from "./tool.js";
import { fail, ok, requireAllowed, stringArg, toolCallIdFrom } from "./utils.js";

export const editFileSpec: ToolSpec = {
  name: "edit_file",
  description: "Replace exact text in a file",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to edit" },
      oldText: { type: "string", description: "Exact text to replace" },
      newText: { type: "string", description: "Replacement text" },
    },
    required: ["path", "oldText", "newText"],
  },
};

export class EditFileTool implements Tool {
  readonly spec = editFileSpec;

  async execute(args: Record<string, unknown>, context: ToolContext) {
    const toolCallId = toolCallIdFrom(args);
    try {
      requireAllowed(context.permission);
      const filePath = stringArg(args, "path");
      const oldText = stringArg(args, "oldText");
      const newText = stringArg(args, "newText");
      if (oldText.length === 0) {
        throw new Error("oldText must not be empty");
      }

      const resolved = await resolveAndValidate(
        filePath,
        context.workspaceRoots,
        context.workingDir
      );
      const contents = await readFile(resolved.realPath, "utf8");
      const matches = countMatches(contents, oldText);
      if (matches === 0) {
        throw new Error(
          `oldText not found in file '${resolved.absolutePath}'. The text to replace must match exactly.`
        );
      }
      if (matches > 1) {
        throw new Error(
          `oldText matched ${matches} locations in file '${resolved.absolutePath}'. Refine oldText to match exactly one location.`
        );
      }

      await writeFile(resolved.realPath, contents.replace(oldText, newText), "utf8");
      return ok(toolCallId, `Edited ${resolved.absolutePath}`);
    } catch (error) {
      return fail(toolCallId, error);
    }
  }
}

export function countMatches(contents: string, search: string): number {
  let count = 0;
  let index = contents.indexOf(search);

  while (index !== -1) {
    count += 1;
    index = contents.indexOf(search, index + search.length);
  }

  return count;
}
