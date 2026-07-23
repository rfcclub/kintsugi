# Changelog

All notable changes to Kintsugi are documented here.

## 1.0.0 — Initial Public Release

### Runtime

- Ink-based TUI with colorful, workshop-style terminal interface
- Turn loop with max 20 tool-continuation depth and repeated-tool-call detection
- Prompt assembly: base instructions, substrate (Echo), project context, session state
- AbortSignal plumbing through providers, tools, and permission prompts
- `turn.cancelled` event with reason codes (`stop`, `esc`, `ctrl-c`, `permission`, `abort`)

### CLI Commands

- `tui` — interactive terminal session
- `ask "prompt"` — one-shot query
- `threads` — list and resume past sessions
- `echo` — inspect loaded substrate
- `config init|show|doctor` — configuration management
- `boot` — display boot/runtime info
- `remember` — query memory events and learned facts

### Providers

- `mock` — deterministic provider for testing
- `openai-chat` — OpenAI Chat Completions API (`function` tools, `tool_calls`)
- `openai-responses` — OpenAI Responses API (`function_call`, `function_call_output`)
- `anthropic-messages` — Anthropic Messages API (`tool_use`, `tool_result`)
- Provider presets with `adapter`, `baseUrl`, `keyFile`, `defaultModel`
- Model profiles with capabilities, config overrides, and preset references
- `config doctor --model-profile` for offline provider validation
- Live provider smoke test matrix (opt-in via `KINTSUGI_LIVE_SMOKE=1`)

### Tools

- `read_file` — read file contents with path safety
- `list_files` — list directory contents
- `grep` — regex search across workspace
- `glob` — file pattern matching
- `write_file` — create or overwrite files
- `edit_file` — targeted find-and-replace edits
- `bash` — shell command execution

### Permission System

- Configurable per-tool: `allow`, `deny`, `ask`
- Session-scoped `/always` for temporary tool approval
- Default: read-only tools allowed, mutating tools require prompt
- Workspace root boundary enforcement for file tools

### Sessions and Memory

- JSONL event store at `~/.kintsugi/sessions/`
- Session index with start/end metadata, message counts, token usage
- Transcript export to Markdown
- Memory ops log with event kinds (echo, tool, session, learned)
- Learned key-value facts store
- Memory reconstruction from ops log
- Minor memory for runtime-private state

### TUI

- 14 slash commands: `/help`, `/exit`, `/stop`, `/new`, `/resume`, `/threads`, `/model`, `/config`, `/doctor`, `/memory`, `/remember`, `/approve`, `/deny`, `/always`
- `//text` escape for literal `/text` prompts
- Model profile picker overlay
- Config and doctor overlays
- Memory/remember overlay
- Threads overlay for session browsing
- Context-sensitive `Esc` priority stack
- Composer with slash-command suggestions

### Substrate

- Optional Markdown context source from `~/.config/kintsugi/substrate`
- `--substrate <path>` to override, `--no-substrate` to disable
- Echo summary mode via `echo --summary`

### Config

- YAML config at `~/.config/kintsugi/config.yaml` or `.kintsugi/config.yaml`
- `KINTSUGI_*` environment variables for all settings
- CLI flags override config file and env vars
- Provider presets and model profiles for multi-provider setups
- Key file support for API keys (never committed)

### Testing and Verification

- 215 tests with Vitest
- Statement coverage 83.89%, branch coverage 74.63%
- `npm run lint` (TypeScript type checking)
- `npm run coverage` (v8 coverage report)
- `npm run test:providers` — provider conformance suite
- `npm run test:kintsugi` — integration smoke test
- `npx openspec validate --all --strict` — spec validation
- 12 archived OpenSpec phases with full design/proposal/spec/tasks
