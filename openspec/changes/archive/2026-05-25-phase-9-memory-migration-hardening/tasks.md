# Tasks: Phase 9 - Memory Migration Hardening

## Contract And Fixtures

- [x] T1: Add companion runtime-style shared memory fixture under `tests/fixtures/memory/`.
- [x] T2: Add event schema validation helpers for `MemoryEvent`.
- [x] T3: Add tests for accepted actors, kinds, timestamps, and payload shapes.
- [x] T4: Add malformed-line warning tests without crashing reconstruction.

## Deterministic Reconstruction

- [x] T5: Sort reconstructed events by `at` ascending with file-order tie fallback.
- [x] T6: Fold valid `learn` events into reconstructed learned facts.
- [x] T7: Define and test conflict resolution for duplicate learned keys.
- [x] T8: Return reconstruction warnings for malformed events and unsupported learn payloads.

## Prompt Memory Layer

- [x] T9: Add `memoryBudget` to prompt config with a conservative default.
- [x] T10: Add bounded `memory` prompt layer after Echo/workspace context.
- [x] T11: Include learned facts sorted by key.
- [x] T12: Include recent notes with a count/byte limit.
- [x] T13: Add prompt trace tests for memory layer bytes and truncation.
- [x] T14: Add integration test proving companion runtime-authored learned facts reach provider messages.

## CLI Inspection

- [x] T15: Update `boot` output to include memory path, event count, learned count, and warning count.
- [x] T16: Add `remember --kind`, `--actor`, `--limit`, and `--learned` args.
- [x] T17: Add focused CLI arg parser tests for remember filters.
- [x] T18: Add RememberView tests or command-level tests for filtered output.

## Cross-Runtime Contract

- [x] T19: Document shared event payload conventions for companion runtime and kintsugi.
- [x] T20: Add a temp-dir migration smoke that seeds companion runtime-style memory and boots kintsugi.
- [x] T21: Add a note in Phase 7 docs that Phase 9 owns behavioral migration hardening.

## Verification

- [x] T22: `npm run build` succeeds.
- [x] T23: `npm test` passes.
- [x] T24: `openspec validate phase-9-memory-migration-hardening --strict` passes.
- [x] T25: Smoke: `boot` reports reconstruction counts from a temp memory dir.
- [x] T26: Smoke: `remember --kind learn --actor external` returns filtered fixture events.
- [x] T27: Smoke: assembled prompt includes migrated learned facts from temp companion runtime fixture.

---

*Tasks: Kintsugi - 2026-05-23*
