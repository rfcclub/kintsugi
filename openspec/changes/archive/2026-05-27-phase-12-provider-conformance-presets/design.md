# Design: Phase 12 - Provider Conformance And Presets

## Baseline

Current provider support is adapter-oriented:

- `openai-chat`
- `openai-responses`
- `anthropic-messages`
- `mock`

Current config support includes:

- `provider`
- `model`
- `providerSettings`
- `modelConfig`
- `keyFile`
- `modelProfiles`

This is flexible, but it asks the user to know which adapter and settings a provider needs. It also leaves live verification mostly single-profile and manual.

## Provider Presets

Introduce a preset layer that resolves before provider creation.

Example config shape:

```yaml
providerPresets:
  example:
    adapter: openai-chat
    baseUrl: https://api.example.com/v1
    keyFile: ~/.config/kintsugi/example.key
    defaultModel: greg

modelProfiles:
  example-greg:
    preset: example
    model: greg
    config:
      maxTokens: 512
```

Resolution order:

1. Adapter defaults.
2. Provider preset settings.
3. Model profile settings.
4. Top-level config.
5. CLI/env overrides.

The resolved config must still expose the concrete adapter in diagnostics, for example `adapter: openai-chat`, not only `preset: example`.

## Built-In Presets

Built-in presets should be data-only defaults and may be overridden by user config:

| Preset | Adapter | Base URL | Notes |
|--------|---------|----------|-------|
| `openai` | `openai-chat` | `https://api.openai.com/v1` | Generic OpenAI Chat Completions |
| `openai-responses` | `openai-responses` | `https://api.openai.com/v1` | Responses API |
| `anthropic` | `anthropic-messages` | `https://api.anthropic.com/v1` | Messages API |
| `example` | `openai-chat` | `https://api.example.com/v1` | OpenAI-compatible Example gateway |
| `openai-compatible` | `openai-chat` | unset | Requires explicit `baseUrl` |

## Conformance Matrix

Conformance checks should be split into deterministic local tests and opt-in live tests.

Local fake-server checks:

- Chat streaming emits assistant output.
- Responses streaming emits assistant output.
- Anthropic streaming emits assistant output.
- Tool call continuation sends tool results back to the provider.
- Cancellation aborts an in-flight request.
- Provider errors redact keys.
- Base URLs with or without trailing slash resolve correctly.

Opt-in live checks:

- Profile can produce non-empty assistant text.
- Profile can run a tiny max-token response.
- Tool-call capable profiles can trigger `read_file`.
- Aborted live requests do not hang.
- Provider errors are redacted.

The live matrix should accept a bounded profile list:

```bash
KINTSUGI_LIVE_SMOKE=1 KINTSUGI_LIVE_PROFILES=example-greg,anthropic-sonnet npm run test:providers
```

## Doctor Diagnostics

Doctor output should classify provider readiness:

- `ok`: provider can be created with explicit key/model/base URL.
- `warn`: live conformance not run, optional model config absent, or preset uses generic defaults.
- `error`: missing key, missing model, unknown preset, unknown adapter, invalid base URL, unreadable key file.

For endpoint shape, doctor should flag common mistakes:

- Base URL appears to include `/chat/completions`, `/responses`, or `/messages`.
- OpenAI-compatible preset has no `baseUrl`.
- Anthropic preset uses a non-Anthropic adapter without explicit override.

## Documentation

Add a short provider onboarding guide:

1. Create key file.
2. Add provider preset or model profile.
3. Run `kintsugi config doctor`.
4. Run local conformance tests.
5. Optionally run live matrix for selected profiles.

## Risks

- Presets can hide adapter behavior if diagnostics do not show the concrete resolved adapter.
- Live smokes can become flaky; they must remain opt-in and bounded.
- Some OpenAI-compatible providers support chat streaming but not tool calls. Tool conformance must report capability, not blanket failure.

---

*Design: Kintsugi - 2026-05-26*
