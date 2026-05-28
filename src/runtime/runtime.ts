import { createHash } from "node:crypto";
import { loadSubstrate } from "../substrate/echo.js";
import { LearnedStore } from "../memory/learned-store.js";
import { MinorMemory } from "../memory/minor.js";
import { OpsLog } from "../memory/ops-store.js";
import { reconstruct } from "../memory/reconstruct.js";
import { PermissionPolicy } from "./permissions.js";
import { createDefaultToolRegistry } from "../tools/builtins.js";
import type { LoadedSubstrate } from "./session.js";
import type { RuntimeOptions, RuntimeMessage, KintsugiRuntime } from "./session.js";

export type { RuntimeOptions, RuntimeMessage, KintsugiRuntime, LoadedSubstrate };

export function bootRuntime(options: RuntimeOptions = {}): KintsugiRuntime {
  const substrate = loadSubstrate(options) as LoadedSubstrate | undefined;
  const opsLog = options.opsLog ?? new OpsLog();
  const memory = options.memory ?? {
    ops: opsLog,
    learned: new LearnedStore(),
    reconstruct() {
      return reconstruct(this);
    },
  };
  const minorMemory = options.minorMemory ?? new MinorMemory();
  const reconstructedMemory = memory.reconstruct();

  // Emit echo event to shared memory on boot
  if (substrate) {
    memory.ops.log({
      kind: "echo",
      actor: "kintsugi",
      payload: { path: substrate.path, hash: hashContent(substrate.content) },
    });
  }

  return {
    sessionId: options.sessionId,
    provider: options.provider,
    model: options.model,
    modelProfile: options.modelProfile,
    providerPreset: options.providerPreset,
    modelConfig: options.modelConfig,
    substrate,
    startedAt: new Date().toISOString(),
    prompts: [],
    promptConfig: options.promptConfig,
    toolRegistry: options.toolRegistry ?? createDefaultToolRegistry(),
    workspaceRoots: options.workspaceRoots,
    permissionPolicy: options.permissionPolicy ?? new PermissionPolicy(),
    sessionPermissions: {},
    sessionWriter: options.sessionWriter,
    messageCount: 0,
    totalTokens: 0,
    opsLog,
    memory,
    reconstructedMemory,
    minorMemory,
  };
}

export function renderBoot(runtime: KintsugiRuntime): string {
  const lines = [
    "kintsugi runtime",
    `started: ${runtime.startedAt}`,
    runtime.substrate
      ? `echo: ${runtime.substrate.path}`
      : "echo: not loaded",
  ];

  if (runtime.substrate) {
    lines.push(`echo bytes: ${Buffer.byteLength(runtime.substrate.content, "utf-8")}`);
  }

  if (runtime.opsLog) {
    lines.push(`memory path: ${runtime.opsLog.memoryDir}`);
  }

  if (runtime.reconstructedMemory) {
    lines.push(`memory events: ${runtime.reconstructedMemory.events.length}`);
    lines.push(`learned facts: ${Object.keys(runtime.reconstructedMemory.learned).length}`);
    lines.push(`memory warnings: ${runtime.reconstructedMemory.warnings.length}`);
  }

  return lines.join("\n");
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * @deprecated Phase 2 routes prompts through `runTurn()` and a Provider.
 */
export function handlePrompt(runtime: KintsugiRuntime, prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return "No prompt received.";
  }

  const echoStatus = runtime.substrate
    ? `Echo loaded from ${runtime.substrate.path}.`
    : "Echo not loaded.";

  const response = [
    echoStatus,
    "Runtime core is active, but no model/provider backend is attached yet.",
    `Received: ${trimmed}`,
  ].join("\n");

  const now = new Date().toISOString();
  runtime.prompts.push({ role: "user", text: trimmed, at: now });
  runtime.prompts.push({ role: "runtime", text: response, at: new Date().toISOString() });

  return response;
}
