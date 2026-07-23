# Provider Guide

Kintsugi supports multiple LLM providers through a unified `Provider` interface. Provider adapters translate between the provider's API wire format and Kintsugi's `RuntimeEvent` stream.

## Provider Interface

```typescript
interface Provider {
  readonly id: string;
  streamTurn(request: ProviderTurnRequest): AsyncIterable<RuntimeEvent>;
}
```

Providers receive `ProviderTurnRequest` containing messages, tool specs, model config, and an optional `AbortSignal`. They yield `RuntimeEvent` values — deltas, tool requests, completion, errors.

## Built-in Providers

### mock

Deterministic provider for testing. No network calls. Returns canned responses and echoes tool calls back.

```bash
node dist/index.js tui  # defaults to mock when no API key is set
```

### openai-chat

OpenAI Chat Completions API (`/chat/completions`). Wire format:
- Tools use `function` type
- Tool calls arrive as `tool_calls` on assistant messages
- Tool results use `tool_call_id` for correlation

```yaml
providers:
  openai-chat:
    baseUrl: https://api.openai.com/v1
    keyFile: ~/.config/kintsugi/openai.key
```

### openai-responses

OpenAI Responses API (`/responses`). Wire format:
- Tools use `function` type
- Tool calls use `function_call` items
- Tool results use `function_call_output` items

```yaml
providers:
  openai-responses:
    baseUrl: https://api.openai.com/v1
    keyFile: ~/.config/kintsugi/openai.key
```

### anthropic-messages

Anthropic Messages API (`/messages`). Wire format:
- Tools use Anthropic's native tool schema
- Tool calls arrive as `tool_use` content blocks
- Tool results use `tool_result` content blocks with `tool_use_id`

```yaml
providers:
  anthropic-messages:
    baseUrl: https://api.anthropic.com/v1
    anthropicVersion: "2023-06-01"
    keyFile: ~/.config/kintsugi/anthropic.key
```

## OpenAI-Compatible Providers

Any provider with an OpenAI-compatible `/v1/chat/completions` endpoint works with `openai-chat`. This includes:

- OpenRouter
- Crof AI (`https://crof.ai/v1`)
- Local LLM servers (Ollama, vLLM, LM Studio)
- Cloud providers with OpenAI-compatible APIs

```yaml
providerPresets:
  crof-deep:
    adapter: openai-chat
    baseUrl: https://crof.ai/v1
    keyFile: ~/.config/kintsugi/crof.key
    defaultModel: deepseek-v4-flash

modelProfiles:
  crof-deepseek:
    preset: crof-deep
    model: deepseek-v4-flash
    capabilities:
      tools: true
    config:
      maxTokens: 4096

  openrouter:
    adapter: openai-chat
    baseUrl: https://openrouter.ai/api/v1
    keyFile: ~/.config/kintsugi/openrouter.key
    defaultModel: anthropic/claude-sonnet-4

modelProfiles:
  openrouter-claude:
    preset: openrouter
    model: anthropic/claude-sonnet-4
    capabilities:
      tools: true
    config:
      maxTokens: 4096
```

## Provider Presets

Presets are reusable provider configurations. They define adapter type, base URL, key file, and default model.

```yaml
providerPresets:
  my-company-llm:
    adapter: openai-chat
    baseUrl: https://llm.internal.company.com/v1
    keyFile: ~/.config/kintsugi/company.key
    defaultModel: company-gpt-4
```

Built-in presets (no `baseUrl` by default):
- `openai` — adapter: `openai-chat`
- `openai-responses` — adapter: `openai-responses`
- `anthropic` — adapter: `anthropic-messages`
- `example` — adapter: `openai-chat`, baseUrl: `https://api.example.com/v1`

## Model Profiles

Model profiles are the top-level configuration unit. They combine a preset (or direct provider settings), model name, capabilities, and config overrides.

```yaml
modelProfiles:
  fast:
    preset: openai
    model: gpt-4.1-mini
    capabilities:
      tools: true
    config:
      maxTokens: 2048

  deep:
    provider: openai-responses
    model: o3
    config:
      reasoning_effort: high
      maxTokens: 16384
```

Profiles with `capabilities.tools: true` enable tool-call conformance in tests. Profiles without it skip tool-call checks while still allowing text streaming verification.

## API Key Resolution

Keys are resolved in this order:

1. `KINTSUGI_API_KEY` environment variable
2. `keyFile` from provider settings in config
3. `keyFile` from model profile settings
4. `KINTSUGI_KEY_FILE` environment variable

Key files should be:
- Stored outside the repo
- `chmod 600` (owner read-write only)
- Never committed to version control

## Adding a Custom Provider

1. Create `src/providers/my-provider.ts`
2. Implement the `Provider` interface
3. Add `"my-provider"` to `ProviderType` in `src/providers/config.ts`
4. Register in `src/providers/registry.ts`
5. Add wire-format tests in `tests/provider-conformance.test.ts`
6. Document the wire format and configuration

## Wire Format Conformance

Each provider adapter must correctly serialize:
- Tool definitions in the initial request
- Tool calls in assistant responses
- Tool results for continuation

The test suite in `tests/provider-conformance.test.ts` verifies actual HTTP request body shapes for each adapter. Run with:

```bash
npm run test:providers
```

## Live Smoke Testing

Test a real provider end-to-end:

```bash
KINTSUGI_LIVE_SMOKE=1 \
KINTSUGI_LIVE_PROFILES=my-profile \
npm run test:providers
```

Or via CLI:

```bash
node dist/index.js config doctor --model-profile my-profile
KINTSUGI_MEMORY_DIR=/tmp/kintsugi-smoke \
  node dist/index.js ask --model-profile my-profile --no-substrate \
  "Say OK in one short sentence."
```

The `KINTSUGI_MEMORY_DIR` override prevents live tests from polluting your real session store.
