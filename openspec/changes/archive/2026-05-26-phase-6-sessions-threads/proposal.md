# Proposal: Phase 6 — Sessions and Threads

## Motivation

Every previous phase operates in-memory. When the TUI exits, all conversation is gone. For Kintsugi to be a useful runtime, sessions must persist and resume. The `kintsugi threads` command should list real sessions, and `kintsugi tui --resume <id>` should restore context. Without persistence, every interaction starts from zero and no learning accumulates across sessions.

## Non-Goals

- No cloud sync or remote storage.
- No conversation summarization or compaction (future).
- No search across sessions (future).
- No multi-session branching.

## Proposed Approach

1. JSONL event store: each session is a `.jsonl` file, one event/message per line.
2. Session directory: `~/.kintsugi/sessions/YYYY/MM/DD/<session-id>.jsonl`.
3. Session index: `~/.kintsugi/sessions/index.jsonl` — one line per session with metadata.
4. `kintsugi threads` reads the index and lists sessions.
5. `kintsugi tui --resume <id>` replays events into runtime and continues.
6. Corrupt session files fail gracefully: skip malformed lines, log warning.
7. Transcript export: `kintsugi threads --export <id>` prints full conversation as markdown.

## Affected Capabilities

- `kintsugi threads` — lists real persisted sessions
- `kintsugi tui --resume <id>` — resumes a previous session
- Session transcript survives process exit
- Corrupt sessions degrade gracefully

---

*Proposal: Kintsugi — 2026-05-20*
