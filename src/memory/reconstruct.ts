import type { KintsugiMemory } from "./memory.js";
import { isLearnPayload, type MemoryEvent } from "./events.js";

export interface ReconstructionWarning {
  eventId?: string;
  line?: number;
  message: string;
}

export interface ReconstructedState {
  events: MemoryEvent[];
  learned: Record<string, string>;
  warnings: ReconstructionWarning[];
}

export function reconstruct(memory: KintsugiMemory): ReconstructedState {
  const queried = memory.ops.queryWithWarnings
    ? memory.ops.queryWithWarnings()
    : { events: memory.ops.query(), warnings: [] };
  const events = queried.events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const byTimestamp = a.event.at.localeCompare(b.event.at);
      return byTimestamp === 0 ? a.index - b.index : byTimestamp;
    })
    .map((entry) => entry.event);
  const learned = new Map<string, { value: string; at: string }>();
  for (const [key, value] of memory.learned.entries()) {
    learned.set(key, { value, at: "" });
  }

  const warnings: ReconstructionWarning[] = [...queried.warnings];
  for (const event of events) {
    if (event.kind !== "learn") {
      continue;
    }
    if (!isLearnPayload(event.payload)) {
      warnings.push({ eventId: event.id, message: "Unsupported learn payload" });
      continue;
    }
    const current = learned.get(event.payload.key);
    if (!current || !current.at || event.at >= current.at) {
      learned.set(event.payload.key, { value: event.payload.value, at: event.at });
    }
  }

  return {
    events,
    learned: Object.fromEntries([...learned.entries()].map(([key, fact]) => [key, fact.value])),
    warnings,
  };
}
