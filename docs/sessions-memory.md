# Sessions and Memory

Kintsugi persists conversation state and memory events through JSONL-based stores. Sessions capture turn-by-turn transcripts; memory captures operational events and learned facts across sessions.

## Sessions

### Storage Location

Sessions are stored at `~/.kintsugi/sessions/` by default. Override with `KINTSUGI_MEMORY_DIR`.

Each session is a single JSONL file: `~/.kintsugi/sessions/YYYY/MM/DD/<session-id>.jsonl`

### Session Lines

Each line in a session file is a JSON object with a `type` field:

| Type | Description |
|------|-------------|
| `session.start` | Session metadata: id, start time, provider, model, echo hash |
| `message` | User or assistant message with role and content |
| `event` | Runtime event (delta, tool request, completion, cancellation) |
| `thinking` | Thinking/reasoning text from the provider |
| `tool.call` | Tool invocation: name, args, permission decision |
| `tool.result` | Tool output: result text, error flag |
| `session.end` | End metadata: reason, message count, token usage |

### Session Index

The session index provides fast lookup of recent sessions without reading every JSONL file. It tracks:

- Session ID and start/end timestamps
- Provider and model used
- Message count and total tokens
- First user message (for preview)

### CLI Commands

```bash
# List recent sessions
node dist/index.js threads

# Resume a session in TUI
node dist/index.js tui --resume <session-id>

# One-shot query (creates its own session)
node dist/index.js ask "hello"
```

### TUI Commands

- `/new` — close current session, start fresh
- `/resume <id>` — load a prior session
- `/threads` — browse sessions in an overlay

### Session Lifecycle

1. **Start**: runtime boots, creates session writer, writes `session.start`
2. **Turns**: each user message, assistant response, tool call/result is appended
3. **Thinking**: provider reasoning text is captured separately
4. **End**: on `/new`, `/exit`, or process end — writes `session.end` with summary

### Export

Sessions can be exported to Markdown for sharing or archival. The export includes:

- Session metadata (provider, model, timestamps)
- Full transcript with role labels
- Tool calls and results
- Token usage summary

## Memory

### Ops Log

The ops log is an append-only JSONL event store at `~/.kintsugi/memory/ops.jsonl`. It captures operational events across all sessions:

```typescript
interface MemoryEvent {
  id: string;          // unique event ID
  at: string;          // ISO timestamp
  kind: MemoryEventKind;  // event type
  actor: string;       // who triggered it
  payload: unknown;    // event-specific data
}
```

Event kinds:
- `echo` — substrate loaded or reloaded
- `tool` — tool invocation
- `session` — session start/end
- `learned` — fact learned or forgotten
- `config` — config change

### Learned Facts

A simple key-value store for persistent facts. Written via the `remember` command or tool calls.

```bash
# View learned facts
node dist/index.js remember --learned

# In TUI
/memory
```

Learned facts survive across sessions. They are stored separately from the ops log and can be queried independently.

### Minor Memory

Runtime-private ephemeral state that does not persist to disk. Used for within-session tracking like permission overrides set by `/always`.

### Memory Reconstruction

The `reconstruct()` function rebuilds the current memory state by replaying the ops log. This ensures memory is always derivable from the event stream:

```typescript
const state = memory.reconstruct();
// state.sessions — session summaries
// state.learned — current learned facts
// state.echoLoadCount — how many times echo was loaded
```

### Querying Memory

```bash
# All memory events
node dist/index.js remember

# Filter by kind
node dist/index.js remember --kind echo
node dist/index.js remember --kind tool

# Filter by actor
node dist/index.js remember --actor kintsugi

# Limit results
node dist/index.js remember --limit 20

# Learned facts only
node dist/index.js remember --learned
```

## File Layout

```
~/.kintsugi/
  sessions/
    2026/
      05/
        28/
          <session-id>.jsonl
          <session-id>.jsonl
  memory/
    ops.jsonl
    learned.json
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `KINTSUGI_MEMORY_DIR` | Root directory for sessions and memory | `~/.kintsugi` |
