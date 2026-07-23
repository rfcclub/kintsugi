# Kintsugi — TODO (Next Session)

Generated: 2026-07-14

## Priority 1: TUI Mockup + Visual Design

- [x] Create `docs/superpowers/tui-mockup.html` — interactive HTML mockup showing the TUI layout
  - [x] Three mode variants: approve, auto, plan
  - [x] Show ToolCallCard, MessageBubble, StatusBar, Composer, permission prompt
  - [x] Use JetBrains Mono, dark theme (#0a0a0f), kintsugi brand colors
  - [x] Reference: `docs/superpowers/tui-polish-design.md`
- [x] Iterate TUI components toward Codex/ClaudeCode/Gemini CLI polish level
  - [x] Markdown rendering in terminal (bold, italic, code blocks, lists)
  - [x] Thinking/reasoning display as dimmed italic
  - [x] Smooth streaming with blinking cursor
  - [x] Permission prompt as highlighted card with key hints
  - [x] Error cards with red border

## Priority 2: Model Configuration

- [x] Define `KINTSUGI_PROVIDER` env var support clearly (documented and tested via env vars config resolves)
- [x] Support custom provider base URLs (e.g. `https://crof.ai/v1`) via config (built preset resolver & test case)
- [x] Document how to configure non-OpenAI/non-Claude providers (updated docs/providers.md with crof.ai profile)
- [x] Test with `crof.ai/v1` endpoint (preset resolution test added to unit tests)

## Priority 3: Test Coverage

- [x] Run `vitest run --coverage` and identify gaps
- [x] Add unit tests for `parseMessageLine()` (MessageBubble)
- [x] Add unit tests for `formatArgs()` and `truncate()` (ToolCallCard)
- [x] Add unit tests for `clampTimeout()` (bash)
- [x] Add unit tests for `countMatches()` (edit)
- [x] Add unit tests for `fenceText()`, `escapeFence()`, `titleCase()`, `formatDate()` (export)
- [x] Add unit tests for `toolCallIdFrom()`, `stringArg()`, `optionalStringArg()`, `optionalNumberArg()`, `ok()`, `fail()`, `requireAllowed()`, `truncateOutput()` (utils)
- [x] Add export tests for thinking lines, cancelled events, tool errors, missing provider, no end line
- [x] Fix bug: `isSessionLine()` in replay.ts didn't handle `thinking` type lines
- [x] Overall: **77.06% statements** (+1.18%), **70.16% branches** (crossed 70%), **80.79% functions** (crossed 80%)
- [ ] Target: >80% line coverage on core modules (needs UI component tests)

## Priority 5: Polish + Extras

- [x] Export session to markdown (`/export` command) — tests cover basic flow, thinking lines, cancelled events, tool errors ✅
- [x] Resume session (`--resume`) — verify replay works (tests exist)
- [x] Config doctor (`kintsugi config doctor`) — verify diagnostics (tests exist)
- [ ] Thinking/reasoning summary event export from providers — still needed

## In Progress (Next Session)

1. **UI Component tests** (ink render tests for MessageBubble, StatusBar, ToolCallCard, Picker, Composer)
2. **UI Views tests** (AskView, CommandOverlay, EchoView, ThreadsView, TuiView)
3. **Thinking/reasoning summary event export** — wire provider thinking events into session export
4. **Tools branch coverage** — git.ts (33.33%), invoke-subagent.ts (50%), send-message.ts (50%), path.ts (75%)
5. **Keypress parser tests** (currently 74.5%)
6. **Cancel priority tests** (currently not visible in coverage)

## Already Done (for reference & achievements)

- [x] 71 test files, 662 tests passing (all green)
- [x] Lint passes cleanly (tsc --noEmit)
- [x] Interaction modes (auto, approve, plan) with Shift+Tab
- [x] TUI v2: ToolCallCard, MessageBubble, StatusBar, Frame, Composer
- [x] Alternate screen for TUI
- [x] Slash commands: /model, /mode, /session, /config, /export, /help, /cancel
- [x] New tools: glob, grep, edit_file, mkdir, move_file, delete_file, stat_file, apply_patch, git tools
- [x] MCP Client integration (McpClient, tools/list, tools/call)
- [x] Subagents parallelism (SubagentManager, message passing, permissions)
- [x] Resumable session time-travel & branching
- [x] Terminal setup keyboard bindings and SIGWINCH resize
- [x] Lifecycle hooks (PreToolUse / PostToolUse)
- [x] Documentation suite (8 docs)
- [x] Provider conformance presets
- [x] Spec-good-flow coverage tests

## Provider Registration Wizard (2026-07-15)

Implemented the `provider-registration-wizard` OpenSpec change end-to-end:

- [x] `src/providers/scanner.ts` — `testConnection()` + `scanModels()` (fetch + 5s timeout, OpenAI-compatible `/models` parsing)
- [x] `src/providers/cache.ts` — `readCache`/`writeCache`/`getModels`/`listCachedProviders`/`clearProviderCache` for `~/.config/kintsugi/model-cache.json`
- [x] `src/config/config.ts` — `addProviderToConfig`, `setProviderDefaultModel`, `listRegisteredProviders`, `isProviderRegistered` (API keys persisted to `~/.config/kintsugi/keys/{name}.key`, mode 0600; secrets never in config.yaml; backup before write)
- [x] `src/ui/components/ProviderWizard.tsx` — 5-step Ink wizard (name → url → key → test/scan → confirm) with exportable validation helpers
- [x] `/provider` (status overlay) + `/provider add` (wizard) slash command wiring in `TuiView.tsx`
- [x] `/model list` (cache display) + `/model use <id>` (in-memory model switch) in `TuiView.tsx`
- [x] Tests: 67 new tests (scanner 16, cache 14, config-writer 17, wizard helpers 22) — **729 passing, 2 skipped**, lint clean
- [x] `.gitignore` updated for `model-cache.json` + `*.key` + `keys/`; `.traceability.yaml` written

### Follow-ups (deferred)

- [ ] **Picker dynamic extension** — surface registered custom presets in the boot-time `Picker` (currently hardcodes 4 adapter types) + "Add new provider…" entry → opens wizard
- [ ] **Registry explicit hook** for custom provider creation (custom presets already resolve via `resolveModelSelection`/`providerPresets`)
- [ ] **`/model use` config persistence** for the active preset (currently in-memory only; `setProviderDefaultModel` exists for explicit calls)
- [ ] **OAuth flow** (placeholder in wizard today)
- [ ] **Live scanner smoke tests** against Groq / Together AI / Ollama (unit-tested with mocked fetch)

- [x] OpenSpec phases archived