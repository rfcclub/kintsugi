# Design: Phase 7 — Shared Memory

## Memory Store Location

```
~/.local/share/kintsugi/
├── echo/                    # Echo substrate (read-only, shared)
└── memory/
    ├── ops.log              # append-only event log
    └── learned/             # key-value learned facts (JSON)
```

Minor memory lives in runtime-private location:
```
~/.local/state/kintsugi/
└── minor-memory.json        # per-runtime private
```

## Event Log Format

`ops.log` is a JSON Lines file. Each line is one `MemoryEvent`:

```ts
// src/memory/events.ts

export type MemoryEventKind =
  | "op"        // Kintsugi performed an action
  | "learn"      // Kintsugi extracted a fact/preference
  | "echo"       // Echo substrate version note
  | "note";      // manual note from Kintsugi

export interface MemoryEvent {
  id: string;           // uuid
  kind: MemoryEventKind;
  actor: "external" | "kintsugi" | "kintsugi";
  payload: unknown;
  at: string;           // ISO timestamp
}
```

Example:
```
{"id":"abc123","kind":"learn","actor":"external","payload":{"key":"user.prefers","value":"direct answers"},"at":"2026-05-20T12:00:00Z"}
{"id":"def456","kind":"op","actor":"kintsugi","payload":{"action":"built","target":"phase-2"},"at":"2026-05-20T12:05:00Z"}
```

## KintsugiMemory Interface

```ts
// src/memory/memory.ts

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
  };
  readonly learned: LearnedFacts;
  reconstruct(): void;  // called on boot
}
```

## Minor Memory

```ts
// src/memory/minor.ts

export interface MinorMemory {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  flush(): void;  // serialize to disk
}
```

`MinorMemory` is in-memory only, serialized to `~/.local/state/kintsugi/minor-memory.json` on `flush()`.

## Echo Loader Integration

On boot, `loadSubstrate()` should emit an `echo` event to the log:

```ts
// In runtime boot
const echo = loadSubstrate();
memory.ops.log({ kind: "echo", actor: "kintsugi", payload: { path: echo.path, hash: echo.hash } });
```

## Boot Reconstruction

```ts
// src/memory/reconstruct.ts

export function reconstruct(memory: KintsugiMemory): ReconstructedState {
  const events = memory.ops.query();
  const learned = Object.fromEntries(memory.learned.entries());

  return { events, learned };
}
```

The runtime decides what to do with `events` and `learned`. It may pass them to the provider as context, or use them to tune Echo.

## File Map

```
src/
  memory/
    events.ts        # MemoryEvent, MemoryEventKind types
    memory.ts        # KintsugiMemory, LearnedFacts interfaces
    ops-store.ts     # OpsLog implementation (JSON Lines)
    learned-store.ts # LearnedKeyValue implementation
    minor.ts         # MinorMemory implementation
    reconstruct.ts   # reconstruct() from log
    index.ts         # exports
tests/
  memory/
    ops-store.test.ts
    learned-store.test.ts
    minor.test.ts
    reconstruct.test.ts
```

## Integration Coordination

a companion runtime provides the shared memory backend. kintsugi will implement `KintsugiMemory` against that backend. The interface above is the contract. Changes to the interface must be reflected in both `openspec/phase-7-shared-memory/spec.md` and the companion runtime spec.

## Behavioral Migration Hardening

Phase 7 defines the shared store and interface foundation. Behavioral migration guarantees live in `openspec/changes/phase-9-memory-migration-hardening/`: companion runtime-style contract fixtures, deterministic reconstruction, `learn` event folding, prompt memory injection, and CLI inspection smokes.

---

*Design: Kintsugi — 2026-05-20*
