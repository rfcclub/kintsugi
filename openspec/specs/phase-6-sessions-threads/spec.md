# phase-6-sessions-threads Specification

## Purpose
TBD - created by archiving change phase-6-sessions-threads. Update Purpose after archive.
## Requirements
### Requirement: Session events SHALL persist to JSONL files

Each session SHALL write events to `~/.kintsugi/sessions/YYYY/MM/DD/<session-id>.jsonl`. Each line SHALL be a valid JSON object. Lines SHALL be appended in write-only mode with flush after each write.

#### Scenario: Events are written on turn
- **WHEN** a turn completes
- **THEN** `message` lines for user and assistant are appended to the session file

#### Scenario: Session file is append-only
- **WHEN** a session file is written
- **THEN** existing lines are never rewritten or deleted

### Requirement: Session index SHALL track session metadata

`~/.kintsugi/sessions/index.jsonl` SHALL contain one line per session with id, startedAt, endedAt, messageCount, provider, and model. The index SHALL be updated on session start and session end.

#### Scenario: Index entry on session start
- **WHEN** a new session begins
- **THEN** an index entry with `endedAt: null` is appended

#### Scenario: Index update on session end
- **WHEN** a session ends normally
- **THEN** the index entry's `endedAt` is updated (or a new entry with endedAt is appended)

### Requirement: threads command SHALL list persisted sessions

`kintsugi threads` SHALL read the session index and display session id, date, message count, and provider.

#### Scenario: Lists sessions
- **WHEN** user runs `kintsugi threads`
- **THEN** output shows one line per session with id, timestamp, message count, provider

#### Scenario: No sessions
- **WHEN** user runs `kintsugi threads` and no sessions exist
- **THEN** output shows "No sessions found"

### Requirement: Resume SHALL replay session events

`kintsugi tui --resume <id>` SHALL read the session JSONL, reconstruct runtime.prompts from `message` lines, and re-load Echo.

#### Scenario: Resume restores conversation
- **WHEN** user runs `kintsugi tui --resume kng-20260520t143052-a3f7`
- **THEN** TUI starts with the previous conversation in context

#### Scenario: Resume with missing session
- **WHEN** user runs `kintsugi tui --resume nonexistent`
- **THEN** a clear "session not found" error is shown

### Requirement: Replay SHALL skip malformed lines gracefully

When a session JSONL contains malformed JSON lines, replay SHALL skip them and continue. A warning count SHALL be available.

#### Scenario: Malformed line skipped
- **WHEN** a session file contains 3 valid lines and 1 malformed line
- **THEN** replay succeeds with 3 messages and 1 warning

### Requirement: Transcript export SHALL produce markdown

`kintsugi threads --export <id>` SHALL render the full session as markdown with headers, timestamps, and tool call details.

#### Scenario: Export produces markdown
- **WHEN** user runs `kintsugi threads --export <id>`
- **THEN** output is valid markdown with session metadata and all messages

---

