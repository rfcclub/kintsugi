import type { MemoryEvent, MemoryEventKind } from "./events.js";
import type { ReconstructedState } from "./reconstruct.js";

export interface LearnedFacts {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  entries(): Iterable<[string, string]>;
}

export interface KintsugiMemory {
  readonly ops: {
    log(event: Omit<MemoryEvent, "id" | "at">): void;
    query(opts?: {
      kind?: MemoryEventKind;
      from?: string;
      until?: string;
      actor?: string;
    }): MemoryEvent[];
    queryWithWarnings?(opts?: {
      kind?: MemoryEventKind;
      from?: string;
      until?: string;
      actor?: string;
    }): {
      events: MemoryEvent[];
      warnings: Array<{ line?: number; message: string }>;
    };
  };
  readonly learned: LearnedFacts;
  reconstruct(): ReconstructedState;
}
