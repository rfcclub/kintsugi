# Configuration Reference

Kintsugi resolves configuration from multiple sources in priority order:

1. CLI flags (highest priority)
2. `KINTSUGI_*` environment variables
3. `.kintsugi/config.yaml` in current project
4. `~/.config/kintsugi/config.yaml` (global)

Later sources do not override earlier ones for the same key.

## Config File

```yaml
# Provider selection
provider: openai-chat           # mock | openai-chat | openai-responses | anthropic-messages
model: gpt-4.1-mini

# Model profile (overrides provider/model when set)
modelProfile: fast-openai

# Substrate (Echo) path
substrate: ~/.config/kintsugi/substrate
# noSubstrate: true             # disable substrate loading

# Workspace
workspace: .                    # working directory for tools
workspaceBudget: 65536          # max characters for workspace context
workspaceRoots:                 # allowed file-system roots
  - /home/user/projects

# Provider settings (per-provider overrides)
providers:
  openai-chat:
    baseUrl: https://api.openai.com/v1
    keyFile: ~/.config/kintsugi/openai.key
    model: gpt-4.1-mini
    maxTokens: 4096
    timeoutMs: 30000
  anthropic-messages:
    baseUrl: https://api.anthropic.com/v1
    anthropicVersion: "2023-06-01"
    keyFile: ~/.config/kintsugi/anthropic.key

# Provider presets (reusable provider configs)
providerPresets:
  my-llm:
    adapter: openai-chat
    baseUrl: https://api.example.com/v1
    keyFile: ~/.config/kintsugi/my-llm.key
    defaultModel: my-model

# Model profiles (complete model configuration)
modelProfiles:
  fast-openai:
    preset: openai
    model: gpt-4.1-mini
    capabilities:
      tools: true
    config:
      maxTokens: 4096
      temperature: 0.7
  deep-think:
    provider: openai-responses
    model: o3
    config:
      reasoning_effort: high
      maxTokens: 16384

# Model config overrides
modelConfig:
  temperature: 0.7
  top_p: 1.0
  reasoning_effort: medium    # low | medium | high
  maxTokens: 4096
  stopSequences: ["END"]
  presencePenalty: 0
  frequencyPenalty: 0

# Permissions
permissions:
  read_file: allow
  list_files: allow
  grep: allow
  write_file: ask
  edit_file: ask
  bash: ask

# API key file (global fallback)
keyFile: ~/.config/kintsugi/api.key

# UI
ui:
  theme: default
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `KINTSUGI_API_KEY` | API key for the active provider | — |
| `KINTSUGI_KEY_FILE` | Path to file containing API key | — |
| `KINTSUGI_PROVIDER` | Provider type | `mock` |
| `KINTSUGI_MODEL` | Model name | provider default |
| `KINTSUGI_BASE_URL` | Provider API base URL | provider default |
| `KINTSUGI_SUBSTRATE` | Substrate path | `~/.config/kintsugi/substrate` |
| `KINTSUGI_NO_SUBSTRATE` | Disable substrate (`1`) | — |
| `KINTSUGI_MAX_TOKENS` | Max output tokens | `4096` |
| `KINTSUGI_TIMEOUT_MS` | Request timeout in ms | `30000` |
| `KINTSUGI_TEMPERATURE` | Sampling temperature | — |
| `KINTSUGI_TOP_P` | Nucleus sampling | — |
| `KINTSUGI_REASONING_EFFORT` | Reasoning effort level | — |
| `KINTSUGI_STOP_SEQUENCES` | Comma-separated stop sequences | — |
| `KINTSUGI_PRESENCE_PENALTY` | Presence penalty | — |
| `KINTSUGI_FREQUENCY_PENALTY` | Frequency penalty | — |
| `KINTSUGI_ANTHROPIC_VERSION` | Anthropic API version | `2023-06-01` |
| `KINTSUGI_MEMORY_DIR` | Memory/session storage root | `~/.kintsugi` |
| `KINTSUGI_LIVE_SMOKE` | Enable live provider tests (`1`) | — |
| `KINTSUGI_LIVE_PROFILES` | Comma-separated profile names for live smoke | — |

## CLI Flags

```
kintsugi ask [options] "prompt"
  --provider <type>       Provider type
  --model <name>          Model name
  --model-profile <name>  Model profile from config
  --substrate <path>      Custom substrate path
  --no-substrate          Disable substrate
  --print                 Print mode (no TUI)

kintsugi tui [options]
  --provider <type>
  --model <name>
  --model-profile <name>
  --resume <session-id>   Resume a prior session
  --substrate <path>
  --no-substrate

kintsugi config [subcommand]
  init                    Create default config file
  show                    Print resolved config
  doctor                  Check configuration health
  doctor --model-profile <name>  Validate a specific profile

kintsugi echo [options]
  --summary               Show substrate summary only

kintsugi remember [options]
  --kind <type>           Filter by event kind
  --actor <name>          Filter by actor
  --limit <n>             Limit results
  --learned               Show learned facts only
```

## Config Doctor

Run `config doctor` to validate your setup:

```bash
node dist/index.js config doctor
node dist/index.js config doctor --model-profile my-profile
```

Doctor checks:
- API key is set (or key file exists and is readable)
- Provider base URL is valid
- Model profile references an existing preset
- Key file permissions are safe (not world-readable)

## Resolved Config

View the fully resolved config after all sources merge:

```bash
node dist/index.js config show
```

This prints provider, model, substrate path, permissions, model config, workspace roots, and config source files.
