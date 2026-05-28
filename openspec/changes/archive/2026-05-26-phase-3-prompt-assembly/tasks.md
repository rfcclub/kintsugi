# Tasks: Phase 3 — Prompt Assembly

## Core

- [x] T1: Create `src/runtime/prompt.ts` — `assemblePrompt()`, `PromptLayer`, `AssembledPrompt`, `PromptConfig`
- [x] T2: Implement base instructions layer (hardcoded, ~2 KB)
- [x] T3: Implement Echo layer with budget truncation at `---` boundary
- [x] T4: Implement project context layer (optional file/directory read)
- [x] T5: Implement session state layer (sliding window from `runtime.prompts`)
- [x] T5a: Preserve session state reverse-chronologically with runtime/system messages pinned before low-value chatter
- [x] T5b: Expose `totalBytes` on `AssembledPrompt`
- [x] T6: Implement user input layer

## CLI

- [x] T7: Add `--summary` flag to `src/cli/args.ts` (valid only for `echo` command)
- [x] T8: Update `EchoView` — render summary breakdown when `--summary` is set

## Migration

- [x] T9: Update `src/runtime/loop.ts` — `runTurn()` calls `assemblePrompt()`
- [x] T10: Remove `buildMessages()` from `loop.ts`
- [x] T11: Pass `PromptConfig` through runtime options chain

## Tests

- [x] T12: Create `tests/prompt.test.ts` — all layer scenarios, truncation, external context exclusion, budget

## Verification

- [x] T13: `npm run build` succeeds
- [x] T14: `npm test` passes
- [x] T15: `kintsugi echo --summary` shows layer breakdown
