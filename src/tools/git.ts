import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Tool, ToolContext, ToolSpec } from "./tool.js";
import { fail, ok, optionalStringArg, toolCallIdFrom } from "./utils.js";

const execFileAsync = promisify(execFile);

// --- git_status ---

export const gitStatusSpec: ToolSpec = {
  name: "git_status",
  description: "Show concise git status of the working directory",
  parameters: {
    type: "object",
    properties: {},
  },
};

export class GitStatusTool implements Tool {
  readonly spec = gitStatusSpec;

  async execute(args: Record<string, unknown>, context: ToolContext) {
    const toolCallId = toolCallIdFrom(args);
    try {
      const { stdout } = await execFileAsync("git", ["status", "--short", "--branch"], {
        cwd: context.workingDir,
        timeout: 5000,
      });
      return ok(toolCallId, stdout.trim() || "(clean working tree)");
    } catch (error) {
      return fail(toolCallId, error);
    }
  }
}

// --- git_diff ---

export const gitDiffSpec: ToolSpec = {
  name: "git_diff",
  description: "Show working tree diff, optionally for a specific path or staged changes",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File or directory to diff (optional)" },
      cached: { type: "string", description: "Show staged changes: true or false" },
    },
  },
};

export class GitDiffTool implements Tool {
  readonly spec = gitDiffSpec;

  async execute(args: Record<string, unknown>, context: ToolContext) {
    const toolCallId = toolCallIdFrom(args);
    try {
      const filePath = optionalStringArg(args, "path");
      const cached = optionalStringArg(args, "cached") === "true";
      const cmdArgs = ["diff"];
      if (cached) cmdArgs.push("--cached");
      if (filePath) cmdArgs.push("--", filePath);
      const { stdout } = await execFileAsync("git", cmdArgs, {
        cwd: context.workingDir,
        timeout: 10000,
      });
      return ok(toolCallId, stdout || "(no changes)");
    } catch (error) {
      return fail(toolCallId, error);
    }
  }
}

// --- git_log ---

export const gitLogSpec: ToolSpec = {
  name: "git_log",
  description: "Show recent git commit history",
  parameters: {
    type: "object",
    properties: {
      limit: { type: "string", description: "Number of commits (default 10)" },
    },
  },
};

export class GitLogTool implements Tool {
  readonly spec = gitLogSpec;

  async execute(args: Record<string, unknown>, context: ToolContext) {
    const toolCallId = toolCallIdFrom(args);
    try {
      const limit = optionalStringArg(args, "limit") ?? "10";
      const { stdout } = await execFileAsync(
        "git",
        ["log", `--oneline`, `-n`, limit],
        { cwd: context.workingDir, timeout: 5000 }
      );
      return ok(toolCallId, stdout.trim() || "(no commits)");
    } catch (error) {
      return fail(toolCallId, error);
    }
  }
}
