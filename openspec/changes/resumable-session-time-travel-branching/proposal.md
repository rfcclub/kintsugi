## Why

To allow users to recover from AI model mistakes or faulty tool runs without resetting the whole workspace or re-explaining the goal, by rewinding the chat session and restoring files to a clean previous state.

## What Changes

- Add session log truncation capability to `/rewind <turn_index>`.
- Build a Git-based workspace state snapshotting and rollback mechanism.
- Add session branching command `/session branch <branch_name>`.
- **BREAKING**: None.

## Capabilities

### New Capabilities
- `resumable-session-time-travel-branching`: Rewind event stores, restore matching workspace states, and manage session forks/branches.

### Modified Capabilities
None.

## Impact

- `src/store/` session storage engine to support truncation and branches.
- `src/runtime/session.ts` to manage Git commits/rollbacks per turn.
