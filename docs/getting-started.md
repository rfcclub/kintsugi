# Getting Started with Kintsugi

## Installation

```bash
git clone git@github.com:rfcclub/kintsugi.git
cd kintsugi
npm install
npm run build
```

Verify the build:

```bash
node dist/index.js help
```

## First Run (No API Key Needed)

Kintsugi ships with a `mock` provider for local testing:

```bash
node dist/index.js tui
```

This opens the interactive TUI with a deterministic mock provider. Type a message and see the mock response stream in.

## Setting Up a Real Provider

### Option 1: Environment Variable

```bash
export KINTSUGI_API_KEY="your-api-key-here"
node dist/index.js ask "What is the capital of France?"
```

### Option 2: Key File

```bash
echo "your-api-key-here" > ~/.config/kintsugi/openai.key
chmod 600 ~/.config/kintsugi/openai.key
```

Then reference it in config or via env:

```bash
export KINTSUGI_KEY_FILE=~/.config/kintsugi/openai.key
```

### Option 3: Full Config

Create `~/.config/kintsugi/config.yaml`:

```yaml
provider: openai-chat
model: gpt-4.1-mini

providers:
  openai-chat:
    baseUrl: https://api.openai.com/v1
    keyFile: ~/.config/kintsugi/openai.key
```

Or use `config init` to generate a template:

```bash
node dist/index.js config init
```

## Choosing a Provider

| Adapter | Use Case |
|---------|----------|
| `openai-chat` | OpenAI Chat Completions API, or OpenAI-compatible endpoints |
| `openai-responses` | OpenAI Responses API |
| `anthropic-messages` | Anthropic Claude API |
| `mock` | Testing, no network |

For OpenAI-compatible providers (OpenRouter, local LLMs, etc.):

```yaml
providerPresets:
  my-provider:
    adapter: openai-chat
    baseUrl: https://api.example.com/v1
    keyFile: ~/.config/kintsugi/my-provider.key
    defaultModel: my-model

modelProfiles:
  my-profile:
    preset: my-provider
    model: my-model
    capabilities:
      tools: true
    config:
      maxTokens: 4096
```

Then:

```bash
node dist/index.js ask --model-profile my-profile "Hello"
```

## Running the TUI

```bash
node dist/index.js tui
```

Inside the TUI:

- Type messages and press Enter to send
- `/help` — show available commands
- `/model` — switch model/provider
- `/config` — view resolved config
- `/doctor` — check configuration health
- `/memory` — browse memory events
- `/new` — start a fresh session
- `/threads` — list past sessions
- `/stop` — cancel active work
- `/exit` — close the TUI

## Substrate (Echo)

Kintsugi reads optional Markdown context from `~/.config/kintsugi/substrate`. This is your personal context layer — notes, preferences, project info.

```bash
# Inspect loaded substrate
node dist/index.js echo
node dist/index.js echo --summary

# Use a custom substrate
node dist/index.js ask --substrate ./my-context.md "Hello"

# Disable substrate
node dist/index.js ask --no-substrate "Hello"
```

## Verification

```bash
npm run lint         # TypeScript checks
npm test             # 215+ tests
npm run coverage     # Coverage report
npm run test:providers  # Provider conformance
```

## Next Steps

- [Configuration Reference](configuration.md) — full config options
- [Provider Guide](providers.md) — provider adapters and wire formats
- [Tools](tools.md) — built-in tools and permissions
- [Sessions and Memory](sessions-memory.md) — persistence and replay
- [Architecture](architecture.md) — module design and runtime flow
