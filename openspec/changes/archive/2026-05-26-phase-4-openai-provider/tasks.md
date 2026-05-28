# Tasks: Phase 4 — Provider Adapters

## Shared Provider Plumbing

- [x] T1: Create `src/providers/config.ts` — `ProviderType`, shared real-provider config, env resolution
- [x] T2: Create `src/providers/sse.ts` — shared SSE line reader/helpers, skip malformed lines
- [x] T3: Create `src/providers/errors.ts` — HTTP/network error mapping and API-key redaction
- [x] T4: Create `src/providers/registry.ts` — `createProvider()` factory

## OpenAI Chat Adapter

- [x] T5: Create `src/providers/openai-chat.ts` — `OpenAIChatProvider`
- [x] T6: Implement `POST /chat/completions` with streaming fetch
- [x] T7: Handle `delta.content` → `assistant.delta`
- [x] T8: Handle `finish_reason: "stop"` → `assistant.completed` + `turn.completed`
- [x] T9: Handle `finish_reason: "length"` distinctly with visible truncation metadata/event
- [x] T10: Handle `finish_reason: "tool_calls"` → `tool.requested`
- [x] T11: Extract `usage` from final chunk when present

## OpenAI Responses Adapter

- [x] T12: Create `src/providers/openai-responses.ts` — `OpenAIResponsesProvider`
- [x] T13: Implement `POST /responses` with streaming fetch
- [x] T14: Translate `ProviderMessage[]` into Responses `input`
- [x] T15: Handle `response.output_text.delta` → `assistant.delta`
- [x] T16: Handle `response.completed` → `assistant.completed` + `turn.completed`
- [x] T17: Map Responses usage and incomplete/max-token statuses

## Anthropic Messages-Style Adapter

- [x] T18: Create `src/providers/anthropic-messages.ts` — `AnthropicMessagesProvider`
- [x] T19: Implement `POST /messages` with streaming fetch
- [x] T20: Translate `ProviderMessage[]` into Anthropic `system` + `messages`
- [x] T21: Handle `content_block_delta` text → `assistant.delta`
- [x] T22: Handle `message_stop` → `assistant.completed` + `turn.completed`
- [x] T23: Map Anthropic usage and `max_tokens` stop reason

## CLI Flags

- [x] T24: Add `--provider` flag to `src/cli/args.ts` (values: `mock`, `openai-chat`, `openai-responses`, `anthropic-messages`)
- [x] T25: Add `--model` flag to `src/cli/args.ts`
- [x] T26: Update `App.tsx` — pass provider selection to views

## Tests

- [x] T27: Create `tests/provider-sse.test.ts` — shared malformed-line handling
- [x] T28: Create `tests/openai-chat-provider.test.ts` — mocked fetch, streaming, usage, key safety
- [x] T29: Create `tests/openai-responses-provider.test.ts` — mocked fetch, input translation, streaming, usage
- [x] T30: Create `tests/anthropic-messages-provider.test.ts` — mocked fetch, message translation, streaming, usage
- [x] T31: Update `tests/loop.test.ts` — verify loop works with a real-provider adapter (mocked fetch)

## Verification

- [x] T32: `npm run build` succeeds
- [x] T33: `npm test` passes
- [x] T34: Smoke: `kintsugi ask "hello" --provider openai-chat` works with valid API key
- [x] T35: Smoke: `kintsugi ask "hello" --provider openai-responses` works with valid API key
- [x] T36: Smoke: `kintsugi ask "hello" --provider anthropic-messages` works with compatible API key/base URL
- [x] T37: Smoke: `kintsugi ask "hello"` still uses mock provider by default
