# Tasks: Phase 7 — Shared Memory

## Types and Interfaces

- [x] T1: Create `src/memory/events.ts` — `MemoryEvent`, `MemoryEventKind`
- [x] T2: Create `src/memory/memory.ts` — `KintsugiMemory`, `LearnedFacts` interfaces
- [x] T3: Create `src/memory/minor.ts` — `MinorMemory` interface and implementation

## Ops Log

- [x] T4: Create `src/memory/ops-store.ts` — append + query for JSON Lines ops.log
- [x] T5: Support `KINTSUGI_MEMORY_DIR` env var to override default path
- [x] T6: Auto-generate `id` (uuid) and `at` (ISO timestamp) on log()

## Learned Store

- [x] T7: Create `src/memory/learned-store.ts` — key-value JSON store
- [x] T8: Persist to `~/.local/share/kintsugi/memory/learned/` (one file per key or flat JSON)

## Echo Integration

- [x] T9: Emit `echo` event to ops log on `loadSubstrate()` — in runtime boot

## Reconstruction

- [x] T10: Create `src/memory/reconstruct.ts` — `reconstruct()` reads log + learned
- [x] T11: Wire `reconstruct()` into runtime boot sequence

## Minor Memory

- [x] T12: Implement `MinorMemory` with in-memory store + `flush()` to `~/.local/state/kintsugi/minor-memory.json`
- [x] T13: Restore on boot from `~/.local/state/kintsugi/minor-memory.json`

## Tests

- [x] T14: Create `tests/memory/ops-store.test.ts` — append, query, env override
- [x] T15: Create `tests/memory/learned-store.test.ts` — get, set, persist
- [x] T16: Create `tests/memory/minor.test.ts` — get, set, flush, not in shared log
- [x] T17: Create `tests/memory/reconstruct.test.ts` — reconstruct returns events + learned

## Verification

- [x] T18: `npm run build` succeeds
- [x] T19: `npm test` passes
- [x] T20: `kintsugi boot` emits echo event to ops.log
- [x] T21: `kintsugi remember` queries ops.log and returns results

## Coordination

- [x] T22: Align on the shared memory backend on shared memory backend contract (interface must match)

---

*Tasks: Kintsugi — 2026-05-20*
