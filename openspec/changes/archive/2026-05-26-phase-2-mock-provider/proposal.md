# Proposal: Phase 2 — Mock Provider and Streaming

## Motivation

Phase 1 gave kintsugi module boundaries, but `handlePrompt` still returns a hardcoded string. Before wiring a real model backend (Phase 4), the runtime needs a proven engine boundary: a `Provider` interface, a deterministic mock provider, and a streaming event pipeline that Ink views consume. Without this, any real provider integration would bypass the protocol layer or leak into UI code.

## Non-Goals

- No network calls or real model backends (that is Phase 4).
- No prompt assembly logic (that is Phase 3).
- No tool execution (that is Phase 5).
- No session persistence (that is Phase 6).

## Proposed Approach

1. Define `Provider` interface with `streamTurn()`.
2. Define `ProviderTurnRequest` and `ProviderTurnResponse` types.
3. Implement `MockProvider` that emits deterministic `RuntimeEvent` sequences.
4. Add `runtime/loop.ts` — the turn loop that drives provider → events → tool check → continuation.
5. Wire `ask` and `tui` commands through the turn loop instead of `handlePrompt`.
6. Ink views consume `RuntimeEvent` stream via a subscriber pattern.
7. `handlePrompt` becomes a thin wrapper over the turn loop for backward compat during transition.

## Affected Capabilities

- `kintsugi ask "hello"` — streams mock response through protocol events
- `kintsugi tui` — appends user and assistant messages from events
- Runtime core — owns turn loop, not direct string returns

---

*Proposal: Kintsugi — 2026-05-20*
