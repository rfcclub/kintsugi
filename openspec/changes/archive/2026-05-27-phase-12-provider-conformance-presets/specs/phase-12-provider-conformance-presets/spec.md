# Spec: Phase 12 - Provider Conformance And Presets

## ADDED Requirements

### Requirement: Provider presets SHALL resolve to concrete adapters

kintsugi SHALL support provider presets that expand into concrete provider adapter settings before provider creation.

#### Scenario: Built-in Example preset resolves to OpenAI Chat
- **WHEN** a model profile selects preset `example`
- **THEN** the resolved provider adapter SHALL be `openai-chat`
- **AND** the resolved base URL SHALL be `https://api.example.com/v1`

#### Scenario: User preset overrides built-in preset
- **WHEN** user config defines a provider preset with the same name as a built-in preset
- **THEN** user config SHALL take precedence
- **AND** diagnostics SHALL show the resolved adapter and base URL

#### Scenario: Unknown preset is rejected
- **WHEN** a model profile references an unknown preset
- **THEN** config resolution or doctor SHALL report `Unknown provider preset`

### Requirement: Provider doctor SHALL report readiness without leaking secrets

`config doctor`, `/doctor`, and model inspection SHALL report provider readiness using redacted diagnostics.

#### Scenario: Missing key is an error
- **WHEN** a real provider profile has no API key and no readable key file
- **THEN** doctor SHALL report an error for the affected profile
- **AND** SHALL NOT print key contents

#### Scenario: Endpoint path mistake is detected
- **WHEN** a provider base URL includes `/chat/completions`, `/responses`, or `/messages`
- **THEN** doctor SHALL warn that the base URL should be the API root

#### Scenario: Resolved provider details are visible
- **WHEN** `/model inspect` runs for a preset-backed profile
- **THEN** output SHALL show preset name, concrete adapter, model, base URL, and key source
- **AND** output SHALL NOT show API key contents

### Requirement: Local provider conformance SHALL cover adapter behavior

kintsugi SHALL include deterministic local conformance tests for provider streaming, tool continuation, cancellation, redaction, and base URL normalization.

#### Scenario: Streaming conformance runs without network
- **WHEN** the local provider conformance command runs
- **THEN** OpenAI Chat, OpenAI Responses, and Anthropic adapters SHALL each produce non-empty assistant output against a fake server

#### Scenario: Tool continuation conformance runs without network
- **WHEN** the local conformance fake server emits a `read_file` tool call
- **THEN** kintsugi SHALL execute the tool
- **AND** continue the provider turn with the tool result

#### Scenario: Cancellation conformance aborts in-flight work
- **WHEN** an in-flight provider request is cancelled
- **THEN** kintsugi SHALL emit `turn.cancelled`
- **AND** SHALL NOT continue tool or provider loops after cancellation

### Requirement: Live provider conformance SHALL be opt-in and profile-scoped

Live provider conformance SHALL only run when explicitly enabled and SHALL be limited to selected profiles.

#### Scenario: Live matrix is skipped by default
- **WHEN** `KINTSUGI_LIVE_SMOKE` is not `1`
- **THEN** live provider conformance SHALL be skipped

#### Scenario: Selected profiles run live checks
- **WHEN** `KINTSUGI_LIVE_SMOKE=1`
- **AND** `KINTSUGI_LIVE_PROFILES` names one or more configured profiles
- **THEN** kintsugi SHALL run live conformance only for those profiles

#### Scenario: Tool capability is reported separately
- **WHEN** a live provider can stream text but cannot produce tool calls
- **THEN** conformance SHALL report tool-call capability as unsupported or skipped
- **AND** SHALL NOT fail the text-streaming check for that reason

## Traceability

| Scenario | Test File |
|----------|-----------|
| Built-in Example preset resolves to OpenAI Chat | `tests/provider-presets.test.ts` |
| User preset overrides built-in preset | `tests/provider-presets.test.ts` |
| Unknown preset is rejected | `tests/provider-presets.test.ts` |
| Missing key is an error | `tests/config-doctor-provider.test.ts` |
| Endpoint path mistake is detected | `tests/config-doctor-provider.test.ts` |
| Resolved provider details are visible | `tests/model-actions.test.ts` |
| Streaming conformance runs without network | `tests/provider-conformance.test.ts` |
| Tool continuation conformance runs without network | `tests/provider-conformance.test.ts` |
| Cancellation conformance aborts in-flight work | `tests/provider-conformance.test.ts` |
| Live matrix is skipped by default | `tests/live-provider-matrix.test.ts` |
| Selected profiles run live checks | `tests/live-provider-matrix.test.ts` |
| Tool capability is reported separately | `tests/live-provider-matrix.test.ts` |

---

*Spec: Kintsugi - 2026-05-26*
