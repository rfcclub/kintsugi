# resumable-session-time-travel-branching Specification

## Purpose
Define requirements for rewinding chat event logs, rolling back associated filesystem edits using Git, and branching active execution timelines.

## Requirements

### Requirement: JSONL session log SHALL be truncatable

Kintsugi SHALL support cutting the JSONL log file back to a specific user-defined turn index, permanently discarding events recorded after that point.

#### Scenario: Truncate events in JSONL file
- **WHEN** user issues `/rewind 3`
- **THEN** Kintsugi writes a new version of the JSONL log file containing only lines up to turn 3
- **AND** updates the active session length state

### Requirement: Kintsugi Runtime SHALL hydrate state from truncated history

Kintsugi SHALL rebuild its internal message and memory pools correctly from the newly truncated JSONL.

#### Scenario: Re-hydrate memory on rewind
- **WHEN** session rewind is triggered
- **THEN** Kintsugi clears active runtime memory
- **AND** parses the truncated JSONL log to reconstruct the exact model instructions and tool outputs up to the target turn

### Requirement: Workspace state SHALL roll back using Git integration

Kintsugi SHALL revert filesystem edits made during rewound turns.

#### Scenario: Revert workspace file edits
- **WHEN** a turn runs and makes filesystem changes
- **AND** Git snapshotting is active
- **AND** user triggers rewind
- **THEN** Kintsugi uses Git commands to discard file changes made after the target turn
- **AND** warns the user if uncommitted manual changes risk being overwritten

### Requirement: Session branching SHALL fork the timeline

Kintsugi SHALL copy the active session state into a new file to start a branching flow.

#### Scenario: Fork session
- **WHEN** user issues `/session branch feat-new`
- **THEN** Kintsugi copies the active JSONL file to `feat-new.jsonl`
- **AND** targets all future events to the new file, leaving the original session untouched

## Traceability

| Scenario | Test File |
|----------|-----------|
| Truncate events in JSONL file | `tests/session-time-travel.test.ts` |
| Re-hydrate memory on rewind | `tests/session-time-travel.test.ts` |
| Revert workspace file edits | `tests/session-time-travel.test.ts` |
| Fork session | `tests/session-time-travel.test.ts` |

