# kintsugi

Ink-based CLI/TUI runtime for prompt assembly, provider streaming, tool execution, permissions, memory events, and resumable sessions.

## Quick Start

```bash
npm install
npm run build

# Run with mock provider (no API key needed)
node dist/index.js tui

# One-shot query
node dist/index.js ask "hello"
```

## Features

- **Interactive TUI** with colorful Ink-based terminal UI, slash commands, and overlays
- **Multi-provider support**: OpenAI Chat, OpenAI Responses, Anthropic Messages, mock
- **OpenAI-compatible endpoints**: works with OpenRouter, Ollama, vLLM, and other compatible APIs
- **Provider presets and model profiles**: configure multiple providers and switch at runtime
- **Tool execution** with permission model: read, write, edit, bash, grep, glob
- **Session persistence**: JSONL event store with resume, replay, and export
- **Memory system**: ops log, learned facts, reconstruction from event stream
- **Substrate (Echo)**: optional Markdown context layer
- **Config doctor**: validate provider setup, key files, and model profiles

## CLI Modes

```bash
node dist/index.js tui                        # interactive TUI
node dist/index.js ask "prompt"               # one-shot query
node dist/index.js threads                    # list past sessions
node dist/index.js echo                       # inspect substrate
node dist/index.js echo --summary             # substrate summary
node dist/index.js config init                # create default config
node dist/index.js config show                # print resolved config
node dist/index.js config doctor              # check config health
node dist/index.js config doctor --model-profile my-profile
node dist/index.js remember                   # browse memory events
node dist/index.js remember --learned         # show learned facts
node dist/index.js boot                       # boot/runtime info
node dist/index.js help                       # help
```

## Configuration

Config is YAML. Load order:

1. `~/.config/kintsugi/config.yaml` (global)
2. `.kintsugi/config.yaml` (project-local)
3. `KINTSUGI_*` environment variables
4. CLI flags

Example:

```yaml
provider: openai-chat
model: gpt-4.1-mini

providers:
  openai-chat:
    baseUrl: https://api.openai.com/v1
    keyFile: ~/.config/kintsugi/openai.key

permissions:
  read_file: allow
  list_files: allow
  grep: allow
  write_file: ask
  edit_file: ask
  bash: ask
```

Keep API keys in environment variables or key files, never in committed config.

## Provider Profiles

Configure multiple providers and switch between them:

```yaml
providerPresets:
  openai:
    adapter: openai-chat
    baseUrl: https://api.openai.com/v1
  anthropic:
    adapter: anthropic-messages
    baseUrl: https://api.anthropic.com/v1

modelProfiles:
  fast:
    preset: openai
    model: gpt-4.1-mini
    capabilities:
      tools: true
    config:
      maxTokens: 4096
  deep:
    preset: anthropic
    model: claude-sonnet-4-5
    config:
      maxTokens: 8192
```

Switch in TUI with `/model fast` or on the command line:

```bash
node dist/index.js ask --model-profile deep "Explain monads"
```

## Substrate (Echo)

The optional substrate directory is a local Markdown context source:

```bash
export KINTSUGI_SUBSTRATE=~/.config/kintsugi/substrate
node dist/index.js ask --substrate ./local-substrate "hello"
node dist/index.js ask --no-substrate "hello"
```

## TUI Commands

| Command | Action |
|---------|--------|
| `/help` | Show available commands |
| `/exit` | Close TUI |
| `/stop` | Cancel active work |
| `/new` | Fresh session |
| `/resume <id>` | Resume prior session |
| `/threads` | Browse sessions |
| `/model [profile]` | Switch model/profile |
| `/config` | View config |
| `/doctor` | Config health check |
| `/memory` | Browse memory |
| `/remember` | Alias for /memory |
| `/approve` | Approve pending tool |
| `/deny` | Deny pending tool |
| `/always` | Allow tool for session |

`//text` sends a literal `/text` prompt instead of a command.

## Verification

```bash
npm run lint              # TypeScript type checking
npm test                  # 215+ tests
npm run coverage          # v8 coverage report
npm run test:providers    # provider conformance
npm run test:open-phases  # open phase smoke
npm run test:kintsugi     # integration smoke
npx openspec validate --all --strict
```

Live provider tests are opt-in:

```bash
KINTSUGI_LIVE_SMOKE=1 \
KINTSUGI_LIVE_PROFILES=my-profile \
npm run test:providers
```

## Documentation

- [Getting Started](docs/getting-started.md)
- [Configuration Reference](docs/configuration.md)
- [Provider Guide](docs/providers.md)
- [Tools Guide](docs/tools.md)
- [Sessions and Memory](docs/sessions-memory.md)
- [Architecture](docs/architecture.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 18+ |
| Language | TypeScript (strict) |
| TUI | Ink + React |
| Tests | Vitest |
| Config | YAML |
| Storage | JSONL |
