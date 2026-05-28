# Spec: Phase 1 — Runtime Boundaries

Architecture source of truth: `docs/architecture.md`.

## ADDED Requirements

### Requirement: Source files follow architecture module map

Source code SHALL be organized into the module boundaries defined in `docs/architecture.md`: `cli`, `protocol`, `runtime`, `substrate`, `ui/views`, `ui/components`.

#### Scenario: CLI args in own module
- **WHEN** a developer looks at `src/cli/args.ts`
- **THEN** it contains the same `parseArgs` and `ParsedArgs` as the former `src/lib/args.ts`

#### Scenario: Substrate in own module
- **WHEN** a developer looks at `src/substrate/echo.ts`
- **THEN** it contains the same `loadSubstrate`, `resolveSubstratePath`, and `LoadedSubstrate` as the former `src/lib/substrate.ts`

#### Scenario: Runtime in own module
- **WHEN** a developer looks at `src/runtime/runtime.ts`
- **THEN** it contains `bootRuntime`, `renderBoot`, and `handlePrompt`
- **AND** `src/runtime/session.ts` contains `RuntimeMessage` and session type exports

#### Scenario: Views extracted from App
- **WHEN** a developer looks at `src/ui/views/`
- **THEN** `HelpView.tsx`, `EchoView.tsx`, `AskView.tsx`, `ThreadsView.tsx`, and `TuiView.tsx` exist
- **AND** `App.tsx` delegates to the matching view without inline render logic

#### Scenario: Components extracted
- **WHEN** a developer looks at `src/ui/components/`
- **THEN** `Frame.tsx` and `Composer.tsx` exist as reusable Ink components

### Requirement: RuntimeEvent discriminated union exists

A typed `RuntimeEvent` discriminated union in `src/protocol/events.ts` SHALL cover all turn lifecycle events, enabling type-safe event streaming between runtime and UI.

#### Scenario: Event type coverage
- **WHEN** a developer imports `RuntimeEvent` from `src/protocol/events.ts`
- **THEN** it covers: `turn.started`, `assistant.delta`, `assistant.completed`, `tool.requested`, `tool.completed`, `turn.failed`, `turn.completed`

#### Scenario: Event type narrowing
- **WHEN** code narrows `event.type === "assistant.delta"`
- **THEN** TypeScript infers `text: string` on the narrowed variant

### Requirement: RuntimeMessage type exists

A typed `RuntimeMessage` in `src/protocol/messages.ts` SHALL support the full set of message roles needed by runtime and future provider layers.

#### Scenario: Message roles
- **WHEN** a developer imports `RuntimeMessage` from `src/protocol/messages.ts`
- **THEN** it supports roles: `user`, `assistant`, `runtime`, `tool`

## MODIFIED Requirements

### Requirement: Existing commands pass after refactor

All existing CLI commands SHALL produce identical output after the structural refactor. No behavior changes.

#### Scenario: Build succeeds
- **WHEN** `npm run build` runs
- **THEN** TypeScript compiles without errors

#### Scenario: Tests pass
- **WHEN** `npm test` runs
- **THEN** all existing tests pass with updated imports

#### Scenario: CLI commands unchanged
- **WHEN** `node dist/index.js help` runs
- **THEN** output is identical to pre-refactor

---

## Traceability

| Scenario | Test File |
|----------|-----------|
| CLI args module | `tests/runtime.test.ts` (imports from `src/cli/args.ts`) |
| Substrate module | `tests/substrate.test.ts` (imports from `src/substrate/echo.ts`) |
| Runtime module | `tests/runtime.test.ts` (imports from `src/runtime/runtime.ts`) |
| Event type coverage | `tests/protocol.test.ts` |
| Event type narrowing | `tests/protocol.test.ts` |
| Build succeeds | `npm run build` |
| CLI unchanged | manual smoke |
