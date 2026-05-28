import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseMemoryEventLine, type MemoryEvent, type MemoryEventKind } from "./events.js";

export const DEFAULT_MEMORY_DIR = join(homedir(), ".local", "share", "kintsugi", "memory");

export interface OpsLogWarning {
  line: number;
  message: string;
}

export interface OpsLogQueryResult {
  events: MemoryEvent[];
  warnings: OpsLogWarning[];
}

export function resolveMemoryDir(): string {
  return process.env.KINTSUGI_MEMORY_DIR ?? DEFAULT_MEMORY_DIR;
}

export class OpsLog {
  readonly memoryDir: string;
  private readonly filePath: string;

  constructor(memoryDir?: string) {
    const dir = memoryDir ?? resolveMemoryDir();
    this.memoryDir = dir;
    mkdirSync(dir, { recursive: true });
    this.filePath = join(dir, "ops.log");
  }

  log(event: Omit<MemoryEvent, "id" | "at">): void {
    const line: MemoryEvent = {
      ...event,
      id: randomUUID(),
      at: new Date().toISOString(),
    };
    appendFileSync(this.filePath, JSON.stringify(line) + "\n", "utf-8");
  }

  query(opts?: {
    kind?: MemoryEventKind;
    from?: string;
    until?: string;
    actor?: string;
  }): MemoryEvent[] {
    return this.queryWithWarnings(opts).events;
  }

  queryWithWarnings(opts?: {
    kind?: MemoryEventKind;
    from?: string;
    until?: string;
    actor?: string;
  }): OpsLogQueryResult {
    if (!existsSync(this.filePath)) {
      return { events: [], warnings: [] };
    }

    const content = readFileSync(this.filePath, "utf-8");
    const lines = content.split("\n");
    const events: Array<{ event: MemoryEvent; index: number }> = [];
    const warnings: OpsLogWarning[] = [];

    for (const [index, line] of lines.entries()) {
      if (!line.trim()) {
        continue;
      }
      const parsed = parseMemoryEventLine(line, index + 1);
      if (!parsed.ok) {
        warnings.push({ line: parsed.warning.line, message: parsed.warning.reason });
        continue;
      }
      const event = parsed.event;
      if (opts?.kind && event.kind !== opts.kind) continue;
      if (opts?.actor && event.actor !== opts.actor) continue;
      if (opts?.from && event.at < opts.from) continue;
      if (opts?.until && event.at > opts.until) continue;
      events.push({ event, index });
    }

    events.sort((a, b) => {
      const byTimestamp = a.event.at.localeCompare(b.event.at);
      return byTimestamp === 0 ? a.index - b.index : byTimestamp;
    });

    return { events: events.map((entry) => entry.event), warnings };
  }
}
