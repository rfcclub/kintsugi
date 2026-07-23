import {
  closeSync,
  copyFileSync,
  existsSync,
  fdatasyncSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RuntimeEvent, TokenUsage } from "../protocol/events.js";
import type { RuntimeMessage } from "../protocol/messages.js";
import type { KintsugiRuntime } from "../runtime/session.js";

export const DEFAULT_SESSION_ROOT = join(homedir(), ".kintsugi", "sessions");

export type SessionLine = (
  | SessionStartLine
  | SessionMessageLine
  | SessionEventLine
  | SessionThinkingLine
  | SessionToolCallLine
  | SessionToolResultLine
  | SessionEndLine
) & {
  turn?: number;
  gitHash?: string;
};

export interface SessionStartLine {
  type: "session.start";
  id: string;
  startedAt: string;
  echo?: string;
  provider?: string;
  model?: string;
}

export interface SessionMessageLine extends RuntimeMessage {
  type: "message";
}

export interface SessionEventLine {
  type: "event";
  event: RuntimeEvent;
}

export interface SessionThinkingLine {
  type: "thinking";
  text: string;
  at: string;
}

export interface SessionToolCallLine {
  type: "tool.call";
  toolCallId?: string;
  toolName: string;
  args: unknown;
  decision: "allow" | "deny" | "prompt" | string;
  at: string;
}

export interface SessionToolResultLine {
  type: "tool.result";
  toolCallId: string;
  output: string;
  isError: boolean;
  at: string;
}

export interface SessionEndLine {
  type: "session.end";
  endedAt: string;
  reason: string;
  messageCount?: number;
  totalTokens?: number;
  usage?: TokenUsage;
}

export interface SessionWriterOptions {
  root?: string;
  id?: string;
  startedAt?: Date;
  syncFile?: (fd: number) => void;
}

export interface SessionStartOptions {
  echo?: string;
  provider?: string;
  model?: string;
}

export class SessionWriter {
  readonly id: string;
  readonly root: string;
  readonly startedAt: Date;
  readonly filePath: string;
  currentTurn?: number;
  currentGitHash?: string;
  private fd: number | undefined;
  private readonly syncFile: (fd: number) => void;
  private closed = false;

  constructor(options: SessionWriterOptions = {}) {
    this.root = options.root ?? DEFAULT_SESSION_ROOT;
    this.startedAt = options.startedAt ?? new Date();
    this.id = options.id ?? generateSessionId(this.startedAt);
    this.filePath = sessionPathForDate(this.root, this.startedAt, this.id);
    this.syncFile = options.syncFile ?? syncFd;
  }

  start(options: SessionStartOptions = {}): SessionStartLine {
    const line: SessionStartLine = {
      type: "session.start",
      id: this.id,
      startedAt: this.startedAt.toISOString(),
      ...definedFields(options),
    };
    this.writeLine(line);
    return line;
  }

  message(message: RuntimeMessage): SessionMessageLine;
  message(role: RuntimeMessage["role"], text: string, at?: string): SessionMessageLine;
  message(
    messageOrRole: RuntimeMessage | RuntimeMessage["role"],
    text?: string,
    at = new Date().toISOString()
  ): SessionMessageLine {
    const message =
      typeof messageOrRole === "string"
        ? { role: messageOrRole, text: text ?? "", at }
        : messageOrRole;
    const line: SessionMessageLine = { type: "message", ...message };
    this.writeLine(line);
    return line;
  }

  event(event: RuntimeEvent): SessionEventLine {
    const line: SessionEventLine = { type: "event", event };
    this.writeLine(line);
    return line;
  }

  toolCall(options: Omit<SessionToolCallLine, "type" | "at"> & { at?: string }): SessionToolCallLine {
    const line: SessionToolCallLine = {
      type: "tool.call",
      at: options.at ?? new Date().toISOString(),
      toolCallId: options.toolCallId,
      toolName: options.toolName,
      args: options.args,
      decision: options.decision,
    };
    this.writeLine(line);
    return line;
  }

  toolResult(options: Omit<SessionToolResultLine, "type" | "at"> & { at?: string }): SessionToolResultLine {
    const line: SessionToolResultLine = {
      type: "tool.result",
      at: options.at ?? new Date().toISOString(),
      toolCallId: options.toolCallId,
      output: options.output,
      isError: options.isError,
    };
    this.writeLine(line);
    return line;
  }

  end(options: Omit<SessionEndLine, "type" | "endedAt"> & { endedAt?: string }): SessionEndLine {
    const line: SessionEndLine = {
      type: "session.end",
      endedAt: options.endedAt ?? new Date().toISOString(),
      reason: options.reason,
      messageCount: options.messageCount,
      totalTokens: options.totalTokens,
      usage: options.usage,
    };
    this.writeLine(line);
    return line;
  }

  thinking(text: string): SessionThinkingLine {
    const line: SessionThinkingLine = {
      type: "thinking",
      text,
      at: new Date().toISOString(),
    };
    this.writeLine(line);
    return line;
  }

  writeLine(line: SessionLine): void {
    if (this.closed) {
      throw new Error(`Session writer is closed: ${this.id}`);
    }

    const fullLine = {
      ...line,
      ...(this.currentTurn !== undefined ? { turn: this.currentTurn } : {}),
      ...(this.currentGitHash !== undefined ? { gitHash: this.currentGitHash } : {}),
    };

    const fd = this.open();
    writeSync(fd, `${JSON.stringify(fullLine)}\n`, undefined, "utf-8");
    this.syncFile(fd);
  }

  close(): void {
    if (this.fd === undefined) {
      this.closed = true;
      return;
    }

    closeSync(this.fd);
    this.fd = undefined;
    this.closed = true;
  }

  private open(): number {
    if (this.fd !== undefined) {
      return this.fd;
    }

    mkdirSync(sessionDateDir(this.root, this.startedAt), { recursive: true });
    this.fd = openSync(this.filePath, "a");
    return this.fd;
  }
}

export function generateSessionId(date = new Date(), randomHex = randomBytes(2).toString("hex")): string {
  return `kng-${localTimestamp(date)}-${randomHex}`;
}

export function sessionPathForId(root: string, id: string): string {
  const date = dateFromSessionId(id);
  if (!date) {
    throw new Error(`Invalid session id: ${id}`);
  }
  return sessionPathForDate(root, date, id);
}

export function sessionPathForDate(root: string, date: Date, id: string): string {
  return join(sessionDateDir(root, date), `${id}.jsonl`);
}

export function sessionExists(root: string, id: string): boolean {
  return existsSync(sessionPathForId(root, id));
}

function sessionDateDir(root: string, date: Date): string {
  return join(root, formatDatePart(date, "year"), formatDatePart(date, "month"), formatDatePart(date, "day"));
}

function localTimestamp(date: Date): string {
  const year = formatDatePart(date, "year");
  const month = formatDatePart(date, "month");
  const day = formatDatePart(date, "day");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}t${hour}${minute}${second}`;
}

function dateFromSessionId(id: string): Date | undefined {
  const match = /^kng-(\d{4})(\d{2})(\d{2})t(\d{2})(\d{2})(\d{2})-[0-9a-f]{4}$/i.exec(id);
  if (!match) {
    return undefined;
  }

  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
}

function formatDatePart(date: Date, part: "year" | "month" | "day"): string {
  if (part === "year") {
    return String(date.getFullYear());
  }
  const value = part === "month" ? date.getMonth() + 1 : date.getDate();
  return String(value).padStart(2, "0");
}

function definedFields<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined)
  ) as Partial<T>;
}

function syncFd(fd: number): void {
  try {
    fdatasyncSync(fd);
  } catch {
    fsyncSync(fd);
  }
}

export function truncateSessionLog(filePath: string, turnIndex: number): void {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  let userPromptCount = 0;
  let truncateAtLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && parsed.type === "message" && parsed.role === "user") {
        userPromptCount++;
        const currentTurn = parsed.turn !== undefined ? parsed.turn : userPromptCount;
        if (currentTurn === turnIndex + 1) {
          truncateAtLineIndex = i;
          break;
        }
      }
    } catch {
      // Ignore
    }
  }

  if (truncateAtLineIndex !== -1) {
    const keptLines = lines.slice(0, truncateAtLineIndex);
    writeFileSync(filePath, keptLines.join("\n") + (keptLines.length > 0 ? "\n" : ""), "utf-8");
  }
}

export function updateGitHashInSessionLog(filePath: string, turnIndex: number, gitHash: string): void {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  let userPromptCount = 0;
  let modified = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && parsed.type === "message" && parsed.role === "user") {
        userPromptCount++;
        const currentTurn = parsed.turn !== undefined ? parsed.turn : userPromptCount;
        if (currentTurn === turnIndex) {
          parsed.gitHash = gitHash;
          lines[i] = JSON.stringify(parsed);
          modified = true;
          break;
        }
      }
    } catch {
      // Ignore
    }
  }

  if (modified) {
    writeFileSync(filePath, lines.join("\n"), "utf-8");
  }
}

export function branchSession(runtime: KintsugiRuntime, branchName: string): string {
  if (!runtime.sessionId) {
    throw new Error("No active session to branch");
  }
  if (!runtime.sessionWriter) {
    throw new Error("No session writer found on runtime");
  }

  const originalId = runtime.sessionId;
  const originalPath = runtime.sessionWriter.filePath;

  const newId = `${originalId}-branch-${branchName}`;
  const newPath = originalPath.replace(`${originalId}.jsonl`, `${newId}.jsonl`);

  copyFileSync(originalPath, newPath);

  runtime.sessionWriter.close();

  const newWriter = new SessionWriter({
    root: runtime.sessionWriter.root,
    id: newId,
    startedAt: runtime.sessionWriter.startedAt,
  });

  runtime.sessionId = newId;
  runtime.sessionWriter = newWriter;

  return newId;
}
