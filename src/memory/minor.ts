import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_MINOR_PATH = join(homedir(), ".local", "state", "kintsugi", "minor-memory.json");

export interface MinorMemoryOptions {
  filePath?: string;
}

export class MinorMemory {
  private readonly filePath: string;
  private store: Record<string, unknown> = {};
  private loaded = false;

  constructor(options?: MinorMemoryOptions) {
    this.filePath = options?.filePath ?? process.env.KINTSUGI_MINOR_MEMORY_PATH ?? DEFAULT_MINOR_PATH;
  }

  get<T>(key: string, fallback: T): T {
    this.ensureLoaded();
    return (this.store[key] as T) ?? fallback;
  }

  set<T>(key: string, value: T): void {
    this.ensureLoaded();
    this.store[key] = value;
  }

  remove(key: string): void {
    this.ensureLoaded();
    delete this.store[key];
  }

  flush(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), "utf-8");
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!existsSync(this.filePath)) return;
    try {
      const content = readFileSync(this.filePath, "utf-8");
      this.store = JSON.parse(content);
    } catch {
      this.store = {};
    }
  }
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(0, i) : ".";
}
