export type { RuntimeMessage } from "../protocol/messages.js";
import type { RuntimeMessage } from "../protocol/messages.js";

export interface KintsugiRuntime {
  sessionId?: string;
  provider?: string;
  model?: string;
  modelProfile?: string;
  providerPreset?: string;
  modelConfig?: import("../providers/config.js").ModelConfig;
  substrate?: LoadedSubstrate;
  startedAt: string;
  prompts: RuntimeMessage[];
  promptConfig?: PromptConfig;
  toolRegistry?: import("../tools/registry.js").ToolRegistry;
  workspaceRoots?: string[];
  permissionPolicy?: import("./permissions.js").PermissionPolicy;
  sessionPermissions?: Record<string, import("./permissions.js").PermissionDecision>;
  permissionDecider?: (
    toolName: string,
    args: unknown,
    signal?: AbortSignal
  ) => Promise<import("./permissions.js").PermissionDecision>;
  sessionWriter?: import("../store/sessions.js").SessionWriter;
  opsLog?: import("../memory/ops-store.js").OpsLog;
  memory?: import("../memory/memory.js").KintsugiMemory;
  reconstructedMemory?: import("../memory/reconstruct.js").ReconstructedState;
  minorMemory?: import("../memory/minor.js").MinorMemory;
  messageCount?: number;
  totalTokens?: number;
  config?: import("../config/config.js").ResolvedConfig;
  workspace?: string;
  systemInstructions?: string;
  allowedTools?: string[];
  subagentDepth?: number;
  subagentManager?: import("./subagents.js").SubagentManager;
  parentId?: string;
  incomingMessages?: any[];
  messageHandler?: (msg: any) => Promise<void> | void;
}

export interface LoadedSubstrate {
  path: string;
  content: string;
}

export interface RuntimeOptions {
  substrate?: string;
  noSubstrate?: boolean;
  promptConfig?: PromptConfig;
  sessionId?: string;
  provider?: string;
  model?: string;
  modelProfile?: string;
  providerPreset?: string;
  modelConfig?: import("../providers/config.js").ModelConfig;
  toolRegistry?: import("../tools/registry.js").ToolRegistry;
  workspaceRoots?: string[];
  permissionPolicy?: import("./permissions.js").PermissionPolicy;
  sessionWriter?: import("../store/sessions.js").SessionWriter;
  opsLog?: import("../memory/ops-store.js").OpsLog;
  memory?: import("../memory/memory.js").KintsugiMemory;
  minorMemory?: import("../memory/minor.js").MinorMemory;
  systemInstructions?: string;
  allowedTools?: string[];
  subagentManager?: import("./subagents.js").SubagentManager;
  subagentDepth?: number;
}

export interface PromptConfig {
  echoBudget?: number;
  projectBudget?: number;
  workspaceBudget?: number;
  memoryBudget?: number;
  sessionBudget?: number;
  projectPath?: string;
  workspacePath?: string | false;
  injectCodexOne?: boolean;
}
