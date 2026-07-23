## Why

To allow the main agent to offload complex or research-heavy tasks to background subagents, avoiding context pollution, token inflation, and core performance degradation.

## What Changes

- Introduce a `SubagentManager` runtime component.
- Implement the `invoke_subagent` action tool to allow parallel subagent creation.
- Establish message-passing and permission boundaries for subagent sandboxing.
- Add TUI monitoring in terminal layout.
- **BREAKING**: None.

## Capabilities

### New Capabilities
- `subagents-parallelism-isolation`: Manage concurrent, sandboxed, asynchronous subagent lifecycles with strict depth limits and communication pipes.

### Modified Capabilities
None.

## Impact

- `src/runtime/loop.ts` to coordinate async subagent execution.
- Create `src/runtime/subagents.ts` for lifecycle management.
- Update TUI layout in `src/ui/` to render subagent status bars.
