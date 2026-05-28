# Full CLI Commands For Coding Agent

This is the longer roadmap for turning Kintsugi into a capable coding-agent CLI. `MINIMAL_CLI_COMMANDS.md` stays the near-term contract; this file tracks the broader surface that should exist before Kintsugi feels complete.

## Principles

- Slash commands are TUI controls, not prompts.
- Dangerous actions require visible permission state.
- Stop means stop: cancellation must reach providers, tools, and child processes.
- Commands should preserve Kintsugi surface language, not copy another CLI wholesale.
- Tool additions should prefer structured, path-safe operations over broad shell dependence.

## Core TUI Commands

- `/help` — show command help with availability states.
- `/exit` — close the TUI cleanly.
- `/stop` — cancel active provider/tool work.
- `/clear` — clear visible transcript without deleting session history.
- `/status` — show runtime status: session id, provider, model, Echo, tools, permissions, memory.
- `/version` — show Kintsugi version/build info.

## Session And Thread Commands

- `/new` — start a fresh session.
- `/resume <id>` — resume or continue from a prior session.
- `/threads` — list recent sessions.
- `/thread <id>` — inspect a session summary.
- `/export <id>` — export transcript as markdown.
- `/rename <title>` — set a human-readable session title.
- `/summarize` — summarize current session for later continuation.

## Model Commands

- `/model` — open model/profile picker.
- `/model <profile>` — switch to configured profile.
- `/provider` — show provider status and configured models.
- `/models` — list known local config profiles and provider defaults.
- `/reasoning <low|medium|high>` — adjust reasoning effort when supported.
- `/temperature <number>` — adjust temperature for future turns.

## Permission Commands

- `/approve` — approve pending tool once.
- `/deny` — deny pending tool.
- `/always` — allow pending tool for this session only.
- `/permissions` — show current permission policy and session overrides.
- `/revoke <tool>` — remove session-level allow for a tool.
- `/trust <path>` — add a workspace root or trusted path after confirmation.

## Config Commands

- `/config` — show resolved config.
- `/config edit` — open/edit config through a safe workflow.
- `/doctor` — run config doctor.
- `/init` — initialize missing config/templates when appropriate.
- `/reload` — reload config without restarting TUI.

## Memory Commands

- `/memory` — open memory browser.
- `/remember` — alias for `/memory`.
- `/learn <key> <value>` — write a learned fact after confirmation.
- `/forget <key>` — remove or tombstone a learned fact.
- `/minor` — inspect runtime-private minor memory.
- `/echo` — show Echo load status and summary.
- `/echo reload` — reload Echo substrate.

## Workspace Commands

- `/pwd` — show active working directory.
- `/cd <path>` — change working directory inside allowed roots.
- `/roots` — list workspace roots.
- `/add-root <path>` — add a workspace root after confirmation.
- `/tree [path]` — show compact file tree.
- `/open <path>` — preview a file in an overlay.
- `/search <pattern>` — run project search.

## Git Commands

- `/git status` — show concise git status.
- `/git diff [path]` — show working diff.
- `/git diff --cached` — show staged diff.
- `/git add <path>` — stage selected file(s) with confirmation.
- `/git commit` — guided commit flow.
- `/git log` — recent commits.
- `/git branch` — current branch and tracking state.

## Build And Test Commands

- `/build` — run configured build command.
- `/test` — run configured test command.
- `/lint` — run configured lint command.
- `/check` — run configured verification suite.
- `/last` — show last command/test result.
- `/retry` — rerun last verification command.

## Toolbelt Needed Beyond Current MVP

Current tools:

- `read_file`
- `list_files`
- `grep`
- `write_file`
- `edit_file`
- `bash`

Missing or weak tools:

- `apply_patch` — patch-oriented edits for multi-hunk code changes.
- `mkdir` — create directories without shell.
- `move_file` — rename/move paths safely.
- `delete_file` — delete files with confirmation and strong permission rules.
- `stat_file` — inspect size/type/mtime.
- `git_status` — structured git status.
- `git_diff` — structured diff read.
- `run_command` or improved `bash` — cancellable, workspace-rooted, timeout-safe process execution.
- `diagnostics` — run configured build/test/lint and parse failures.
- `read_session` — inspect persisted session data.
- `write_memory` — structured learned/minor memory writes.

## Runtime Capabilities Needed

- AbortSignal through providers, tools, permission prompts, and child processes.
- `turn.cancelled` event and session export/replay support.
- Workspace roots from config, not only `process.cwd()`.
- Tool context includes cwd, roots, signal, session id, and maybe env policy.
- Provider creation applies provider settings plus model profile `modelConfig`.
- Slash parser supports `//literal` prompt escape.
- Overlay manager for help/model/config/memory/threads/permission.
- Command availability state: available, disabled, danger, running-only, permission-only.

## Verification Gate For "Full Enough"

Kintsugi is not "full coding CLI" until these pass:

- `/stop` cancels streaming providers and running `bash`.
- Esc follows priority stack without accidental exit.
- `/approve`, `/deny`, `/always` share resolver with permission UI.
- `apply_patch` can perform common code edits safely.
- Workspace roots protect all file tools.
- Build/test/lint commands are configurable and visible.
- Session export/replay handles tool calls, thinking, cancellation, and resumed turns.
- Model profiles actually recreate provider config.
- Memory commands write/query the intended store without corrupting shared memory.
