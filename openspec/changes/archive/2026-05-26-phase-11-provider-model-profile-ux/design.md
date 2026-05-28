# Design: Phase 11 - Provider Model Profile UX

## Profile Resolution

`/model <profile>` resolves from configured `modelProfiles` rather than only recording a profile name. The resolved selection includes:

- provider adapter
- model id
- provider-specific settings
- model config
- provider options used to recreate the provider instance

Provider settings merge order:

1. provider defaults from `providers.<adapter>`
2. profile-level `settings`
3. explicit command override, if any

Profile-level settings therefore let gateway profiles such as `example-kimi` carry `baseUrl`, `keyFile`, and `maxTokens` without changing global adapter defaults.

## TUI Surface

`/model` with no args opens an overlay that shows:

- active profile/provider/model
- configured profiles
- active marker
- blocked marker for invalid profile definitions
- manual provider/model fallback

`/model inspect` opens a redacted overlay for the active selection:

- profile name
- provider
- model
- key source (`keyFile`, env, or missing)
- model config

API key contents are never printed.

`/model <profile>` switches immediately and recreates the provider instance.

## Status Line

The TUI status frame shows the active model selection:

```text
active: example-kimi (openai-chat/kimi-k2.6)
```

If no profile is selected:

```text
active: openai-chat/gpt-4.1-mini
```

## Risks

- Interactive picker UI remains a follow-up; this phase focuses on inspectable command UX and correct profile switching.
- Provider health can be transient. The profile UX should report configuration readiness, not guarantee a live provider response.
