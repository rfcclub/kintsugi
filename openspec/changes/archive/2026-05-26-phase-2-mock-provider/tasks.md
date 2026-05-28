# Tasks: Phase 2 — Mock Provider and Streaming

## Provider Interface

- [x] T1: Create `src/providers/provider.ts` — `Provider`, `ProviderTurnRequest`, `ProviderMessage`, `ToolSpec` types
- [x] T2: Create `src/providers/mock.ts` — `MockProvider` with configurable response, delay, failAfter, toolCall

## Turn Loop

- [x] T3: Create `src/runtime/loop.ts` — `runTurn()`, `buildMessages()`
- [x] T4: Ensure `buildMessages()` includes Echo as system message when substrate is loaded
- [x] T4a: Add explicit `RuntimeMessage` → `ProviderMessage` role mapping (`runtime` maps to `system`)
- [x] T4b: Accumulate `assistant.delta` text as fallback when `assistant.completed` is missing

## UI Streaming

- [x] T5: Update `TuiView` — use `runTurn()` + `MockProvider`, render `assistant.delta` as streaming text
- [x] T6: Update `AskView` — stream output via `runTurn()` instead of `handlePrompt()`
- [x] T7: Update `App.tsx` — pass `MockProvider` instance to views that need it

## Deprecation

- [x] T8: Mark `handlePrompt` as `@deprecated` in `src/runtime/runtime.ts`

## Tests

- [x] T9: Create `tests/provider-mock.test.ts` — event sequence, failure injection, tool call config
- [x] T10: Create `tests/loop.test.ts` — turn loop event order, message recording, Echo in messages, failure stops

## Verification

- [x] T11: `npm run build` succeeds
- [x] T12: `npm test` passes
- [x] T13: `kintsugi ask "hello"` streams mock response
- [x] T14: `kintsugi tui` shows streaming assistant text
