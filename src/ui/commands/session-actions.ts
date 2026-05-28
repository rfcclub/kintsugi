import { PermissionPolicy } from "../../runtime/permissions.js";
import { bootRuntime, type KintsugiRuntime } from "../../runtime/runtime.js";
import type { ResolvedConfig } from "../../config/config.js";
import { replaySession, type SessionReference } from "../../store/replay.js";
import { SessionIndex, type SessionIndexOptions } from "../../store/index.js";
import {
  SessionWriter,
  type SessionEndLine,
  type SessionWriterOptions,
} from "../../store/sessions.js";
import { applyModelSelection, resolveModelSelection } from "./model-actions.js";

export interface SessionActionStores {
  writer?: SessionWriterOptions;
  index?: SessionIndexOptions;
}

export interface StartSessionOptions {
  stores?: SessionActionStores;
  attachWriter?: boolean;
}

export interface FinishRuntimeOptions {
  reason?: string;
  index?: SessionIndexOptions;
}

export interface SessionActionResult {
  runtime: KintsugiRuntime;
  previousEnd?: SessionEndLine;
}

export function finishRuntimeSession(
  runtime: KintsugiRuntime,
  options: FinishRuntimeOptions = {}
): SessionEndLine | undefined {
  const writer = runtime.sessionWriter;
  if (!writer) {
    return undefined;
  }

  const end = writer.end({
    reason: options.reason ?? "slash_command",
    messageCount: runtimeMessageCount(runtime),
    totalTokens: runtime.totalTokens,
  });

  new SessionIndex(options.index).appendEnd({
    id: writer.id,
    startedAt: writer.startedAt.toISOString(),
    endedAt: end.endedAt,
    messageCount: runtimeMessageCount(runtime),
    provider: runtime.provider,
    model: runtime.model,
    totalTokens: runtime.totalTokens,
  });

  writer.close();
  runtime.sessionWriter = undefined;
  return end;
}

export function startFreshSessionRuntime(
  config: ResolvedConfig,
  options: StartSessionOptions = {}
): KintsugiRuntime {
  return attachSessionWriter(
    bootRuntime({
      substrate: config.substrate,
      noSubstrate: config.noSubstrate,
      provider: config.provider,
      model: config.model,
      modelProfile: config.modelProfile,
      providerPreset: config.providerPreset,
      modelConfig: config.modelConfig,
      permissionPolicy: new PermissionPolicy(config.permissions),
    }),
    config,
    options
  );
}

export function startReplayedSessionRuntime(
  reference: string | SessionReference,
  config: ResolvedConfig,
  options: StartSessionOptions = {}
): KintsugiRuntime {
  return attachSessionWriter(replaySession(reference).runtime, config, options);
}

export function createNewSessionRuntime(
  current: KintsugiRuntime,
  config: ResolvedConfig,
  options: StartSessionOptions & FinishRuntimeOptions = {}
): SessionActionResult {
  const previousEnd = finishRuntimeSession(current, {
    reason: options.reason ?? "new_session",
    index: options.stores?.index ?? options.index,
  });
  return {
    runtime: startFreshSessionRuntime(config, options),
    previousEnd,
  };
}

export function resumeSessionRuntime(
  current: KintsugiRuntime,
  reference: string | SessionReference,
  config: ResolvedConfig,
  options: StartSessionOptions & FinishRuntimeOptions = {}
): SessionActionResult {
  const previousEnd = finishRuntimeSession(current, {
    reason: options.reason ?? "resume_session",
    index: options.stores?.index ?? options.index,
  });
  return {
    runtime: startReplayedSessionRuntime(reference, config, options),
    previousEnd,
  };
}

function attachSessionWriter(
  runtime: KintsugiRuntime,
  config: ResolvedConfig,
  options: StartSessionOptions
): KintsugiRuntime {
  const selection = resolveModelSelection(config);
  applyModelSelection(runtime, selection);
  runtime.permissionPolicy = new PermissionPolicy(config.permissions);

  if (options.attachWriter === false) {
    return runtime;
  }

  const writer = new SessionWriter(options.stores?.writer);
  const model = selection.model ?? selection.providerSettings.model;
  runtime.sessionId = writer.id;
  runtime.sessionWriter = writer;
  writer.start({
    echo: runtime.substrate?.path,
    provider: selection.provider,
    model,
  });

  new SessionIndex(options.stores?.index).appendStart({
    id: writer.id,
    startedAt: writer.startedAt.toISOString(),
    provider: selection.provider,
    model,
  });

  return runtime;
}

function runtimeMessageCount(runtime: KintsugiRuntime): number {
  return runtime.messageCount && runtime.messageCount > 0
    ? runtime.messageCount
    : runtime.prompts.length;
}
