import {
  closeSync,
  existsSync,
  fdatasyncSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { DEFAULT_SESSION_ROOT } from "./sessions.js";

export interface SessionIndexEntry {
  id: string;
  startedAt: string;
  endedAt?: string | null;
  messageCount: number;
  provider?: string;
  model?: string;
  totalTokens?: number;
}

export interface SessionIndexReadResult {
  entries: SessionIndexEntry[];
  warnings: number;
}

export interface SessionIndexOptions {
  root?: string;
  syncFile?: (fd: number) => void;
}

export class SessionIndex {
  readonly root: string;
  readonly indexPath: string;
  private readonly syncFile: (fd: number) => void;

  constructor(options: SessionIndexOptions = {}) {
    this.root = options.root ?? DEFAULT_SESSION_ROOT;
    this.indexPath = join(this.root, "index.jsonl");
    this.syncFile = options.syncFile ?? syncFd;
  }

  append(entry: SessionIndexEntry): void {
    mkdirSync(this.root, { recursive: true });
    const fd = openSync(this.indexPath, "a");
    try {
      writeSync(fd, `${JSON.stringify(entry)}\n`, undefined, "utf-8");
      this.syncFile(fd);
    } finally {
      closeSync(fd);
    }
  }

  appendStart(entry: Omit<SessionIndexEntry, "endedAt" | "messageCount"> & { messageCount?: number }): void {
    this.append({
      ...entry,
      endedAt: null,
      messageCount: entry.messageCount ?? 0,
    });
  }

  appendEnd(entry: SessionIndexEntry & { endedAt: string }): void {
    this.append(entry);
  }

  read(): SessionIndexReadResult {
    if (!existsSync(this.indexPath)) {
      return { entries: [], warnings: 0 };
    }

    let warnings = 0;
    const entries: SessionIndexEntry[] = [];
    const lines = readFileSync(this.indexPath, "utf-8").split("\n");
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      try {
        const parsed = JSON.parse(line) as unknown;
        if (isSessionIndexEntry(parsed)) {
          entries.push(parsed);
        } else {
          warnings += 1;
        }
      } catch {
        warnings += 1;
      }
    }

    return { entries, warnings };
  }

  list(): SessionIndexEntry[] {
    const latest = new Map<string, SessionIndexEntry>();
    for (const entry of this.read().entries) {
      latest.set(entry.id, entry);
    }

    return [...latest.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
}

function isSessionIndexEntry(value: unknown): value is SessionIndexEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.startedAt === "string" &&
    typeof entry.messageCount === "number" &&
    (entry.endedAt === undefined || entry.endedAt === null || typeof entry.endedAt === "string") &&
    (entry.provider === undefined || typeof entry.provider === "string") &&
    (entry.model === undefined || typeof entry.model === "string") &&
    (entry.totalTokens === undefined || typeof entry.totalTokens === "number")
  );
}

function syncFd(fd: number): void {
  try {
    fdatasyncSync(fd);
  } catch {
    fsyncSync(fd);
  }
}
