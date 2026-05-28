# Design: Phase 1 — Runtime Boundaries

Architecture source of truth: `docs/architecture.md`.

## Target Module Map

```text
src/
  index.tsx                  # thin entrypoint (updated imports)
  cli/
    args.ts                  # argv parsing (moved from lib/args.ts)
  protocol/
    events.ts                # RuntimeEvent type union (new)
    messages.ts              # RuntimeMessage type (new)
  runtime/
    runtime.ts               # KintsugiRuntime lifecycle (moved from lib/runtime.ts)
    session.ts               # session state types (extracted)
  substrate/
    echo.ts                  # Echo loader (moved from lib/substrate.ts)
  ui/
    App.tsx                  # root Ink view (delegates to views)
    views/
      HelpView.tsx
      EchoView.tsx
      AskView.tsx
      ThreadsView.tsx
      TuiView.tsx
    components/
      Frame.tsx
      Composer.tsx
tests/
  runtime.test.ts            # updated imports
  substrate.test.ts          # updated imports
  protocol.test.ts           # new: RuntimeEvent shape tests
```

## File Moves

| From | To | Notes |
|------|----|-------|
| `src/lib/args.ts` | `src/cli/args.ts` | Pure move, no logic change |
| `src/lib/substrate.ts` | `src/substrate/echo.ts` | Pure move, rename exports if needed |
| `src/lib/runtime.ts` | `src/runtime/runtime.ts` | Move + extract `RuntimeMessage` to `session.ts` |
| `src/lib/runtime.ts` (types) | `src/runtime/session.ts` | `RuntimeMessage`, `KintsugiRuntime` session shape |
| `src/ui/App.tsx` (inline views) | `src/ui/views/*.tsx` | Extract each view into own file |
| `src/ui/App.tsx` (Frame) | `src/ui/components/Frame.tsx` | Extract reusable component |
| `src/ui/App.tsx` (TuiView input) | `src/ui/components/Composer.tsx` | Extract input component |

## New Protocol Types

### `protocol/events.ts`

```ts
export type RuntimeEvent =
  | { type: "turn.started"; id: string }
  | { type: "assistant.delta"; text: string }
  | { type: "assistant.completed"; text: string }
  | { type: "tool.requested"; id: string; name: string; args: unknown }
  | { type: "tool.completed"; id: string; output: string }
  | { type: "turn.failed"; message: string }
  | { type: "turn.completed"; usage?: TokenUsage };

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}
```

### `protocol/messages.ts`

```ts
export interface RuntimeMessage {
  role: "user" | "assistant" | "runtime" | "tool";
  text: string;
  at: string;
}
```

## Extraction Rules

1. **Views** are Ink components that render data from runtime via props. They never call substrate or provider APIs directly.
2. **Components** are reusable Ink pieces (Frame, Composer) that views compose.
3. **App.tsx** becomes a thin router: parse command, boot runtime, delegate to the matching view.
4. **Runtime** imports substrate and protocol types. UI imports runtime and protocol types.
5. **No circular imports**: `ui/` → `runtime/` → `substrate/`. Never `runtime/` → `ui/`.

## Verification

- `npm run build` succeeds after refactor.
- `npm test` passes with updated imports.
- `node dist/index.js help`, `tui`, `ask hello`, `echo --print` behave identically to before.
- New `protocol.test.ts` validates `RuntimeEvent` discriminated-union shape.

## Non-Goals

- No provider interface yet (Phase 2).
- No prompt assembly yet (Phase 3).
- No permission model yet (Phase 5).
- No session persistence yet (Phase 6).
