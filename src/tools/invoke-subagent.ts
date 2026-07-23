import type { Tool, ToolContext, ToolResult, ToolSpec } from "./tool.js";
import { fail, ok, requireAllowed, stringArg, toolCallIdFrom } from "./utils.js";
import type { SubagentManager } from "../runtime/subagents.js";

export const invokeSubagentSpec: ToolSpec = {
  name: "invoke_subagent",
  description: "Spawn a subagent to run a background task",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "Unique ID of the subagent" },
      role: { type: "string", description: "Role of the subagent" },
      prompt: { type: "string", description: "System prompt / instructions for the subagent" },
      permissions: {
        type: "array",
        items: { type: "string" },
        description: "Allowed tools for the subagent"
      }
    },
    required: ["id", "role", "prompt"],
  },
};

export class InvokeSubagentTool implements Tool {
  readonly spec = invokeSubagentSpec;

  constructor(private manager: SubagentManager) {}

  async execute(args: Record<string, unknown>, context: ToolContext) {
    const toolCallId = toolCallIdFrom(args);
    try {
      requireAllowed(context.permission);
      const id = stringArg(args, "id");
      const role = stringArg(args, "role");
      const prompt = stringArg(args, "prompt");
      
      let permissions: string[] = [];
      if (args.permissions !== undefined) {
        if (Array.isArray(args.permissions)) {
          permissions = args.permissions.map(p => String(p));
        } else if (typeof args.permissions === "string") {
          permissions = [args.permissions];
        }
      }

      const runtime = (context as any).runtime;
      if (!runtime) {
        throw new Error("Runtime context missing");
      }

      this.manager.spawn({ id, role, prompt, permissions }, runtime);

      return ok(toolCallId, `Subagent ${id} spawned successfully`);
    } catch (error) {
      return fail(toolCallId, error);
    }
  }
}
