# Design: Phase 4 — Provider Adapters

## Provider Family

Phase 4 introduces real provider adapters behind kintsugi's existing `Provider` interface. The runtime and UI continue to speak `ProviderTurnRequest`, `ProviderMessage`, and `RuntimeEvent`; each adapter owns API-specific request translation and SSE parsing.

| Provider id | API shape | Default base URL | Endpoint |
|-------------|-----------|------------------|----------|
| `mock` | local deterministic mock | none | none |
| `openai-chat` | OpenAI Chat Completions compatible | `https://api.openai.com/v1` | `POST /chat/completions` |
| `openai-responses` | OpenAI Responses API compatible | `https://api.openai.com/v1` | `POST /responses` |
| `anthropic-messages` | Anthropic Messages API style | `https://api.anthropic.com/v1` | `POST /messages` |

`anthropic-messages` is an API-shape adapter, not a hard requirement to use Anthropic's hosted server. A compatible gateway can be used by overriding `KINTSUGI_BASE_URL`.

## Shared Provider Configuration

```ts
// src/providers/config.ts

export type ProviderType =
  | "mock"
  | "openai-chat"
  | "openai-responses"
  | "anthropic-messages";

export interface RealProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
}
```

## OpenAI Chat Adapter

File: `src/providers/openai-chat.ts`

1. `POST {baseUrl}/chat/completions` with `stream: true`.
2. Headers: `Authorization: Bearer {apiKey}`, `Content-Type: application/json`.
3. Body: `{ model, messages, stream: true, max_tokens, stream_options: { include_usage: true } }`.
4. Read SSE response line by line.
5. Each `data: {...}` chunk maps to events.

### OpenAI Chat SSE Parsing

```
data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"Hello"},"index":0}]}
data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":" world"},"index":0}]}
data: {"id":"chatcmpl-xxx","choices":[{"delta":{},"finish_reason":"stop","index":0}]}
data: [DONE]
```

Mapping:

| SSE field | RuntimeEvent |
|-----------|-------------|
| First chunk received | `turn.started` |
| `delta.content` present | `assistant.delta` |
| `finish_reason: "stop"` | `assistant.completed` + `turn.completed` |
| `finish_reason: "tool_calls"` | `tool.requested` (one per tool call) |
| `usage` in final chunk | `turn.completed.usage` |
| `finish_reason: "length"` | `assistant.completed` + truncation signal |

`finish_reason: "length"` must be visible to the user. Either emit a distinct `turn.truncated` event before completion or include `truncated: true` on completion metadata; token exhaustion must not look identical to a normal stop.

## OpenAI Responses Adapter

File: `src/providers/openai-responses.ts`

1. `POST {baseUrl}/responses` with `stream: true`.
2. Headers: `Authorization: Bearer {apiKey}`, `Content-Type: application/json`.
3. Body: `{ model, input, stream: true, max_output_tokens }`.
4. Translate `ProviderMessage[]` into Responses `input` items. System messages become instructions/context input; user and assistant messages retain role.
5. Parse Responses SSE event objects into shared runtime events.

Expected event mapping:

| Responses stream event | RuntimeEvent |
|------------------------|--------------|
| `response.created` | `turn.started` |
| `response.output_text.delta` | `assistant.delta` |
| `response.completed` | `assistant.completed` + `turn.completed` |
| `response.failed` | `turn.failed` |
| incomplete/max token status | completion with visible truncation signal |
| usage fields | `turn.completed.usage` |

The adapter should preserve the same provider boundary as `openai-chat`; no UI code should care that the model used `/responses`.

## Anthropic Messages-Style Adapter

File: `src/providers/anthropic-messages.ts`

1. `POST {baseUrl}/messages` with `stream: true`.
2. Headers: `x-api-key: {apiKey}`, `anthropic-version`, `Content-Type: application/json`.
3. Body: `{ model, system, messages, stream: true, max_tokens }`.
4. Translate internal `system` provider messages into a single Anthropic `system` string. User/assistant messages become Anthropic `messages`.
5. Parse Anthropic-style SSE event objects into shared runtime events.

Expected event mapping:

| Anthropic stream event | RuntimeEvent |
|------------------------|--------------|
| `message_start` | `turn.started` |
| `content_block_delta` text delta | `assistant.delta` |
| `message_stop` | `assistant.completed` + `turn.completed` |
| `message_delta.usage` | `turn.completed.usage` when final usage is known |
| `stop_reason: "max_tokens"` | completion with visible truncation signal |
| error event | `turn.failed` |

Tool calls may arrive as content blocks. Phase 4 should parse enough structure to emit `tool.requested` when a provider returns tool-use content, while actual execution remains Phase 5.

### Error Mapping

| Condition | RuntimeEvent |
|-----------|-------------|
| HTTP 401/403 | `turn.failed` with "Authentication failed" |
| HTTP 429 | `turn.failed` with "Rate limited" |
| HTTP 5xx | `turn.failed` with "Provider error: {status}" |
| Network timeout | `turn.failed` with "Request timed out" |
| Network error | `turn.failed` with "Network error: {message}" |
| `data:` line parse error | Skip and continue (log warning) |

### Token Usage Extraction

Each adapter extracts usage from its API-specific stream. If usage is absent, emit `turn.completed` without the `usage` field.

## Configuration

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `KINTSUGI_API_KEY` | API key | none (required for real provider) |
| `KINTSUGI_PROVIDER` | provider id | `mock` |
| `KINTSUGI_BASE_URL` | API base URL | provider-specific |
| `KINTSUGI_MODEL` | Model ID | `gpt-4o-mini` |
| `KINTSUGI_ANTHROPIC_VERSION` | Anthropic Messages version header | stable pinned default |

### Config File (future)

Not in Phase 4. For now, env vars are sufficient. Config file support can be added post-Phase 6.

### CLI Flags

```
kintsugi ask "hello" --provider openai-chat --model gpt-4o
kintsugi ask "hello" --provider openai-responses --model gpt-4.1-mini
kintsugi tui --provider anthropic-messages --model claude-sonnet-4-5
```

`--provider` selects the provider: `mock` (default), `openai-chat`, `openai-responses`, or `anthropic-messages`. `--model` overrides `KINTSUGI_MODEL`.

## Provider Registry

```ts
// src/providers/registry.ts

export function createProvider(type: ProviderType, config?: Record<string, unknown>): Provider {
  switch (type) {
    case "mock":
      return new MockProvider(config as MockProviderConfig);
    case "openai-chat":
      return new OpenAIChatProvider(resolveRealProviderConfig(type));
    case "openai-responses":
      return new OpenAIResponsesProvider(resolveRealProviderConfig(type));
    case "anthropic-messages":
      return new AnthropicMessagesProvider(resolveRealProviderConfig(type));
    default:
      throw new Error(`Unknown provider: ${type}`);
  }
}
```

## File Map (new files)

```text
src/
  providers/
    config.ts              # provider ids + env resolution
    sse.ts                 # shared SSE line reader helpers
    openai-chat.ts         # OpenAI Chat Completions adapter
    openai-responses.ts    # OpenAI Responses adapter
    anthropic-messages.ts  # Anthropic Messages-style adapter
    registry.ts            # createProvider() factory
  cli/
    args.ts                # updated: --provider, --model flags
```

## Security

- API keys MUST NOT appear in logs, command-line output, or session transcripts.
- API keys MUST be read from env vars or files, never hardcoded.
- The provider MUST validate the key format minimally (non-empty string).
- Error messages MUST NOT include the API key value.
- Request bodies and headers MUST NOT be logged.
- Provider/network error strings MUST pass through an API-key redactor before becoming `turn.failed`.
- Provider-specific headers and request shapes MUST be contained inside adapters.

## Verification

- Unit: each SSE parser maps chunks to correct RuntimeEvents.
- Unit: Error mapping covers 401, 429, 5xx, timeout.
- Integration smoke: `kintsugi ask "hello" --provider openai-chat` returns a real response (requires `KINTSUGI_API_KEY`).
- Integration smoke: `kintsugi ask "hello" --provider openai-responses` returns a real response (requires `KINTSUGI_API_KEY`).
- Integration smoke: `kintsugi ask "hello" --provider anthropic-messages` returns a real response (requires a compatible key and base URL when not using Anthropic directly).
- Mock provider remains default; real provider is opt-in.
