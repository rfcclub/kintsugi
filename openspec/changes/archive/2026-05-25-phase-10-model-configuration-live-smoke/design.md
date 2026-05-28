# Design: Phase 10 - Model Configuration And Live Smoke

## Configuration Contract

Model configuration enters from:

1. CLI flags: `--provider`, `--model`, `--model-profile`
2. Environment: `KINTSUGI_PROVIDER`, `KINTSUGI_MODEL`, `KINTSUGI_KEY_FILE`, `KINTSUGI_API_KEY`
3. YAML config: `modelProfiles`, `modelConfig`, `providers`, `keyFile`

Resolution order remains:

- CLI model/provider overrides env/config.
- Env overrides YAML where already supported.
- Selected `modelProfile` supplies provider, model, and profile config.
- Top-level `modelConfig` overlays profile config.
- Provider settings and model config combine into provider options; explicit model config wins over provider settings for overlapping fields.

## Adapter Serialization

OpenAI Chat request body:

- `model`
- `max_tokens`
- `temperature`
- `top_p`
- `stop`
- `presence_penalty`
- `frequency_penalty`

OpenAI Responses request body:

- `model`
- `max_output_tokens`
- `temperature`
- `top_p`
- `stop`
- `presence_penalty`
- `frequency_penalty`

Anthropic Messages request body:

- `model`
- `max_tokens`
- `temperature`
- `top_p`
- `stop_sequences`

Provider adapters must prefer per-turn `request.modelConfig` over provider defaults.

## Live Smoke Gate

Add one test file that is skipped unless:

```bash
KINTSUGI_LIVE_SMOKE=1
```

The live smoke should:

- Resolve config normally.
- Create provider from resolved config.
- Boot runtime with no substrate if needed for a small request.
- Send a tiny prompt.
- Assert a non-empty assistant completion or a clear provider error.

Recommended command:

```bash
KINTSUGI_LIVE_SMOKE=1 \
KINTSUGI_PROVIDER=openai-chat \
KINTSUGI_MODEL=<model> \
KINTSUGI_KEY_FILE=/path/to/key \
npx vitest run tests/live-provider-smoke.test.ts
```

## Safety

- Never print API keys.
- Prefer key files over inline env var examples.
- Live smoke is opt-in and excluded from normal completion criteria unless explicitly run.

---

*Design: Kintsugi - 2026-05-24*
