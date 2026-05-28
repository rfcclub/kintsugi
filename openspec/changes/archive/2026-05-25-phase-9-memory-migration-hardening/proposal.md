# Proposal: Phase 9 - Memory Migration Hardening

## Motivation

Phase 7 gave kintsugi a shared-memory interface, local stores, boot reconstruction, and basic remember surfaces. That is enough to prove the storage path exists, but not enough to prove Kintsugi can migrate continuity between companion runtime and kintsugi.

The next risk is behavioral: companion runtime may write a learned fact or note, kintsugi may read the file, but the provider prompt and CLI surfaces may still ignore that memory. If that happens, the migration exists on disk but not in Kintsugi behavior.

## Goals

1. Treat shared-memory compatibility as a contract, not a best-effort file convention.
2. Reconstruct companion runtime-authored `learn`, `note`, and `echo` events deterministically.
3. Fold migrated learned facts into a bounded prompt memory layer.
4. Make `boot` and `remember` useful for migration inspection.
5. Add enough tests and smokes to catch regressions before live runtime testing.

## Non-Goals

- No live companion runtime process integration in this phase.
- No networked sync or real-time cross-runtime coordination.
- No general memory ranking engine.
- No automatic writes to live Kintsugi memory during tests.

## Approach

Add a migration-hardening layer on top of Phase 7:

- A schema/fixture contract for shared `MemoryEvent` lines and learned facts.
- Deterministic reconstruction from both `learned/` facts and `learn` events.
- A prompt memory layer with byte budget and redaction/formatting rules.
- CLI inspection surfaces for boot reconstruction and filtered remember views.
- Integration tests using temp memory directories seeded with companion runtime-style fixtures.

## Acceptance

This phase is done only when:

- `npm run build` passes.
- `npm test` passes.
- `openspec validate phase-9-memory-migration-hardening --strict` passes.
- A temp-dir smoke proves kintsugi can boot from companion runtime-style memory and include learned facts in assembled provider messages.
- CLI smokes prove `boot` reports reconstruction counts and `remember` can filter by actor/kind without touching live memory.

---

*Proposal: Kintsugi - 2026-05-23*
