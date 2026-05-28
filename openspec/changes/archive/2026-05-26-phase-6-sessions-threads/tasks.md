# Tasks: Phase 6 — Sessions and Threads

## Session Writer

- [x] T1: Create `src/store/sessions.ts` — `SessionWriter`, session ID generation (`kng-<timestamp>-<random>`)
- [x] T2: Write `session.start` line on boot
- [x] T3: Append `message` lines on each turn completion
- [x] T4: Append `tool.call` and `tool.result` lines on tool execution
- [x] T5: Write `session.end` line on exit
- [x] T6: Flush after each write (fsync/fdatasync)

## Session Index

- [x] T7: Create `src/store/index.ts` — `SessionIndex`, append/read entries
- [x] T8: Append entry on `session.start`
- [x] T9: Append a new entry on `session.end` with `endedAt` and accumulated token usage
- [x] T10: Read index for `threads` command; deduplicate by session id with latest entry winning

## Session Replay

- [x] T11: Create `src/store/replay.ts` — `replaySession()`
- [x] T12: Reconstruct `runtime.prompts` from `message` lines
- [x] T13: Re-load Echo from `session.start.echo`
- [x] T14: Skip malformed JSON lines with warning counter
- [x] T15: Handle missing session file — "session not found" error

## CLI Updates

- [x] T16: Add `--resume <id>` flag to `src/cli/args.ts`
- [x] T17: Add `--export <id>` flag to `src/cli/args.ts`

## UI Updates

- [x] T18: Update `ThreadsView` — read real session index, list sessions
- [x] T19: Update `App.tsx` — handle `--resume` by calling `replaySession()`
- [x] T20: Add `--export` rendering to `ThreadsView` (markdown output)

## Integration

- [x] T21: Wire `SessionWriter` into `runTurn()` loop
- [x] T22: Wire `SessionIndex` into runtime boot and exit
- [x] T23: Ensure `~/.kintsugi/sessions/` directory is created on first use

## Tests

- [x] T24: Create `tests/session-store.test.ts` — writer appends lines, ID format, flush
- [x] T25: Create `tests/session-index.test.ts` — append, read, list entries
- [x] T26: Create `tests/session-replay.test.ts` — replay messages, skip malformed, missing file
- [x] T27: Create `tests/session-export.test.ts` — markdown output validation

## Verification

- [x] T28: `npm run build` succeeds
- [x] T29: `npm test` passes
- [x] T30: Smoke: `kintsugi tui` → send message → exit → `kintsugi threads` shows session
- [x] T31: Smoke: `kintsugi tui --resume <id>` restores conversation
- [x] T32: Smoke: `kintsugi threads --export <id>` outputs markdown
