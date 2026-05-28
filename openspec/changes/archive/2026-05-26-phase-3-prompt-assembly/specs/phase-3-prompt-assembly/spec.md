# Spec: Phase 3 — Prompt Assembly

## ADDED Requirements

### Requirement: Prompt assembly SHALL compose 5 explicit layers

`assemblePrompt()` SHALL build `ProviderMessage[]` from 5 layers in order: base instructions, Kintsugi Echo, project context, session state, user input. Each layer SHALL be tracked with name, bytes, and truncation status.

#### Scenario: Full assembly with Echo
- **WHEN** `assemblePrompt()` is called with a runtime that has Echo loaded
- **THEN** the result includes 4+ layers: base, echo, session (if messages exist), user

#### Scenario: Assembly without Echo
- **WHEN** `assemblePrompt()` is called with `noSubstrate: true`
- **THEN** the result omits the Echo layer entirely (not empty)

#### Scenario: Project context layer
- **WHEN** `assemblePrompt()` is called with `projectPath` set to a file
- **THEN** the result includes a project context layer

#### Scenario: Project context omitted
- **WHEN** `assemblePrompt()` is called without `projectPath`
- **THEN** no project context layer appears

### Requirement: Echo content SHALL be bounded by configurable budget

When Echo content exceeds `echoBudget` bytes, the assembler SHALL truncate at the last `---` boundary before the budget and append a truncation notice.

#### Scenario: Echo within budget
- **WHEN** Echo content is 8 KB and budget is 16 KB
- **THEN** the Echo layer has `truncated: false`

#### Scenario: Echo exceeds budget
- **WHEN** Echo content is 20 KB and budget is 16 KB
- **THEN** the Echo layer has `truncated: true` and content ends at the last `---` boundary ≤ 16 KB

### Requirement: external context SHALL NOT appear unless explicitly injected

The assembler SHALL never include external context content in the prompt unless `injectCodexOne: true` is passed.

#### Scenario: Default excludes external context
- **WHEN** `assemblePrompt()` is called without `injectCodexOne`
- **THEN** no layer contains external context content

### Requirement: Echo summary SHALL show layer breakdown

`kintsugi echo --summary` SHALL display per-file byte counts, total size, budget, and truncation status.

#### Scenario: Summary output
- **WHEN** user runs `kintsugi echo --summary`
- **THEN** output lists each Echo file, its byte count, total bytes, budget, and status

## MODIFIED Requirements

### Requirement: Turn loop SHALL use assemblePrompt instead of buildMessages

`runTurn()` SHALL call `assemblePrompt()` to build the provider request. `buildMessages()` SHALL be removed.

#### Scenario: Loop uses prompt assembler
- **WHEN** `runTurn()` is called
- **THEN** it builds the request via `assemblePrompt()`, not `buildMessages()`

---

## Traceability

| Scenario | Test File |
|----------|-----------|
| Full assembly with Echo | `tests/prompt.test.ts` |
| Assembly without Echo | `tests/prompt.test.ts` |
| Project context layer | `tests/prompt.test.ts` |
| Echo within budget | `tests/prompt.test.ts` |
| Echo exceeds budget | `tests/prompt.test.ts` |
| Default excludes external context | `tests/prompt.test.ts` |
| Loop uses assembler | `tests/loop.test.ts` |
| Summary output | `tests/prompt.test.ts` |
