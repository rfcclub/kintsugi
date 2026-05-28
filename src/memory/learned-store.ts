import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LearnedFacts } from "./memory.js";

const DEFAULT_MEMORY_DIR = join(homedir(), ".local", "share", "kintsugi", "memory");

export function resolveLearnedDir(memoryDir?: string): string {
  const dir = memoryDir ?? process.env.KINTSUGI_MEMORY_DIR ?? DEFAULT_MEMORY_DIR;
  return join(dir, "learned");
}

export interface LearnedStoreOptions {
  memoryDir?: string;
}

export class LearnedStore implements LearnedFacts {
  private readonly filePath: string;
  private store: Record<string, string> = {};
  private loaded = false;

  constructor(options?: LearnedStoreOptions) {
    const learnedDir = resolveLearnedDir(options?.memoryDir);
    mkdirSync(learnedDir, { recursive: true });
    this.filePath = join(learnedDir, "facts.json");
  }

  get(key: string): string | undefined {
    this.ensureLoaded();
    return this.store[key];
  }

  set(key: string, value: string): void {
    this.ensureLoaded();
    this.store[key] = value;
    this.persist();
  }

  entries(): Iterable<[string, string]> {
    this.ensureLoaded();
    return Object.entries(this.store);
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

  private persist(): void {
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), "utf-8");
  }
}
