import { existsSync, readFileSync } from "node:fs";
import { bootRuntime } from "../runtime/runtime.js";
import type { KintsugiRuntime } from "../runtime/session.js";
import type { RuntimeMessage } from "../protocol/messages.js";
import {
  DEFAULT_SESSION_ROOT,
  type SessionLine,
  type SessionMessageLine,
  type SessionStartLine,
  sessionPathForId,
} from "./sessions.js";

export interface SessionReference {
  id?: string;
  filePath?: string;
  root?: string;
}

export interface ParsedSessionLog {
  filePath: string;
  lines: SessionLine[];
  warnings: number;
}

export interface ReplaySessionResult {
  runtime: KintsugiRuntime;
  warnings: number;
  start?: SessionStartLine;
  provider?: string;
  model?: string;
  messages: RuntimeMessage[];
}

export class SessionNotFoundError extends Error {
  constructor(reference: SessionReference) {
    const target = reference.filePath ?? reference.id ?? "unknown";
    super(`Session not found: ${target}`);
    this.name = "SessionNotFoundError";
  }
}

export function replaySession(reference: string | SessionReference): ReplaySessionResult {
  const parsed = readSessionLog(reference);
  const start = parsed.lines.find(isSessionStartLine);
  const messages = parsed.lines.filter(isSessionMessageLine).map(toRuntimeMessage);
  const runtime = bootRuntime(
    start?.echo ? { substrate: start.echo } : { noSubstrate: true }
  );

  runtime.startedAt = start?.startedAt ?? runtime.startedAt;
  runtime.prompts = messages;

  return {
    runtime,
    warnings: parsed.warnings + (start ? 0 : 1),
    start,
    provider: start?.provider,
    model: start?.model,
    messages,
  };
}

export function readSessionLog(reference: string | SessionReference): ParsedSessionLog {
  const filePath = resolveSessionPath(reference);
  if (!existsSync(filePath)) {
    throw new SessionNotFoundError(
      typeof reference === "string" ? { id: reference } : reference
    );
  }

  let warnings = 0;
  const lines: SessionLine[] = [];
  for (const line of readFileSync(filePath, "utf-8").split("\n")) {
    if (!line.trim()) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as unknown;
      if (isSessionLine(parsed)) {
        lines.push(parsed);
      } else {
        warnings += 1;
      }
    } catch {
      warnings += 1;
    }
  }

  return { filePath, lines, warnings };
}

export function resolveSessionPath(reference: string | SessionReference): string {
  if (typeof reference === "string") {
    return sessionPathForId(DEFAULT_SESSION_ROOT, reference);
  }

  if (reference.filePath) {
    return reference.filePath;
  }

  if (!reference.id) {
    throw new Error("Session id or file path is required");
  }

  return sessionPathForId(reference.root ?? DEFAULT_SESSION_ROOT, reference.id);
}

function toRuntimeMessage(line: SessionMessageLine): RuntimeMessage {
  return { role: line.role, text: line.text, at: line.at };
}

function isSessionLine(value: unknown): value is SessionLine {
  if (!value || typeof value !== "object") {
    return false;
  }

  const line = value as Record<string, unknown>;
  switch (line.type) {
    case "session.start":
      return isSessionStartLine(value);
    case "message":
      return isSessionMessageLine(value);
    case "event":
      return typeof line.event === "object" && line.event !== null;
    case "tool.call":
      return typeof line.toolName === "string" && "args" in line && typeof line.decision === "string";
    case "tool.result":
      return (
        typeof line.toolCallId === "string" &&
        typeof line.output === "string" &&
        typeof line.isError === "boolean"
      );
    case "session.end":
      return typeof line.endedAt === "string" && typeof line.reason === "string";
    default:
      return false;
  }
}

function isSessionStartLine(value: unknown): value is SessionStartLine {
  if (!value || typeof value !== "object") {
    return false;
  }

  const line = value as Record<string, unknown>;
  return (
    line.type === "session.start" &&
    typeof line.id === "string" &&
    typeof line.startedAt === "string" &&
    (line.echo === undefined || typeof line.echo === "string") &&
    (line.provider === undefined || typeof line.provider === "string") &&
    (line.model === undefined || typeof line.model === "string")
  );
}

function isSessionMessageLine(value: unknown): value is SessionMessageLine {
  if (!value || typeof value !== "object") {
    return false;
  }

  const line = value as Record<string, unknown>;
  return (
    line.type === "message" &&
    (line.role === "user" ||
      line.role === "assistant" ||
      line.role === "runtime" ||
      line.role === "tool") &&
    typeof line.text === "string" &&
    typeof line.at === "string"
  );
}
