# Tech Stack

Kintsugi is a TypeScript CLI/TUI runtime built around clear boundaries between
UI, runtime state, provider adapters, tools, permissions, and persistence.

## Core

| Layer | Choice | Reason |
| --- | --- | --- |
| Runtime | Node.js 18+ | Portable CLI runtime |
| Language | TypeScript | Typed contracts between modules |
| TUI | Ink + React | Composable terminal UI |
| Tests | Vitest | Fast local unit and integration tests |
| Config | YAML | Human-editable provider/runtime config |

## Project Structure

```text
src/
  cli/          argv parsing
  config/       YAML/env/CLI config resolution and doctor
  memory/       JSONL memory event stores and reconstruction
  protocol/     runtime event/message types
  providers/    mock and real provider adapters
  runtime/      prompt assembly, turn loop, permissions, session state
  store/        sessions, replay, index, export
  substrate/    optional Markdown substrate loader
  tools/        built-in tool registry and implementations
  ui/           Ink views, components, and slash commands
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
