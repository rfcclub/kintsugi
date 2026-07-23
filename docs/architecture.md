# Kintsugi Architecture

## Overview

Kintsugi is an Ink-based CLI/TUI runtime for prompt assembly, provider streaming, tool execution, permissions, memory events, and resumable sessions. It is not a Codex SDK wrapper and not a clone of any other CLI. It stands on proven agent-runtime architecture with its own interaction model.

## Module Map

```
src/
  index.tsx              # thin entrypoint: parse args, render Ink view
  cli/
    args.ts              # argv parsing and command normalization
  config/
    config.ts            # YAML/env/CLI config resolution, presets, profiles
    doctor.ts            # config validation and health checks
  memory/
    events.ts            # memory event types and kinds
    index.ts             # memory barrel
    learned-store.ts     # key-value learned facts
    memory.ts            # KintsugiMemory interface
    minor.ts             # ephemeral session-scoped memory
    ops-store.ts         # append-only JSONL ops log
    reconstruct.ts       # rebuild state from ops log
  protocol/
    events.ts            # RuntimeEvent union type
    messages.ts          # RuntimeMessage type
  providers/
    anthropic-messages.ts # Anthropic Messages adapter
    config.ts            # provider types, model config, key resolution
    errors.ts            # provider error types
    live-matrix.ts       # live smoke test matrix
    mock.ts              # deterministic test provider
    openai-chat.ts       # OpenAI Chat Completions adapter
    openai-responses.ts  # OpenAI Responses adapter
    provider.ts          # Provider/ProviderTurnRequest/ToolSpec interfaces
    registry.ts          # provider factory and preset resolution
    sse.ts               # Server-Sent Events parser
  runtime/
    loop.ts              # turn loop with tool continuation (max depth 20)
    permissions.ts       # PermissionPolicy with allow/deny/ask
    prompt.ts            # prompt assembly: base + substrate + session + user
    runtime.ts           # bootRuntime: wires memory, tools, permissions
    session.ts           # KintsugiRuntime interface and state
  store/
    export.ts            # session transcript export to Markdown
    index.ts             # session index for fast lookup
    replay.ts            # session replay from JSONL
    sessions.ts          # JSONL session writer and line types
  substrate/
    echo.ts              # Markdown substrate loader
  tools/
    bash.ts              # shell command execution
    builtins.ts          # default tool registry
    edit.ts              # find-and-replace file edits
    glob.ts              # file pattern matching
    grep.ts              # regex search
    list-files.ts        # directory listing
    path.ts              # path utilities and workspace root checks
    read.ts              # file reading
    registry.ts          # tool registry
    tool.ts              # Tool/ToolSpec/ToolContext interfaces
    utils.ts             # shared tool utilities
    write.ts             # file writing
  ui/
    App.tsx              # root Ink view, command routing
    commands/
      cancel-priority.ts # Esc priority stack
      command-info.ts    # command availability states
      model-actions.ts   # model/profile switch logic
      session-actions.ts # session new/resume actions
      slash.ts           # slash command parser
    components/
      Composer.tsx       # input composer
      Frame.tsx          # TUI frame with status
      Picker.tsx         # model/profile picker
    views/
      AskView.tsx        # one-shot ask view
      CommandOverlay.tsx # overlay container
      ConfigView.tsx     # config show/init/doctor view
      EchoView.tsx       # substrate inspection view
      HelpView.tsx       # help overlay
      RememberView.tsx   # memory browser view
      ThreadsView.tsx    # session list overlay
      TuiView.tsx        # interactive TUI view
```

## Runtime Flow

```
argv
  -> cli/args
  -> config resolution (YAML -> env -> CLI flags)
  -> runtime boot
      -> load substrate (Echo)
      -> init memory (ops log, learned store)
      -> create tool registry
      -> create permission policy
      -> choose provider
  -> UI command
      -> ask: run one turn
      -> tui: interactive loop with slash commands
      -> threads: read session index
      -> echo: inspect substrate
      -> config: show/init/doctor
      -> remember: query memory
```

## Turn Loop

```
User input
  -> slash command dispatch (intercept before provider)
  -> prompt assembly
      1. Base runtime instructions
      2. Substrate (Echo) content
      3. Session state and recent transcript
      4. User input
  -> provider.streamTurn()
  -> RuntimeEvent stream
      -> assistant.delta: render in transcript
      -> tool.requested: check permission
          -> allow: execute immediately
          -> ask: prompt user (/approve, /deny, /always)
          -> deny: refuse
      -> tool.completed: append result
      -> tool continuation: loop back to provider with tool results
      -> turn.completed: write to session, update memory
```

Max tool continuation depth: 20. Repeated tool call IDs are detected and break the loop.

## Provider Boundary

Provider adapters never touch Ink. They receive `ProviderTurnRequest` (messages, tools, model config, signal) and yield `RuntimeEvent` values. The UI renders events. Runtime owns semantics.

Wire formats:
- **openai-chat**: `function` tools, `tool_calls` on assistant, `tool_call_id` on results
- **openai-responses**: `function_call` items, `function_call_output` items
- **anthropic-messages**: `tool_use` content blocks, `tool_result` with `tool_use_id`

## Prompt Layers

1. **Base instructions**: kintsugi behavior, safety, tool rules
2. **Substrate (Echo)**: compiled from `~/.config/kintsugi/substrate` Markdown files
3. **Project context**: optional, user-chosen via `--substrate`
4. **Session state**: recent transcript, learned facts
5. **User input**: current message

Important boundary: external context never auto-loads unless explicitly configured.

## Permission System

`PermissionPolicy` evaluates tool requests against configured rules:

```
tool request -> check explicit rule -> check wildcard rule -> defaultDecision
```

Session-scoped `/always` overrides add to `sessionPermissions` on the runtime, cleared when the session ends.

## Session Persistence

Sessions are JSONL files. Each line is a typed event or message. The session writer appends synchronously with `fdatasync` for crash safety. The session index provides fast listing without reading every file.

Replay reconstructs a session by reading the JSONL file line by line, rebuilding the message history and tool call sequence.

## Memory Architecture

Memory is a two-layer system:

1. **Ops log** (`ops.jsonl`): append-only event stream. Every significant action (echo load, tool call, session start/end, learned fact) gets an event.
2. **Learned store** (`learned.json`): key-value facts derived from the ops log. Reconstructable by replaying.

`reconstruct()` replays the ops log to rebuild the current state: session summaries, learned facts, echo load count, etc.

## Cancellation

Cancellation flows through the entire stack:
- `AbortSignal` in `ProviderTurnRequest` and `ToolContext`
- Provider adapters pass signal to `fetch` and stop SSE iteration
- Tool execution checks signal cooperatively
- `turn.cancelled` event with reason code emitted
- Cancellation is idempotent: repeated `/stop` or `Esc` produces at most one event

Esc priority stack:
1. Permission prompt focused -> deny/cancel prompt
2. Overlay open -> close overlay
3. Turn running -> abort turn
4. Composer has draft -> clear draft
5. Idle -> no action (use `/exit` or Ctrl-C)

## Design Principles

- UI, runtime, protocol, tools, and persistence are separate layers
- Provider calls flow through a runtime boundary, not through UI components
- No Codex SDK dependency
- No hidden auto-loading of external context
- Mutable operations require explicit permission
- Session state is always derivable from the JSONL event stream
- Tests use the mock provider — no network in unit tests
