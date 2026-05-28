# phase-4-openai-provider Specification

## Purpose
TBD - created by archiving change phase-4-openai-provider. Update Purpose after archive.
## Requirements
### Requirement: Provider adapters SHALL expose multiple API shapes behind one runtime interface

kintsugi SHALL support `mock`, `openai-chat`, `openai-responses`, and `anthropic-messages` provider ids. Real providers SHALL implement the shared `Provider` interface and translate provider-specific request and stream shapes into `RuntimeEvent`.

#### Scenario: Default provider is mock
- **WHEN** no `--provider` flag is given
- **THEN** the mock provider is used

#### Scenario: OpenAI Chat provider
- **WHEN** `--provider openai-chat` is given and `KINTSUGI_API_KEY` is set
- **THEN** kintsugi uses the Chat Completions adapter

#### Scenario: OpenAI Responses provider
- **WHEN** `--provider openai-responses` is given and `KINTSUGI_API_KEY` is set
- **THEN** kintsugi uses the Responses API adapter

#### Scenario: Anthropic Messages-style provider
- **WHEN** `--provider anthropic-messages` is given and `KINTSUGI_API_KEY` is set
- **THEN** kintsugi uses the Anthropic Messages-style adapter

### Requirement: OpenAI Chat adapter SHALL stream Chat Completions responses

`OpenAIChatProvider` SHALL call `POST /chat/completions` with `stream: true` and parse SSE chunks into `RuntimeEvent`.

#### Scenario: Successful streaming response
- **WHEN** `OpenAIChatProvider.streamTurn()` is called with valid config
- **THEN** it yields `turn.started`, one or more `assistant.delta`, `assistant.completed`, `turn.completed`

#### Scenario: Token usage in response
- **WHEN** the API returns `usage` in the final chunk
- **THEN** `turn.completed` includes `usage` with prompt, completion, and total counts

#### Scenario: No token usage in response
- **WHEN** the API does not return `usage`
- **THEN** `turn.completed` omits the `usage` field

### Requirement: OpenAI Responses adapter SHALL stream Responses API events

`OpenAIResponsesProvider` SHALL call `POST /responses` with `stream: true`, translate `ProviderMessage[]` into Responses input, and parse Responses stream events into `RuntimeEvent`.

#### Scenario: Responses text delta
- **WHEN** the stream emits `response.output_text.delta`
- **THEN** `assistant.delta` is yielded with the delta text

#### Scenario: Responses completion
- **WHEN** the stream emits `response.completed`
- **THEN** `assistant.completed` and `turn.completed` are yielded

### Requirement: Anthropic Messages-style adapter SHALL stream Messages events

`AnthropicMessagesProvider` SHALL call `POST /messages` with `stream: true`, translate system/user/assistant messages into Anthropic Messages shape, and parse Anthropic-style stream events into `RuntimeEvent`.

#### Scenario: Anthropic text delta
- **WHEN** the stream emits a `content_block_delta` text delta
- **THEN** `assistant.delta` is yielded with the delta text

#### Scenario: Anthropic completion
- **WHEN** the stream emits `message_stop`
- **THEN** `assistant.completed` and `turn.completed` are yielded

### Requirement: SSE parsers SHALL map chunks to RuntimeEvents

Each provider-specific SSE `data:` line SHALL be parsed. Text deltas SHALL map to `assistant.delta`. Normal completion SHALL map to `assistant.completed` + `turn.completed`. Malformed `data:` lines SHALL be skipped without failing the turn.

#### Scenario: Delta content maps to assistant.delta
- **WHEN** a chunk contains `delta.content: "hello"`
- **THEN** an `assistant.delta` event with `text: "hello"` is yielded

#### Scenario: Malformed data line is skipped
- **WHEN** a `data:` line is not valid JSON
- **THEN** the line is skipped and the turn continues

### Requirement: HTTP errors SHALL map to turn.failed

Authentication errors (401/403), rate limits (429), server errors (5xx), and network failures SHALL emit `turn.failed` with a descriptive message. The API key MUST NOT appear in the error message.

#### Scenario: 401 maps to auth failure
- **WHEN** the API returns HTTP 401
- **THEN** `turn.failed` with message "Authentication failed" is yielded

#### Scenario: API key not in errors
- **WHEN** any error occurs
- **THEN** the error message does not contain the API key value

### Requirement: Provider selection SHALL be configurable

The provider SHALL be selectable at runtime via `--provider` flag and `KINTSUGI_` environment variables. `--provider` selects `mock` (default), `openai-chat`, `openai-responses`, or `anthropic-messages`. `--model` overrides `KINTSUGI_MODEL`. `KINTSUGI_API_KEY`, `KINTSUGI_BASE_URL`, and `KINTSUGI_MODEL` SHALL configure real providers.

#### Scenario: Missing API key
- **WHEN** a real provider is selected and `KINTSUGI_API_KEY` is not set
- **THEN** a clear error message is shown

---

