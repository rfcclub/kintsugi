# Contributing to Kintsugi

## Development Setup

```bash
git clone git@github.com:rfcclub/kintsugi.git
cd kintsugi
npm install
npm run build
npm test
```

Requirements: Node.js 18+, npm.

## Project Structure

```
src/
  cli/            argv parsing and command normalization
  config/         YAML/env/CLI config resolution and doctor
  memory/         JSONL memory event stores and reconstruction
  protocol/       runtime event and message types
  providers/      mock and real provider adapters
  runtime/        prompt assembly, turn loop, permissions, session state
  store/          sessions, replay, index, export
  substrate/      optional Markdown substrate (Echo) loader
  tools/          built-in tool registry and implementations
  ui/             Ink views, components, and slash commands
tests/            test files mirroring src/ structure
openspec/         archived phase specs (design, proposal, tasks)
docs/             additional documentation
```

## Architecture Overview

Kintsugi separates UI, runtime, protocol, providers, tools, and persistence.

**Runtime flow**: argv -> cli/args -> runtime boot -> load Echo -> load config -> create session -> choose provider -> UI command

**One turn**: user input -> slash dispatch -> prompt assembly -> provider.stream() -> runtime events -> tool requests -> permission checks -> tool execution -> provider continuation -> final message -> session store

Provider adapters never touch Ink. They receive prompt/messages/tools and emit typed `RuntimeEvent` values. The UI renders events. Runtime owns semantics.

## Key Interfaces

### Provider

```typescript
interface Provider {
  readonly id: string;
  streamTurn(request: ProviderTurnRequest): AsyncIterable<RuntimeEvent>;
}
```

### Tool

```typescript
interface Tool {
  readonly spec: ToolSpec;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
```

### RuntimeEvent

```typescript
type RuntimeEvent =
  | { type: "turn.started"; id: string }
  | { type: "assistant.delta"; text: string }
  | { type: "assistant.completed"; text: string }
  | { type: "thinking.delta"; text: string }
  | { type: "thinking.completed"; text: string }
  | { type: "tool.requested"; id: string; name: string; args: unknown }
  | { type: "tool.completed"; id: string; output: string }
  | { type: "turn.cancelled"; reason: string }
  | { type: "turn.failed"; message: string }
  | { type: "turn.truncated"; reason: string }
  | { type: "turn.completed"; usage?: TokenUsage };
```

## Verification

Run all checks before submitting a PR:

```bash
npm run lint          # TypeScript type checking
npm test              # 215+ tests
npm run coverage      # v8 coverage report
npm run test:providers # provider conformance
npx openspec validate --all --strict
```

Live provider tests are opt-in and require API keys:

```bash
KINTSUGI_LIVE_SMOKE=1 KINTSUGI_LIVE_PROFILES=profile-name npm run test:providers
```

## Coding Conventions

- TypeScript strict mode
- No Codex SDK or external runtime dependencies
- Provider adapters stay isolated from Ink/UI
- Tools implement the `Tool` interface from `src/tools/tool.ts`
- New providers implement the `Provider` interface from `src/providers/provider.ts`
- Permission policy lives in `src/runtime/permissions.ts`
- Tests use Vitest with `mock` provider — no network calls in unit tests
- Keep API keys in env vars or key files, never in committed config

## OpenSpec Process

Kintsugi uses OpenSpec for structured feature development:

1. Write a `proposal.md` with the problem statement and proposed approach
2. Write a `design.md` with technical details and module changes
3. Write a `spec.md` with acceptance criteria
4. Write a `tasks.md` with implementation checklist
5. Archive completed phases under `openspec/changes/archive/`

## Adding a New Provider

1. Implement the `Provider` interface in `src/providers/<name>.ts`
2. Add the provider type to `ProviderType` in `src/providers/config.ts`
3. Register it in `src/providers/registry.ts`
4. Add wire-format conformance tests in `tests/provider-conformance.test.ts`
5. Add a built-in preset if appropriate in `src/config/config.ts`
6. Document in `docs/providers.md`

## Adding a New Tool

1. Implement the `Tool` interface in `src/tools/<name>.ts`
2. Register in `src/tools/builtins.ts`
3. Add a default permission rule in `src/runtime/permissions.ts`
4. Write tests in `tests/`
5. Document in `docs/tools.md`
