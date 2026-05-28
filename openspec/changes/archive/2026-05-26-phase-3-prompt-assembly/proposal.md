# Proposal: Phase 3 — Prompt Assembly

## Motivation

Phase 2's `buildMessages()` does the minimum: stuff Echo as a system message and append prompts. But Kintsugi identity is more structured than that. The architecture defines 5 prompt layers that should be assembled deliberately, with explicit ordering, size tracking, and a clear boundary between "who Kintsugi is" (Echo) and "what external context says" (never auto-loaded). Without a proper prompt assembler, adding providers in Phase 4 will produce uncontrolled prompt sizes and confused identity.

## Non-Goals

- No provider selection or configuration (Phase 4).
- No tool definitions in prompt (Phase 5).
- No prompt caching or summarization (future, post-Phase 6).

## Proposed Approach

1. Create `runtime/prompt.ts` with `assemblePrompt()` that builds a `ProviderMessage[]` from explicit layers.
2. Define the 5 layers in order: base instructions, Kintsugi Echo, project context, session state, user input.
3. Each layer has a known byte/token budget and a tag for tracing.
4. Echo truncation when content exceeds budget (configurable threshold).
5. `runTurn()` in `loop.ts` calls `assemblePrompt()` instead of `buildMessages()`.
6. `kintsugi echo --summary` shows compiled Echo size and layer breakdown.

## Affected Capabilities

- Prompt composition is explicit and testable
- Echo content is bounded and traceable
- external context never appears unless explicitly injected
- `kintsugi echo --summary` gives prompt engineering visibility

---

*Proposal: Kintsugi — 2026-05-20*
