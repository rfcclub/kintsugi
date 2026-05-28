# Tasks: Phase 8 - Minimal CLI Commands

## Parser

- [x] T1: Create `src/ui/commands/slash.ts` with `parseSlashCommand()`.
- [x] T2: Support literal slash prompts via `//text`.
- [x] T3: Return structured errors for unknown commands and missing args.
- [x] T4: Add parser tests for all commands and error cases.

## Cancellation Runtime

- [x] T5: Add `turn.cancelled` to `RuntimeEvent`.
- [x] T6: Add `AbortSignal` support to `runTurn()`.
- [x] T7: Add `signal` to `ProviderTurnRequest`.
- [x] T8: Wire signal into OpenAI Chat fetch/SSE.
- [x] T9: Wire signal into OpenAI Responses fetch/SSE.
- [x] T10: Wire signal into Anthropic Messages fetch/SSE.
- [x] T11: Stop provider/tool-loop continuation when signal is aborted.
- [x] T12: Add session writer/export/replay handling for cancelled turns.

## Tool And Permission Cancellation

- [x] T13: Add cancellation signal to tool context.
- [x] T14: Make permission wait cancel/deny safely when turn is aborted.
- [x] T15: Prevent stale permission resolvers after cancellation.
- [x] T16: Make `bash` terminate child processes on cancellation.
- [x] T17: Add focused tests for permission cancellation and bash cancellation.

## TUI Command Routing

- [x] T18: Intercept slash commands before normal prompt submission.
- [x] T19: Implement `/stop` against active turn abort controller.
- [x] T20: Implement Esc priority stack.
- [x] T21: Implement `/approve`, `/deny`, and `/always` against pending permission.
- [x] T22: Show inactive-state feedback for permission commands and `/stop`.
- [x] T23: Add TUI routing tests for slash interception and normal prompt pass-through.

## Overlays

- [x] T24: Add overlay manager state to `TuiView`.
- [x] T25: Implement `/help` overlay with command availability states.
- [x] T26: Implement `/model` overlay using model profiles first, provider/manual model second.
- [x] T27: Implement `/config` overlay using resolved config formatter.
- [x] T28: Implement `/doctor` overlay.
- [x] T29: Implement `/memory` and `/remember` overlay.
- [x] T30: Implement `/threads` overlay.

## Session And Model Commands

- [x] T31: Implement `/new` session reset with writer close/indexing.
- [x] T32: Decide and document `/resume <id>` continuation semantics.
- [x] T33: Implement `/resume <id>`.
- [x] T34: Implement `/model <profile>` so provider, model, provider settings, and model config all apply.

## Verification

- [x] T35: `npm run build` succeeds.
- [x] T36: `npm test` passes.
- [x] T37: Smoke: `/stop` cancels a streaming turn.
- [x] T38: Smoke: Esc cancels running work without exiting.
- [x] T39: Smoke: permission commands work and stale resolvers do not fire.
- [x] T40: Smoke: `/model <profile>` switches the actual provider config.

---

*Tasks: Kintsugi - 2026-05-22*
