# subagents-parallelism-isolation Specification

## Purpose
Define requirements for spawning, executing, and communicating with background subagents in isolated sandboxes with strict permission structures.

## Requirements

### Requirement: Subagents SHALL run with isolated history pools

Each subagent MUST operate in its own execution context with independent prompts and history pools, protecting the main context from pollution.

#### Scenario: Subagent execution does not leak to main history
- **WHEN** a subagent is spawned with a specific prompt and executes multiple tool loops
- **THEN** the main agent's message pool remains clean of the subagent's intermediate steps
- **AND** only the final report is received by the main agent

### Requirement: Subagents SHALL respect permission constraints

Subagents MUST only execute tools allowed by their specified permission scope.

#### Scenario: Read-only subagent cannot write files
- **WHEN** a subagent with `read-only` scope attempts to run `write_file` or `bash`
- **THEN** the tool runner denies execution automatically
- **AND** returns a permission error to the subagent

### Requirement: Parent-child agents SHALL communicate via message-passing

Kintsugi SHALL support asynchronous messages between the host process and the subagent.

#### Scenario: Message routing
- **WHEN** parent invokes `send_message` with subagent ID
- **THEN** the message is pushed to the subagent's incoming event queue
- **AND** triggers the subagent's execution handler on the next tick

### Requirement: Depth and concurrency limits SHALL prevent token runaway

Kintsugi MUST reject subagent execution if constraints are violated.

#### Scenario: Block recursive agent spawning
- **WHEN** the subagent spawning tree depth exceeds 2
- **OR** the number of concurrent subagents exceeds the system configuration limit
- **THEN** Kintsugi aborts the `invoke_subagent` request and returns a constraint error

## Traceability

| Scenario | Test File |
|----------|-----------|
| Subagent execution does not leak to main history | `tests/subagents.test.ts` |
| Read-only subagent cannot write files | `tests/subagents.test.ts` |
| Message routing | `tests/subagents.test.ts` |
| Block recursive agent spawning | `tests/subagents.test.ts` |

