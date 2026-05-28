# Proposal: Phase 4 — Provider Adapters

## Motivation

Phases 2–3 proved the engine boundary with a mock provider and explicit prompt assembly. Now kintsugi needs real model backends without locking Kintsugi runtime to one vendor or one API shape. The provider boundary should support OpenAI Chat Completions, OpenAI Responses, and Anthropic Messages-style APIs as separate adapters behind the same internal `Provider` interface.

## Non-Goals

- No custom fine-tuned model routing.
- No local provider (Ollama/vLLM) — can be added later as another adapter.
- No prompt caching optimization.
- No multi-provider fan-out.
- No direct dependency on an Anthropic server. `anthropic-messages` means Anthropic Messages API shape, which may target Anthropic or compatible gateways.

## Proposed Approach

1. Implement provider adapters:
   - `openai-chat`: `POST /v1/chat/completions`
   - `openai-responses`: `POST /v1/responses`
   - `anthropic-messages`: `POST /v1/messages` style payload and stream events
2. Parse provider-specific SSE chunks into shared `RuntimeEvent` values.
3. Translate internal `ProviderMessage[]` into each provider's request shape.
4. Configure provider, base URL, model, and API key through `KINTSUGI_` env vars and CLI flags.
5. Token usage and truncation/length stops must surface through the shared runtime events.
6. Error mapping: rate limit → `turn.failed`, timeout → `turn.failed`, auth → `turn.failed`.
7. Mock provider remains the default for tests; real providers are opt-in.

## Affected Capabilities

- `kintsugi ask "hello" --provider openai-chat --model gpt-4o` — Chat Completions response
- `kintsugi ask "hello" --provider openai-responses --model gpt-4.1-mini` — Responses API response
- `kintsugi ask "hello" --provider anthropic-messages --model claude-sonnet-4-5` — Anthropic Messages-style response
- `kintsugi tui` — interactive session with real streaming
- Provider selection: mock (default), OpenAI Chat, OpenAI Responses, Anthropic Messages-style

---

*Proposal: Kintsugi — 2026-05-20*
