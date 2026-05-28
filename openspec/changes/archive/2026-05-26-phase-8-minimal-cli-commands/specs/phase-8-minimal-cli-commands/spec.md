# Spec: Phase 8 - Minimal CLI Commands

## ADDED Requirements

### Requirement: TUI SHALL parse slash commands before provider submission

The TUI composer SHALL pass inputs whose first non-whitespace character is `/` to a dedicated slash-command parser before calling the model provider.

#### Scenario: Normal prompt submission
- **WHEN** the user submits `hello`
- **THEN** the TUI sends `hello` to `runTurn()`

#### Scenario: Slash command interception
- **WHEN** the user submits `/help`
- **THEN** the TUI opens command help and does not send `/help` to `runTurn()`

#### Scenario: Literal slash prompt
- **WHEN** the user submits `//help`
- **THEN** the TUI sends `/help` as a normal prompt

### Requirement: Runtime cancellation SHALL abort active provider and tool work

`/stop` and the running-work Esc path SHALL abort the active turn through the runtime loop, provider adapters, permission waits, and tools where supported.

#### Scenario: Provider stream is stopped
- **WHEN** a provider stream is active and the user submits `/stop`
- **THEN** the active fetch/SSE stream is aborted
- **AND** the runtime emits `turn.cancelled`
- **AND** no successful assistant completion is recorded for the partial turn

#### Scenario: Tool-loop continuation is stopped
- **WHEN** a tool has completed and the runtime is about to continue with another provider call
- **AND** the active turn is cancelled
- **THEN** the next provider call does not start

### Requirement: Esc SHALL follow a deterministic priority stack

Esc SHALL deny/cancel focused permission prompts, close overlays, stop running turns, clear composer draft, or do nothing idle, in that order.

#### Scenario: Esc during running turn
- **WHEN** a model/tool turn is running and no overlay is focused
- **AND** the user presses Esc
- **THEN** the active turn is cancelled
- **AND** the TUI remains open

#### Scenario: Esc while idle
- **WHEN** no overlay, permission prompt, running turn, or composer draft is active
- **AND** the user presses Esc
- **THEN** the TUI does not exit silently

### Requirement: Permission slash commands SHALL mirror inline permission controls

`/approve`, `/deny`, and `/always` SHALL resolve the pending permission request exactly like `[y]`, `[n]`, and `[a]`.

#### Scenario: Approve pending tool call
- **WHEN** a permission prompt is waiting
- **AND** the user submits `/approve`
- **THEN** the pending tool call is approved once

#### Scenario: No pending permission
- **WHEN** no permission prompt is waiting
- **AND** the user submits `/approve`
- **THEN** the TUI shows inactive-state feedback
- **AND** the text is not sent to the provider

### Requirement: Model profile switching SHALL recreate provider configuration

`/model <profile>` SHALL resolve the configured profile and recreate the provider with provider, model, provider settings, and model config applied.

#### Scenario: Switch model profile
- **WHEN** the user submits `/model fast`
- **AND** `fast` is defined in config
- **THEN** the active provider and runtime model are updated from that profile

### Requirement: TUI overlays SHALL preserve conversation state

Commands that open informational or selection views SHALL render focused overlays without inserting fake transcript messages.

#### Scenario: Config overlay
- **WHEN** the user submits `/config`
- **THEN** the resolved config overlay opens
- **AND** the current transcript and composer draft are preserved

---

## Traceability

| Scenario | Test File |
|----------|-----------|
| Normal prompt submission | `tests/slash-command.test.ts`, `tests/loop.test.ts` |
| Slash command interception | `tests/slash-command.test.ts` |
| Literal slash prompt | `tests/slash-command.test.ts` |
| Provider stream is stopped | `tests/loop.test.ts`, `tests/provider-abort.test.ts`, `scripts/test-open-phases.mjs` |
| Tool-loop continuation is stopped | `tests/loop.test.ts`, `scripts/test-open-phases.mjs` |
| Esc during running turn | `tests/cancel-priority.test.ts`, `tests/loop.test.ts`, `scripts/test-open-phases.mjs` |
| Esc while idle | `tests/cancel-priority.test.ts`, `MINIMAL_CLI_COMMANDS.md`, `src/ui/views/TuiView.tsx` |
| Approve pending tool call | `tests/loop.test.ts`, `tests/permissions.test.ts` |
| No pending permission | `src/ui/views/TuiView.tsx` |
| Switch model profile | `tests/model-actions.test.ts`, `tests/command-info.test.ts` |
| Config overlay | `tests/command-info.test.ts`, `src/config/doctor.ts` |
