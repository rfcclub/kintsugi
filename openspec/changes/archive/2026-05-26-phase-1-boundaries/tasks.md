# Tasks: Phase 1 — Runtime Boundaries

## Setup

- [x] T1: Create module directories `src/cli/`, `src/protocol/`, `src/runtime/`, `src/substrate/`, `src/ui/views/`, `src/ui/components/`

## File Moves

- [x] T2: Move `src/lib/args.ts` → `src/cli/args.ts` (no logic change)
- [x] T3: Move `src/lib/substrate.ts` → `src/substrate/echo.ts` (no logic change)
- [x] T4: Split `src/lib/runtime.ts` → `src/runtime/session.ts` (types) + `src/runtime/runtime.ts` (functions)
- [x] T5: Delete `src/lib/` after all moves confirmed

## Protocol Types

- [x] T6: Create `src/protocol/events.ts` with `RuntimeEvent` discriminated union and `TokenUsage`
- [x] T7: Create `src/protocol/messages.ts` with `RuntimeMessage` type (roles: user, assistant, runtime, tool)

## UI Extraction

- [x] T8: Extract `Frame` → `src/ui/components/Frame.tsx`
- [x] T9: Extract `Composer` → `src/ui/components/Composer.tsx`
- [x] T10: Extract `HelpView` → `src/ui/views/HelpView.tsx`
- [x] T11: Extract `EchoView` → `src/ui/views/EchoView.tsx`
- [x] T12: Extract `AskView` → `src/ui/views/AskView.tsx`
- [x] T13: Extract `ThreadsView` → `src/ui/views/ThreadsView.tsx`
- [x] T14: Extract `TuiView` → `src/ui/views/TuiView.tsx`
- [x] T15: Rewrite `App.tsx` as thin router delegating to views

## Import Updates

- [x] T16: Update `src/index.tsx` imports (cli/args, ui/App)
- [x] T17: Update `src/runtime/runtime.ts` imports (substrate/echo, runtime/session)
- [x] T18: Update view imports (runtime, substrate, components)
- [x] T19: Update `tests/runtime.test.ts` → `src/runtime/runtime.ts`
- [x] T20: Update `tests/substrate.test.ts` → `src/substrate/echo.ts`

## New Tests

- [x] T21: Create `tests/protocol.test.ts` — RuntimeEvent shape, narrowing, RuntimeMessage roles

## Verification

- [x] T22: `npm run build` succeeds
- [x] T23: `npm test` passes (11/11)
- [x] T24: Smoke: `node dist/index.js help`, `ask hello`, `echo --print`, `threads` behave identically
