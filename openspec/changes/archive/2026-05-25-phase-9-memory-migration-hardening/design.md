# Design: Phase 9 - Memory Migration Hardening

## Contract Fixture

Create test fixtures that represent the shared memory format companion runtime and kintsugi both commit to:

```json
{"id":"oc-1","kind":"learn","actor":"external","payload":{"key":"user.prefers","value":"direct answers"},"at":"2026-05-23T10:00:00.000Z"}
{"id":"oc-2","kind":"note","actor":"external","payload":{"text":"Kintsugi should keep replies compact."},"at":"2026-05-23T10:01:00.000Z"}
{"id":"oc-3","kind":"echo","actor":"external","payload":{"path":"~/.config/kintsugi/substrate","hash":"abc"},"at":"2026-05-23T10:02:00.000Z"}
```

The fixture should live under tests, not under live `~/.local/share/kintsugi`.

## Reconstruction Semantics

`reconstruct(memory)` should return:

- `events`: all valid events sorted by `at` ascending, then file order for ties.
- `learned`: facts from `learned/` plus valid `learn` events with `{ key, value }` payloads.
- `warnings`: count or list of malformed event lines and unsupported learn payloads.

Conflict rule:

- If the same key appears multiple times, the latest `at` wins.
- If `learned/` and a `learn` event define the same key, the newest timestamp wins when known; otherwise explicit learned store wins.

## Prompt Memory Layer

`assemblePrompt()` should add a memory layer after Echo/workspace identity context and before session state.

Constraints:

- Default budget: 4096 bytes.
- Include learned facts first, sorted by key.
- Include recent notes second, newest first.
- Exclude raw `op` events by default.
- Never include malformed event JSON.
- Track the layer in prompt tracing as `memory`.

Example:

```text
# Kintsugi Shared Memory

## Learned Facts
- user.prefers: direct answers

## Notes
- Kintsugi should keep replies compact.
```

## CLI Inspection

`kintsugi boot` should show:

- Echo path/bytes.
- Shared memory path.
- Event count.
- Learned fact count.
- Warning count.

`kintsugi remember` should support:

- `--kind <learn|note|echo|op>`
- `--actor <external|kintsugi|kintsugi>`
- `--learned`
- `--limit <n>`

The default `remember` output should stay compact and safe to run in a terminal.

## Test Strategy

Unit tests:

- Event schema validation.
- Query sorting and filtering.
- Learn-event folding into reconstructed facts.
- Prompt memory layer budget/truncation.

Integration tests:

- Seed temp `ops.log` with companion runtime fixture.
- Boot runtime against temp memory.
- Assert reconstructed state and assembled prompt contain expected learned facts.
- Assert malformed lines produce warnings without crashing.

CLI smokes:

- `KINTSUGI_MEMORY_DIR=/tmp/... node dist/index.js boot`
- `KINTSUGI_MEMORY_DIR=/tmp/... node dist/index.js remember --kind learn --actor external`
- `KINTSUGI_MEMORY_DIR=/tmp/... node dist/index.js remember --learned`

---

*Design: Kintsugi - 2026-05-23*
