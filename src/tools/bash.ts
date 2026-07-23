import { exec } from "node:child_process";
import { promisify } from "node:util";
import { resolveAndValidate } from "./path.js";
import type { Tool, ToolContext, ToolSpec } from "./tool.js";
import {
  fail,
  ok,
  optionalNumberArg,
  requireAllowed,
  stringArg,
  toolCallIdFrom,
  truncateOutput,
} from "./utils.js";

const execAsync = promisify(exec);
const DEFAULT_TIMEOUT_MS = 30_000;

export const bashSpec: ToolSpec = {
  name: "bash",
  description: "Run a shell command",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to run" },
      timeoutMs: { type: "number", description: "Timeout in milliseconds" },
    },
    required: ["command"],
  },
};

export class BashTool implements Tool {
  readonly spec = bashSpec;

  async execute(args: Record<string, unknown>, context: ToolContext) {
    const toolCallId = toolCallIdFrom(args);
    try {
      requireAllowed(context.permission);
      const command = stringArg(args, "command");
      const timeoutMs = clampTimeout(optionalNumberArg(args, "timeoutMs"));
      const cwd = await resolveAndValidate(
        context.workingDir,
        context.workspaceRoots,
        context.workingDir
      );
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwd.realPath,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        signal: context.signal,
      });
      return ok(toolCallId, truncateOutput(`${stdout}${stderr}`));
    } catch (error) {
      return fail(toolCallId, error);
    }
  }
}

export function clampTimeout(timeoutMs?: number): number {
  if (timeoutMs === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(Math.max(1, Math.trunc(timeoutMs)), DEFAULT_TIMEOUT_MS);
}
