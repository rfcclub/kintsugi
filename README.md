# kintsugi

Ink-based CLI/TUI runtime for prompt assembly, provider streaming, tool execution,
permissions, memory events, and resumable sessions.

## Quick Start

```bash
npm install
npm run build
node dist/index.js help
```

## CLI Modes

```bash
node dist/index.js tui
node dist/index.js ask "hello"
node dist/index.js threads
node dist/index.js echo --summary
node dist/index.js config init
node dist/index.js config doctor
```

## Substrate

The optional substrate directory is a local Markdown context source. By default,
kintsugi reads `~/.config/kintsugi/substrate`. Override or disable it with:

```bash
export KINTSUGI_SUBSTRATE=~/.config/kintsugi/substrate
node dist/index.js ask --substrate ./local-substrate "hello"
node dist/index.js ask --no-substrate "hello"
```

## Config

Config is YAML. Runtime state stays JSON/JSONL.

Load order:

1. `~/.config/kintsugi/config.yaml`
2. `.kintsugi/config.yaml` in the current project
3. `KINTSUGI_` environment variables
4. CLI flags

Example:

```yaml
provider: openai-responses
model: gpt-4.1-mini
substrate: ~/.config/kintsugi/substrate

providers:
  openai-responses:
    baseUrl: https://api.openai.com/v1
  anthropic-messages:
    baseUrl: https://api.anthropic.com/v1
    anthropicVersion: "2023-06-01"

permissions:
  read_file: allow
  list_files: allow
  grep: allow
  write_file: ask
  edit_file: ask
  bash: ask
```

Keep API keys in environment variables or key files, not committed config.

## Provider Profiles

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

Smoke a configured profile without printing secrets:

```bash
node dist/index.js config doctor --model-profile example-chat
KINTSUGI_MEMORY_DIR=/tmp/kintsugi-live-smoke \
  node dist/index.js ask --model-profile example-chat --no-substrate \
  "Say OK in one short sentence."
```

## Verification

```bash
npm run lint
npm test
npm run coverage
npm run test:providers
npm run test:open-phases
npm run test:kintsugi
npx openspec validate --all --strict
```

Live provider tests are opt-in:

```bash
KINTSUGI_LIVE_SMOKE=1 \
KINTSUGI_LIVE_PROFILES=example-chat \
npm run test:providers
```
