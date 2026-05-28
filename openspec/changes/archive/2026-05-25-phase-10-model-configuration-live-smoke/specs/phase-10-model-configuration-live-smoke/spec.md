# Spec: Phase 10 - Model Configuration And Live Smoke

## ADDED Requirements

### Requirement: Model profile resolution SHALL produce complete provider options

kintsugi SHALL resolve model profiles into provider, model, provider settings, model config, and key-file settings before provider creation.

#### Scenario: Profile and top-level config merge into provider options
- **WHEN** config selects a model profile with provider, model, and config
- **AND** top-level `modelConfig` sets overlapping and additional fields
- **THEN** the resolved provider options include the selected model
- **AND** top-level `modelConfig` wins for overlapping fields
- **AND** provider settings remain present

#### Scenario: Key file is used for real provider auth
- **WHEN** a real provider is created with `keyFile`
- **THEN** kintsugi reads the key from the file
- **AND** does not require the key to be passed on the command line

### Requirement: Provider adapters SHALL serialize model config

Provider adapters SHALL map internal `ModelConfig` fields to the correct provider request fields.

#### Scenario: OpenAI Chat serializes model config
- **WHEN** an OpenAI Chat turn runs with `modelConfig`
- **THEN** request JSON includes `max_tokens`, `temperature`, `top_p`, `stop`, `presence_penalty`, and `frequency_penalty`

#### Scenario: OpenAI Responses serializes model config
- **WHEN** an OpenAI Responses turn runs with `modelConfig`
- **THEN** request JSON includes `max_output_tokens`, `temperature`, `top_p`, `stop`, `presence_penalty`, and `frequency_penalty`

#### Scenario: Anthropic Messages serializes model config
- **WHEN** an Anthropic Messages turn runs with `modelConfig`
- **THEN** request JSON includes `max_tokens`, `temperature`, `top_p`, and `stop_sequences`

### Requirement: Live provider smoke SHALL be opt-in

Live provider tests SHALL never run during normal `npm test` unless explicitly enabled.

#### Scenario: Live smoke is skipped by default
- **WHEN** `KINTSUGI_LIVE_SMOKE` is not `1`
- **THEN** live provider smoke tests are skipped

#### Scenario: Live smoke runs with key file
- **WHEN** `KINTSUGI_LIVE_SMOKE=1`
- **AND** a real provider, model, and key file are configured
- **THEN** kintsugi sends a tiny prompt
- **AND** receives a non-empty assistant completion or a redacted provider error

## Traceability

| Scenario | Test File |
|----------|-----------|
| Profile and top-level config merge into provider options | `tests/config.test.ts`, `tests/model-actions.test.ts` |
| Key file is used for real provider auth | `tests/provider-registry.test.ts` |
| OpenAI Chat serializes model config | `tests/openai-chat-provider.test.ts` |
| OpenAI Responses serializes model config | `tests/openai-responses-provider.test.ts` |
| Anthropic Messages serializes model config | `tests/anthropic-messages-provider.test.ts` |
| Live smoke is skipped by default | `tests/live-provider-smoke.test.ts` |
| Live smoke runs with key file | `tests/live-provider-smoke.test.ts` |

---

*Spec: Kintsugi - 2026-05-24*
