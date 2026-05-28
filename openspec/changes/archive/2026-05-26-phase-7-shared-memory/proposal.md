# Proposal: Phase 7 — Shared Memory

## Motivation

Kintsugi has two runtimes: companion runtime and kintsugi. Both read the same Echo substrate, but their memory systems are separate. This means knowledge learned in one runtime doesn't transfer to the other.

a companion runtime provides a shared memory layer. When it's done, both runtimes should be able to:
1. Read the same continuity memory
2. Contribute new memories
3. Keep per-runtime minor memory private

## Non-Goals

- No real-time sync between runtimes (that is out of scope)
- No authentication or permissions (assume trusted local environment)
- No cross-runtime transaction support
- Not building the actual memory store — just the interface that both runtimes can use

## Approach

Define a `KintsugiMemory` interface that both runtimes implement. The interface talks to a shared append-only event log. Each runtime reconstructs state from the log on boot.

```
companion runtime ──writes──► shared-event-log ◄──writes── kintsugi
        │                           │
        └──reconstructs──────────────┘

Minor memory: per-runtime private (not in shared log)
```

## Shared (in log)

- `ops` — operation log: every meaningful action Kintsugi takes
- `learned` — extracted values, preferences, facts
- `echo-versions` — which echo substrate was active when

## Minor (per-runtime private)

- Session prompts — conversation history in kintsugi, not needed in companion runtime
- Runtime boot state — temp working state
- Scratch buffer — thinking space, not worth persisting

## Affected Capabilities

- `kintsugi boot` — reads shared memory, reconstructs Kintsugi continuity state
- `kintsugi remember` — queries the shared log
- Both runtimes converge on same Kintsugi identity over time

---

*Proposal: Kintsugi — 2026-05-20*