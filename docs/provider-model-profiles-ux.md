# Provider And Model Profiles UX

## Current Baseline

Phase 10 archived the provider/model configuration contract:

- `modelProfiles` resolve provider, model, provider settings, model config, and key-file auth.
- Provider adapters serialize model config into OpenAI Chat, OpenAI Responses, and Anthropic request bodies.
- Live provider smoke stays opt-in behind `KINTSUGI_LIVE_SMOKE=1`.

Phase 8 already defines `/model <profile>` switching, but the broader model picker UX is still the next user-facing slice.

## UX Goal

Make provider/model selection inspectable and switchable without asking user to remember YAML keys or re-run `config show` in another terminal.

The TUI should answer three questions at a glance:

1. Which profile/provider/model is active?
2. Which configured profiles are available?
3. Is the selected real provider ready to run, or blocked by config/key-file issues?

## Proposed Interaction

### Status Line

Show the active profile when one is selected:

```text
model: fast-openai (openai-chat / gpt-4.1-mini)
```

If no profile is selected, show provider and model directly:

```text
model: openai-chat / gpt-4.1-mini
```

### `/model` Command

`/model` with no args opens a compact overlay/list:

- configured profiles first, sorted by YAML order when available
- current profile marked active
- provider/model/manual fallback row last
- disabled rows for profiles with `config doctor` errors

`/model <profile>` keeps the existing direct switch path.

### `/model inspect`

Print a compact, redacted view of the active selection:

- profile name
- provider
- model
- model config fields
- key source: `keyFile`, env, or missing
- config doctor warnings/errors

Never print API key contents.

## Acceptance Sketch

- TUI status line updates after `/model <profile>`.
- Overlay lists configured `modelProfiles` and preserves profile display order when possible.
- Overlay blocks or warns on missing key-file/API-key for real providers.
- `/model inspect` is redacted and includes doctor output.
- Tests cover profile listing, active marker, direct switch, inspect redaction, and missing-key disabled state.

## OpenSpec Follow-Up

Recommended next OpenSpec change name:

```text
phase-11-provider-model-profile-ux
```

This should depend on archived Phase 10 specs and may complete the still-open Phase 8 model overlay work.
