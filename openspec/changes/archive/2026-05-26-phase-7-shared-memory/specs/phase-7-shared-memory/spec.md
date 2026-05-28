# Spec: Phase 7 — Shared Memory

## ADDED Requirements

### Requirement: KintsugiMemory interface SHALL define shared memory operations

Both companion runtime and kintsugi SHALL implement `KintsugiMemory` with `ops.log()`, `ops.query()`, and `learned` key-value store.

#### Scenario: Ops log appends events
- **WHEN** `memory.ops.log({ kind: "learn", actor: "kintsugi", payload: { key: "x", value: "y" } })` is called
- **THEN** a new JSON line is appended to `~/.local/share/kintsugi/memory/ops.log`
- **AND** the event has `id` (uuid) and `at` (ISO timestamp) auto-generated

#### Scenario: Ops log queries by filters
- **WHEN** `memory.ops.query({ kind: "learn", actor: "kintsugi" })` is called
- **THEN** it returns only events matching the filters, ordered by `at` ascending

#### Scenario: Learned facts persist across boots
- **WHEN** `memory.learned.set("user.prefers", "direct")` is called
- **AND** the runtime is restarted
- **THEN** `memory.learned.get("user.prefers")` returns `"direct"`

### Requirement: MinorMemory SHALL be per-runtime private

`MinorMemory` SHALL store runtime-private session data that does NOT go into the shared log.

#### Scenario: Minor memory is not in shared log
- **WHEN** `minorMemory.set("session.prompts", [...])` is called
- **THEN** `ops.log()` does NOT record this
- **AND** other runtimes cannot query it

#### Scenario: Minor memory persists on flush
- **WHEN** `minorMemory.flush()` is called
- **THEN** data is serialized to `~/.local/state/kintsugi/minor-memory.json`
- **AND** on next boot, data is restored from that file

### Requirement: Echo version SHALL be logged on boot

When `loadSubstrate()` runs, an `echo` event SHALL be written to the ops log.

#### Scenario: Echo event on boot
- **WHEN** `loadSubstrate()` returns `{ path, content, hash }`
- **THEN** `memory.ops.log({ kind: "echo", actor: "kintsugi", payload: { path, hash } })` is called

### Requirement: Reconstruction reads full log

`reconstruct()` SHALL read all events from `ops.log` and return them with learned facts.

#### Scenario: Reconstruct returns events and learned
- **WHEN** `reconstruct(memory)` is called
- **THEN** it returns `{ events: MemoryEvent[], learned: Record<string, string> }`
- **AND** `events` contains all historical events
- **AND** `learned` contains all key-value pairs from `learned` store

### Requirement: Memory stores SHALL exist at correct paths

- `ops.log` SHALL exist at `~/.local/share/kintsugi/memory/ops.log`
- `learned` SHALL exist at `~/.local/share/kintsugi/memory/learned/`
- Minor memory SHALL exist at `~/.local/state/kintsugi/minor-memory.json`

#### Scenario: Shared memory path is respected
- **WHEN** `KINTSUGI_MEMORY_DIR` is set to `/custom/path/memory`
- **THEN** `ops.log` is at `/custom/path/memory/ops.log`
- **AND** `learned/` is at `/custom/path/memory/learned/`

## Traceability

| Scenario | Test File |
|----------|-----------|
| Ops log appends events | `tests/memory/ops-store.test.ts` |
| Ops log queries by filters | `tests/memory/ops-store.test.ts` |
| Learned facts persist | `tests/memory/learned-store.test.ts` |
| Minor memory not in shared log | `tests/memory/minor.test.ts` |
| Minor memory flush/persist | `tests/memory/minor.test.ts` |
| Echo event on boot | `tests/memory/reconstruct.test.ts` |
| Reconstruct returns events and learned | `tests/memory/reconstruct.test.ts` |
| Custom memory dir via env | `tests/memory/ops-store.test.ts` |

---

*Spec: Kintsugi — 2026-05-20*
