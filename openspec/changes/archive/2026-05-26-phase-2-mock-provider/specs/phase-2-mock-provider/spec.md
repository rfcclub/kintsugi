# Spec: Phase 2 — Mock Provider and Streaming

## ADDED Requirements

### Requirement: Provider interface SHALL define a streaming turn boundary

The `Provider` interface SHALL accept `ProviderTurnRequest` (messages, optional model, optional tools) and return `AsyncIterable<RuntimeEvent>`. Providers SHALL NOT import Ink, substrate, or session store.

#### Scenario: Provider streams events
- **WHEN** code calls `provider.streamTurn(request)`
- **THEN** it returns an async iterable of `RuntimeEvent`

#### Scenario: Provider is isolated from UI
- **WHEN** a developer inspects `src/providers/provider.ts`
- **THEN** it imports only from `src/protocol/events.ts` and its own module

### Requirement: MockProvider SHALL emit deterministic event sequences

`MockProvider` SHALL emit `turn.started`, zero or more `assistant.delta`, `assistant.completed`, and `turn.completed` in order. It SHALL support configurable response text, streaming delay, failure injection, and optional tool call.

#### Scenario: Normal mock turn
- **WHEN** `MockProvider.streamTurn()` is called with default config
- **THEN** it yields `turn.started`, one or more `assistant.delta`, `assistant.completed`, `turn.completed`

#### Scenario: Mock failure injection
- **WHEN** `MockProvider` is configured with `failAfter: 1`
- **THEN** the second turn yields `turn.started` then `turn.failed`

#### Scenario: Mock tool call
- **WHEN** `MockProvider` is configured with `toolCall: { name: "read_file", args: { path: "/tmp/x" } }`
- **THEN** it yields `tool.requested` then `tool.completed` before `assistant.completed`

### Requirement: Turn loop SHALL drive provider and record messages

`runTurn()` SHALL accept runtime + provider + user text, build messages, stream provider events, and record user/assistant messages in the runtime.

#### Scenario: Turn loop records conversation
- **WHEN** `runTurn()` completes a turn
- **THEN** `runtime.prompts` contains the user message and assistant response

#### Scenario: Turn loop yields events for UI
- **WHEN** `runTurn()` is iterated
- **THEN** each `RuntimeEvent` from the provider is yielded to the consumer

#### Scenario: Turn loop stops on failure
- **WHEN** provider emits `turn.failed`
- **THEN** `runTurn()` records the error and returns without recording an assistant message

### Requirement: TUI SHALL stream assistant deltas in real time

`TuiView` SHALL call `runTurn()` and render `assistant.delta` events as streaming text, finalizing on `assistant.completed`.

#### Scenario: Streaming text appears during response
- **WHEN** user sends a message in TUI
- **THEN** assistant text appears incrementally as deltas arrive

### Requirement: Ask command SHALL stream to stdout

`kintsugi ask "prompt"` SHALL stream `assistant.delta` text to stdout instead of printing a complete string.

#### Scenario: Ask streams output
- **WHEN** user runs `kintsugi ask "hello"`
- **THEN** text streams incrementally to stdout

## MODIFIED Requirements

### Requirement: handlePrompt SHALL be deprecated

`handlePrompt` SHALL remain exported but marked `@deprecated`. New code SHALL use `runTurn()`.

#### Scenario: Deprecation marker
- **WHEN** a developer inspects `src/runtime/runtime.ts`
- **THEN** `handlePrompt` has a JSDoc `@deprecated` tag

---

## Traceability

| Scenario | Test File |
|----------|-----------|
| Provider streams events | `tests/provider-mock.test.ts` |
| Normal mock turn | `tests/provider-mock.test.ts` |
| Mock failure injection | `tests/provider-mock.test.ts` |
| Mock tool call | `tests/provider-mock.test.ts` |
| Turn loop records conversation | `tests/loop.test.ts` |
| Turn loop stops on failure | `tests/loop.test.ts` |
| Build messages includes Echo | `tests/loop.test.ts` |
