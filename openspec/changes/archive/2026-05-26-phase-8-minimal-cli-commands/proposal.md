# Proposal: Phase 8 - Minimal CLI Commands

## Motivation

Kintsugi TUI can stream model turns, execute tools, prompt for permissions, and persist sessions, but it does not yet have the minimal in-session command surface expected from a coding CLI. Users need to switch models, start or resume sessions, approve tools, inspect config/memory, and stop runaway work without leaving the TUI.

The critical requirement is `/stop` and `Esc`: they must cancel real provider/tool work, not only clear the UI. This phase makes slash commands a runtime control surface instead of a thin composer trick.

## Goals

1. Add a dedicated TUI slash-command parser.
2. Support a minimal command set: `/model`, `/new`, `/resume`, `/threads`, `/approve`, `/deny`, `/always`, `/stop`, `/config`, `/doctor`, `/memory`, `/remember`, `/help`, and `/exit`.
3. Implement cooperative cancellation through TUI, runtime loop, providers, permission prompts, and tools.
4. Define deterministic `Esc` behavior.
5. Present commands through Kintsugi visual language: focused overlays, visible status, and clear availability states.

## Non-Goals

- No full command palette.
- No shell-like scripting language.
- No permanent trust database for `/always`; it remains session-scoped.
- No multi-session branching.
- No remote cancellation semantics beyond local provider/tool abort.

## Proposed Approach

1. Introduce `parseSlashCommand()` under `src/ui/commands/slash.ts`.
2. Add `turn.cancelled` as a terminal runtime event.
3. Thread `AbortSignal` through `runTurn()`, `ProviderTurnRequest`, provider adapters, permission waiting, and tool execution.
4. Make `TuiView` own the active turn abort controller.
5. Implement permission slash commands against the same resolver used by `[y] [n] [a]`.
6. Add focused overlays for model, config, doctor, memory, threads, and help.
7. Add slash suggestions and disabled-state feedback.

## Affected Capabilities

- TUI composer command routing.
- Provider streaming and cancellation.
- Tool-loop continuation.
- Permission prompts.
- Session start/resume/export semantics for cancelled turns.
- Model profile switching.
- Config and memory inspection.

## Reference

See `MINIMAL_CLI_COMMANDS.md` for the command contract and test plan.

---

*Proposal: Kintsugi - 2026-05-22*
