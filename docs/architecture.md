# kintsugi Architecture Plan

## Decision

kintsugi is Kintsugi Ink-based CLI/TUI runtime. It is not a Codex SDK wrapper and not a clone of Codex or Claude Code. It should stand on proven agent-runtime architecture while keeping runtime-specific substrate, timing, and interaction rules.

## Credits And License Posture

kintsugi may study and adapt architecture patterns from:

- OpenAI Codex CLI at `../codex`, licensed Apache-2.0.
- Claw Code at `../claw-code`, licensed MIT.

When code is copied or closely adapted from Codex, keep Apache-2.0 attribution in the relevant file header or a dedicated notice. Prefer reimplementing small patterns in kintsugi's own TypeScript shape unless direct reuse is clearly worth it.

No Anthropic/Claude Code ownership claim should be made. Claw Code is treated as a Rust rewrite/reference implementation, not as a source of proprietary Claude Code internals.

## North Star

Kintsugi needs a runtime that can:

1. Boot Echo from `~/.config/kintsugi/substrate`.
2. Render a polished terminal experience with Ink.
3. Assemble system/developer/user prompt layers deliberately.
4. Stream provider events into a protocol boundary.
5. Execute tools under a permission model.
6. Persist and resume sessions without confusing Kintsugi Echo with external context.

Ink is the UI layer. It is not the agent engine.

## UI Taste

The terminal interface should be color-rich and readable. kintsugi should not stay a plain yellow frame plus prompt once the runtime boundary is proven. The TUI should become vivid while remaining readable: distinct role colors, lively status accents, streaming cursor/state, Echo/session indicators, and a polished transcript/composer layout. Prefer tasteful color and motion over a dry monochrome developer console.

## Architecture Lessons

### From Codex

Useful separations:

- `cli`: argument parsing and top-level dispatch.
- `tui`: interactive terminal shell.
- `core`: agent loop, config, tools, sessions.
- `protocol`: typed events between runtime and UI.
- `thread-store`: persistence and resume.
- `tools`, `hooks`, `mcp`, `config`: independent runtime services.

Key lesson: keep UI, runtime, protocol, tools, and persistence separate.

### From Claw Code

Useful separations:

- `rusty-claude-cli`: CLI/REPL/render shell.
- `runtime`: session, permissions, config, system prompt assembly, tool loop.
- `api`: provider clients, streaming, request/response types.
- `tools`: built-in tool specs and execution.
- `commands`: slash command registry.

Key lesson: provider calls should flow through a runtime boundary, not through UI components.

## Target Module Map

```text
src/
  index.tsx              # thin entrypoint
  cli/
    args.ts              # argv parsing and command normalization
  ui/
    App.tsx              # root Ink view
    views/
      AskView.tsx
      TuiView.tsx
      ThreadsView.tsx
      EchoView.tsx
    components/
      Frame.tsx
      Transcript.tsx
      Composer.tsx
      StatusLine.tsx
  protocol/
    events.ts            # runtime -> UI events
    messages.ts          # user/provider/tool message types
  runtime/
    runtime.ts           # KintsugiRuntime lifecycle
    prompt.ts            # prompt assembly
    session.ts           # session state
    permissions.ts       # permission policy
    loop.ts              # turn loop
  substrate/
    echo.ts              # Echo loader
    layers.ts            # Echo ordering and summaries
  providers/
    provider.ts          # provider interface
    mock.ts              # deterministic tests
    openai-compatible.ts # later
  tools/
    registry.ts
    read.ts
    grep.ts
    bash.ts
  commands/
    slash.ts             # /help, /echo, /status, future commands
  store/
    sessions.ts          # persistence and resume
```

Current code can evolve into this map without a rewrite:

- `src/lib/substrate.ts` becomes `src/substrate/echo.ts`.
- `src/lib/runtime.ts` becomes `src/runtime/runtime.ts`.
- `src/lib/args.ts` becomes `src/cli/args.ts`.
- `src/ui/App.tsx` splits into `ui/views/*` and `ui/components/*`.

## Runtime Flow

```text
argv
  -> cli/args
  -> runtime boot
      -> load Echo
      -> load config
      -> create session
      -> choose provider
  -> UI command
      -> ask: run one turn
      -> tui: interactive loop
      -> threads: read store
      -> echo: inspect substrate
```

One turn:

```text
User input
  -> slash command dispatch
  -> prompt assembly
  -> provider.stream()
  -> runtime events
  -> tool requests
  -> permission checks
  -> tool execution
  -> provider continuation
  -> final assistant message
  -> session store
```

## Prompt Layers

Kintsugi prompt assembly should be explicit:

1. Base runtime instructions: kintsugi behavior, safety, tool rules.
2. Kintsugi Echo: compiled from `~/.config/kintsugi/substrate`.
3. Project context: optional, user-chosen, never auto-confused with external context.
4. Session state: transient tuning and recent transcript.
5. User input.

Important boundary: contributors can develop kintsugi inside Codex TUI, but Kintsugi runtime should not auto-load external context unless a user explicitly asks for external context.

## Provider Interface

Start with a small interface:

```ts
export interface Provider {
  id: string;
  streamTurn(request: ProviderTurnRequest): AsyncIterable<RuntimeEvent>;
}
```

Provider adapters should not know about Ink. They receive prompt/messages/tools and emit typed runtime events.

Initial providers:

1. `mock`: deterministic, no network, for tests.
2. `openai-compatible`: OpenAI/OpenRouter-style chat or responses API.
3. Later local provider: Ollama/vLLM/lmstudio if needed.

## Protocol Events

Minimum event set:

```ts
type RuntimeEvent =
  | { type: "turn.started"; id: string }
  | { type: "assistant.delta"; text: string }
  | { type: "assistant.completed"; text: string }
  | { type: "tool.requested"; id: string; name: string; args: unknown }
  | { type: "tool.completed"; id: string; output: string }
  | { type: "turn.failed"; message: string }
  | { type: "turn.completed"; usage?: TokenUsage };
```

UI renders events. Runtime owns semantics.

## Tool Model

Do not add broad tool execution first. Start with read-only tools:

1. `read_file`
2. `list_files`
3. `grep`

Then add mutating tools:

4. `write_file`
5. `edit_file`
6. `bash`

Every mutating tool needs:

- explicit permission policy
- working directory boundary
- event log entry
- deterministic test

## Session Store

Phase 1 can keep memory in process.

Phase 2 should persist JSONL:

```text
~/.kintsugi/sessions/YYYY/MM/DD/<session-id>.jsonl
```

Each line should be an event or message. This mirrors the proven rollout/session-store style without copying implementation.

## Phases

### Phase 0: Ink Shell

Status: mostly done.

Acceptance:

- `kintsugi tui` opens Ink interactive UI.
- `kintsugi ask "hello"` renders a one-shot view.
- `kintsugi echo` shows loaded Echo.
- No Codex SDK dependency.

### Phase 1: Runtime Boundaries

Goal: split current prototype into architecture modules.

Tasks:

- Move arg parsing to `src/cli/args.ts`.
- Move Echo loader to `src/substrate/echo.ts`.
- Move runtime types to `src/runtime/*`.
- Add `src/protocol/events.ts`.
- Split `src/ui/App.tsx` into views/components.

Acceptance:

- No behavior regression in current commands.
- Tests cover parser, Echo loading, runtime boot, and one-shot prompt.
- UI imports runtime through protocol/runtime interfaces, not raw substrate functions.

### Phase 2: Mock Provider And Streaming

Goal: prove the engine boundary without network.

Tasks:

- Add `Provider` interface.
- Add deterministic mock provider.
- Make `ask` and `tui` consume streamed runtime events.
- Render assistant deltas in Ink transcript.

Acceptance:

- `kintsugi ask "hello"` streams mock response through protocol events.
- `kintsugi tui` appends user and assistant messages.
- Tests verify event order.

### Phase 3: Prompt Assembly

Goal: make Kintsugi identity layer explicit.

Tasks:

- Add `runtime/prompt.ts`.
- Assemble base instructions + Echo + session + user input.
- Add `kintsugi echo --summary` later if raw Echo gets too large.

Acceptance:

- Prompt assembly test proves Echo appears in the intended layer.
- external context does not appear unless explicitly injected.

### Phase 4: OpenAI-Compatible Provider

Goal: real model backend without becoming Codex SDK wrapper.

Tasks:

- Add env/config for provider base URL, model, API key.
- Add streaming parser.
- Map provider chunks to `RuntimeEvent`.
- Keep provider isolated from UI.

Acceptance:

- One live smoke can answer a prompt.
- Mock provider remains the default test path.
- No API keys in logs or command lines.

### Phase 5: Tools And Permissions

Goal: useful coding runtime.

Tasks:

- Add read-only tools first.
- Add permission policy.
- Add mutating tools only after read-only path is tested.

Acceptance:

- Tool calls are visible in transcript.
- Tool permission decisions are explicit.
- File writes stay inside approved workspace roots.

### Phase 6: Sessions And Threads

Goal: make `kintsugi threads` real.

Tasks:

- JSONL event store.
- Session index.
- Resume command.
- Transcript export.

Acceptance:

- `kintsugi threads` lists sessions.
- `kintsugi tui --resume <id>` restores context.
- Corrupt session files fail gracefully.

## Non-Goals For Now

- No direct Codex SDK dependency.
- No hidden auto-loading of external context into Kintsugi runtime.
- No full Codex clone.
- No broad shell execution before permission model exists.
- No provider-specific logic inside Ink components.

## Next Implementation Slice

Do Phase 1 first. The current Ink prototype works, but its files are still too flat. The next code change should be structural, not feature expansion:

1. Create module folders.
2. Move current code into the target boundaries.
3. Add protocol event types.
4. Keep current commands passing.

This gives Kintsugi a real skeleton before adding a brain.
