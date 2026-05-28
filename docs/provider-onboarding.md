# Provider Onboarding

Kintsugi provider setup should be explicit, repeatable, and secret-safe. Use an
API root as `baseUrl`; do not include endpoint paths such as
`/chat/completions`, `/responses`, or `/messages`.

## OpenAI-Compatible Provider

```yaml
providerPresets:
  openai-compatible-example:
    adapter: openai-chat
    baseUrl: https://api.example.com/v1
    keyFile: ~/.config/kintsugi/provider.key
    defaultModel: example-model

modelProfiles:
  example-chat:
    preset: openai-compatible-example
    model: example-model
    capabilities:
      tools: true
    config:
      maxTokens: 512
```

## Generic Local Provider

```yaml
providerPresets:
  local-openai:
    adapter: openai-chat
    baseUrl: http://localhost:8000/v1
    keyFile: ~/.config/kintsugi/local-openai.key

modelProfiles:
  local-chat:
    preset: local-openai
    model: local-model
```

The built-in `openai-compatible` preset intentionally has no `baseUrl`; define
one in config or doctor will report an error.

## Doctor Flow

1. Write the key into a file outside the repo.
2. Add a preset and model profile.
3. Run `node dist/index.js config doctor --model-profile <profile>`.
4. Run `npm run test:providers` for offline conformance.
5. Run the live matrix only for selected profiles:

```bash
KINTSUGI_LIVE_SMOKE=1 KINTSUGI_LIVE_PROFILES=profile-a,profile-b npm run test:providers
```

Live tool checks are capability-aware. Profiles without `capabilities.tools:
true` skip tool-call conformance while still allowing text streaming checks.
