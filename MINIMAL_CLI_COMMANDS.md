# Minimal CLI Commands

Kintsugi should support a small Coding CLI-style command surface inside the TUI composer, rendered in Kintsugi Ink language: Echo/session/model status, warm workshop colors, visible tool state, and the small candle in the frame.

This is a TUI contract, not an argv contract. The existing `src/cli/args.ts` parser remains for process startup commands; slash commands should use a separate parser.

## Command Set

### Session

- `/new` — start a fresh session after closing/indexing the current session writer.
- `/resume <id>` — load an existing session into the TUI.
- `/threads` — open the recent sessions overlay.
- `/exit` — close the TUI.
- `/help` — open slash-command help.

### Model

- `/model` — open the model/profile picker.
- `/model <profile>` — switch to a configured model profile.

Switching a model profile must apply the full profile: provider, model, provider settings, and profile `modelConfig`. It must recreate the provider instead of only changing display state.

### Permission

- `/approve` — approve the pending tool call once.
- `/deny` — deny the pending tool call.
- `/always` — approve this tool for the current session.

Permission commands are valid only while a tool permission prompt is pending. If no tool request is waiting, show a small amber status message instead of sending the text to the model.

`/always` is session-scoped. UI copy should display "always this session" so it does not look like a permanent trust rule.

### Runtime Control

- `/stop` — cancel the current model/tool turn immediately.
- `Esc` — context-sensitive cancel/stop key; see the priority stack below.

`/stop` and `Esc` must cancel real work. They are not allowed to only clear UI state.

### Config And Memory

- `/config` — open active resolved config.
- `/doctor` — run config doctor.
- `/memory` — open the memory/remember overlay.
- `/remember` — alias for `/memory`.

## Slash Parser Contract

Implement a pure parser under `src/ui/commands/slash.ts`.

- Parse slash commands before sending composer input to the provider.
- Only inputs whose first non-whitespace character is `/` are slash-command candidates.
- `//text` sends the literal prompt `/text`.
- Unknown slash commands should produce a visible TUI status message and must not be sent to the provider accidentally.
- Commands may have arguments after ASCII whitespace.
- Missing required arguments produce a visible TUI status message.
- Command names are lowercase; the parser may normalize case, but help should document lowercase commands.

## Esc Priority Stack

Esc behavior must be deterministic:

1. If a permission prompt is focused and no broader running-turn stop is requested, deny/cancel that permission prompt.
2. If an overlay is open, close the overlay and restore the composer draft.
3. If a model/tool turn is running, abort the active turn.
4. If the composer has a draft, clear the draft.
5. If idle with no draft/overlay, do not exit silently; use `/exit` or Ctrl-C for exit.

Ctrl-C may remain the emergency TUI exit path, but it should close session writers cleanly when possible.

## Cancellation Contract

Cancellation must be implemented before `/stop` is considered done.

Required plumbing:

- `runTurn()` accepts an `AbortSignal`.
- `ProviderTurnRequest` carries that signal.
- Provider adapters pass the signal into `fetch` and stop SSE iteration when aborted.
- Tool execution gets cooperative cancellation through tool context.
- Permission prompts can be resolved as cancel/deny without granting.
- The runtime emits a terminal event:

```ts
{ type: "turn.cancelled"; reason: "stop" | "esc" | "ctrl-c" | "permission" | "abort" }
```

Cancellation must be idempotent: repeated `/stop` or Esc presses emit at most one terminal cancellation event for the active turn.

Session behavior must be explicit:

- User prompt may be recorded when the turn starts.
- Partial assistant text should not be recorded as a successful assistant completion.
- Session logs/export/replay must represent cancelled turns deterministically.
- Tool-loop cancellation between `tool.completed` and the next provider call must prevent continuation.
- Long-running `bash` should terminate its child process on cancellation.

## Overlay Contract

Overlays are focused TUI views, not transcript messages.

Initial overlays:

- `model`
- `config`
- `doctor`
- `memory`
- `threads`
- `help`
- `permission`

Opening an overlay should preserve transcript and composer draft. Closing it should return to the same TUI state unless the overlay performed an explicit action, such as switching model profile.

## Discoverability

- `/help` should show commands with availability state.
- When composer input starts with `/`, show lightweight suggestions.
- Disabled commands should appear dimmed with a reason:
  - `/approve`, `/deny`, `/always`: no pending tool request.
  - `/stop`: no running turn.
- `/stop` should render with danger styling while work is running.

## Test Plan

Parser:

- Empty input and normal prompts are not slash commands.
- Unknown slash command returns an error result.
- `//hello` becomes literal prompt `/hello`.
- `/resume` without id errors.
- `/model` with and without profile parses correctly.
- Permission commands parse without leaking into provider prompts.

Runtime cancellation:

- `/stop` aborts an in-flight provider stream and emits one `turn.cancelled`.
- Esc during streaming cancels the turn and does not exit the app.
- Provider adapters pass abort signals into fetch and stop SSE iteration.
- Cancellation during permission prompt does not execute the tool.
- `/approve`, `/deny`, `/always` after cancellation cannot resolve a stale prompt.
- Cancellation between `tool.completed` and continuation prevents another provider request.
- Cancellation during `bash` kills the child process.

TUI routing:

- Slash commands are intercepted before `runTurn`.
- Normal prompts still call `runTurn`.
- Inactive permission commands show an amber status.
- `/config`, `/doctor`, `/memory`, `/threads`, `/help`, and `/model` open overlays.
- Esc follows the priority stack.

Session/config:

- `/new` closes/indexes the current session and creates a fresh runtime.
- `/resume <id>` uses the chosen continuation semantics consistently.
- `/model <profile>` applies provider, model, provider settings, and model config.
- Session export/replay handles cancelled turns.
