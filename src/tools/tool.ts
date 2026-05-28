import type { PermissionDecision } from "../runtime/permissions.js";

export interface ToolSpec {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, PropertySpec>;
    required?: string[];
  };
}

export interface PropertySpec {
  type: string;
  description: string;
  enum?: string[];
}

export interface ToolResult {
  toolCallId: string;
  output: string;
  isError: boolean;
}

export interface ToolContext {
  workingDir: string;
  workspaceRoots: string[];
  permission: PermissionDecision;
  signal?: AbortSignal;
}

export interface Tool {
  readonly spec: ToolSpec;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
