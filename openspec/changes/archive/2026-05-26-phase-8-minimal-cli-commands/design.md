# Design: Phase 8 - Minimal CLI Commands

## Command Contract

Slash commands are TUI input, not process argv. Startup parsing remains in `src/cli/args.ts`; in-session parsing lives in `src/ui/commands/slash.ts`.

```ts
export type SlashCommand =
  | { type: "prompt"; text: string }
  | { type: "command"; name: SlashCommandName; args: string[] }
  | { type: "error"; message: string };
```

Parser rules:

- First non-whitespace `/` starts command parsing.
- `//text` becomes literal prompt `/text`.
- Unknown commands return an error result and are not sent to the provider.
- Missing required arguments return an error result.
- Command names are normalized to lowercase.

## Cancellation

Cancellation is a runtime feature, not only a UI feature.

```ts
export type RuntimeEvent =
  | ...
  | {
      type: "turn.cancelled";
      reason: "stop" | "esc" | "ctrl-c" | "permission" | "abort";
    };
```

Required data flow:

```
TuiView AbortController
  -> runTurn(..., { signal })
  -> ProviderTurnRequest.signal
  -> provider fetch/SSE
  -> tool context signal
  -> permission wait cancellation
```

Cancellation rules:

- Repeated `/stop` or Esc emits at most one `turn.cancelled` per active turn.
- Provider fetches must receive the active signal.
- SSE iteration must stop when the signal is aborted.
- Permission prompts must be resolved as deny/cancel without granting.
- Tool-loop cancellation between `tool.completed` and the next provider request prevents continuation.
- `bash` must terminate its child process on cancellation.

## Esc Priority

Esc follows a deterministic stack:

1. Permission prompt focus: deny/cancel that prompt unless the active turn is being stopped.
2. Active overlay: close overlay and restore composer draft.
3. Running turn: abort active turn.
4. Composer draft: clear draft.
5. Idle: do not silently exit; `/exit` or Ctrl-C exits.

## Overlays

Overlays are focused TUI views. They are not transcript messages.

Initial overlays:

- `model`
- `config`
- `doctor`
- `memory`
- `threads`
- `help`
- `permission`

Opening an overlay preserves transcript and composer draft. Closing an overlay restores the previous TUI state unless the overlay performs an explicit action.

## Model Switching

`/model <profile>` resolves a configured model profile and applies:

- provider
- model
- provider settings
- profile `modelConfig`

The provider instance must be recreated. Updating `runtime.provider` or `runtime.model` alone is insufficient.

## Session Semantics

`/new`:

- Cancels active work first if needed.
- Closes/indexes the current writer.
- Boots a fresh runtime.

`/resume <id>`:

- Cancels active work first if needed.
- Replays the requested session.
- Uses the chosen continuation semantics consistently: either continue into a new session or explicitly reuse the prior session id. This must be decided before implementation.

Cancelled turns:

- May record the user prompt at turn start.
- Must not record partial assistant text as a successful completion.
- Must export/replay deterministically.

## Visual Language

The command surface should feel like Kintsugi/Kintsugi, not a generic copied CLI:

- gold/yellow frame and candle continuity accent
- coral/rose Kintsugi voice
- cyan tool/config state
- amber pending permission
- red danger/stop
- dim gray disabled commands

---

*Design: Kintsugi - 2026-05-22*
