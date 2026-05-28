# phase-9-memory-migration-hardening Specification

## Purpose
Define the hardened shared-memory migration contract so companion runtime-authored memory can be reconstructed deterministically, included in Kintsugi provider prompts, and inspected through CLI surfaces.

## Requirements
### Requirement: Shared memory contract SHALL accept companion runtime-authored events

kintsugi SHALL parse companion runtime-authored `MemoryEvent` JSONL entries that match the shared event contract.

#### Scenario: companion runtime learn event is accepted
- **WHEN** `ops.log` contains a valid event with `kind: "learn"` and `actor: "external"`
- **AND** the payload has string `key` and string `value`
- **THEN** reconstruction includes the event
- **AND** the learned facts include the key and value

#### Scenario: Malformed events do not crash reconstruction
- **WHEN** `ops.log` contains malformed JSON or unsupported event shape
- **THEN** reconstruction skips the malformed line
- **AND** records a warning
- **AND** valid events before and after the malformed line are still returned

### Requirement: Reconstruction SHALL be deterministic

Reconstructed shared memory SHALL have deterministic ordering and conflict resolution.

#### Scenario: Events are ordered by timestamp
- **WHEN** `ops.log` contains events written out of timestamp order
- **THEN** reconstruction returns events ordered by `at` ascending

#### Scenario: Latest learned fact wins
- **WHEN** multiple valid learned facts define the same key
- **THEN** the fact with the latest timestamp wins

### Requirement: Migrated memory SHALL be available to provider prompts

kintsugi SHALL include reconstructed shared memory in provider messages as a bounded prompt layer.

#### Scenario: Learned facts are included in prompt
- **WHEN** kintsugi boots with reconstructed learned facts
- **AND** `assemblePrompt()` is called for a user turn
- **THEN** provider messages include a `memory` system layer
- **AND** the layer contains the learned facts within the configured memory budget

#### Scenario: Memory prompt layer is bounded
- **WHEN** reconstructed memory exceeds the configured memory budget
- **THEN** the memory layer is truncated deterministically
- **AND** prompt trace marks the memory layer as truncated

### Requirement: CLI SHALL inspect migration state

kintsugi CLI SHALL provide enough inspection to verify memory migration without reading live files manually.

#### Scenario: Boot reports reconstruction counts
- **WHEN** `kintsugi boot` runs with a shared memory directory
- **THEN** output includes event count, learned fact count, warning count, and memory path

#### Scenario: Remember filters companion runtime learn events
- **WHEN** `kintsugi remember --kind learn --actor external` runs
- **THEN** output includes only matching events

#### Scenario: Remember displays learned facts
- **WHEN** `kintsugi remember --learned` runs
- **THEN** output includes reconstructed learned facts
