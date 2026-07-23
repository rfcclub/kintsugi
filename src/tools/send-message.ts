import type { Tool, ToolContext, ToolResult, ToolSpec } from "./tool.js";
import { fail, ok, requireAllowed, stringArg, toolCallIdFrom } from "./utils.js";
import type { SubagentManager } from "../runtime/subagents.js";

export const sendMessageSpec: ToolSpec = {
  name: "send_message",
  description: "Send a message to another agent",
  parameters: {
    type: "object",
    properties: {
      recipientId: { type: "string", description: "ID of the recipient agent (or 'parent')" },
      content: { type: "string", description: "Message content" },
    },
    required: ["recipientId", "content"],
  },
};

export class SendMessageTool implements Tool {
  readonly spec = sendMessageSpec;

  constructor(private manager: SubagentManager) {}

  async execute(args: Record<string, unknown>, context: ToolContext) {
    const toolCallId = toolCallIdFrom(args);
    try {
      requireAllowed(context.permission);
      const recipientId = stringArg(args, "recipientId");
      const content = stringArg(args, "content");

      const runtime = (context as any).runtime;
      if (!runtime) {
        throw new Error("Runtime context missing");
      }

      const senderId = runtime.sessionId ?? "parent";

      this.manager.sendMessage(senderId, recipientId, content);

      return ok(toolCallId, `Message sent to ${recipientId}`);
    } catch (error) {
      return fail(toolCallId, error);
    }
  }
}
