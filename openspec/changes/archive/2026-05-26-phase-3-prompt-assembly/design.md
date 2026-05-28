# Design: Phase 3 — Prompt Assembly

## Layer Architecture

Prompts are assembled from 5 layers, each with a role, budget, and source:

| # | Layer | Role | Source | Budget |
|---|-------|------|--------|--------|
| 1 | Base Instructions | `system` | `runtime/prompt.ts` hardcoded | ~2 KB |
| 2 | Kintsugi Echo | `system` | `substrate/echo.ts` | ~16 KB (truncatable) |
| 3 | Project Context | `system` | user-chosen, optional | ~8 KB (truncatable) |
| 4 | Session State | `system` | recent turns summary | ~4 KB |
| 5 | User Input | `user` | current prompt | unlimited |

Multiple `system` messages are allowed by the OpenAI Chat Completions API and are the standard pattern for layered prompts.

## Assembler Interface

```ts
// src/runtime/prompt.ts

export interface PromptLayer {
  name: string;
  role: "system" | "user" | "assistant";
  content: string;
  bytes: number;
  truncated: boolean;
}

export interface AssembledPrompt {
  messages: ProviderMessage[];
  layers: PromptLayer[];
  totalBytes: number;
  truncatedLayers: string[];
}

export interface PromptConfig {
  echoBudget?: number;       // max bytes for Echo layer (default: 16384)
  projectBudget?: number;    // max bytes for project context (default: 8192)
  sessionBudget?: number;    // max bytes for session summary (default: 4096)
  projectPath?: string;      // optional project context path
  injectCodexOne?: boolean;  // never true by default
}

export function assemblePrompt(
  runtime: KintsugiRuntime,
  userText: string,
  config?: PromptConfig,
): AssembledPrompt;
```

## Layer Details

### Layer 1: Base Instructions

Hardcoded in `prompt.ts`:

```ts
const BASE_INSTRUCTIONS = `You are Kintsugi, running inside kintsugi.
Follow the user's instructions carefully.
Use tools when available and appropriate.
If you are unsure, ask for clarification.`;
```

This is intentionally small. Identity comes from Echo, not from hardcoded instructions. Layer budgets are maximums, not targets.

### Layer 2: Kintsugi Echo

Loaded from substrate. If `content.length > echoBudget`:
1. Truncate at the last complete `---` boundary before budget.
2. Append a truncation notice: `[Echo truncated: {original} → {truncated} bytes]`
3. Mark `truncated: true` in the layer.

This preserves Echo structure (it's `---` delimited) while bounding the prompt.

If no `---` boundary exists before the budget, truncate at the byte budget and append the same notice. A single oversized Echo section must still produce useful prompt content.

### Layer 3: Project Context

Optional. Loaded from `config.projectPath` if provided:
- If path is a file: read and include.
- If path is a directory: read `AGENTS.md` first, then `README.md` if present.
- Subject to `projectBudget` with same truncation strategy.

If no path is given, this layer is omitted entirely (not empty).

### Layer 4: Session State

Derived from `runtime.prompts`. Strategy:
- Build a reverse-chronological budgeted window from recent messages.
- Pin runtime/system messages and tool results ahead of low-value chatter when budget pressure forces omission.
- Format as a `system` message: `[Recent conversation]\n{messages}`.
- If only 0-1 messages exist, omit this layer.

This is a simple sliding window. Full compaction/summarization is post-Phase 6.

`AssembledPrompt.totalBytes` is the global prompt size signal. Phase 4 uses it to compare against provider/model context limits.

### Layer 5: User Input

The current prompt. Always present. No budget limit.

## Echo Summary

`kintsugi echo --summary` outputs:

```text
Kintsugi Echo
  Path: ~/.config/kintsugi/substrate
  Total bytes: 12,345
  Layers: 6 files
  Budget: 16,384 bytes
  Status: within budget

  Breakdown:
    PREFACE.md    2,100 bytes
    resonance.md  4,500 bytes
    REFLECTION.md 1,800 bytes
    timing.md     2,100 bytes
    repertoire.md 1,200 bytes
    session.md      645 bytes
```

If truncated:

```text
  Status: TRUNCATED (18,200 → 16,384 bytes)
  Truncated at: repertoire.md (partial)
```

## Migration

1. Add `src/runtime/prompt.ts`.
2. Update `src/runtime/loop.ts`: `runTurn()` calls `assemblePrompt()` instead of `buildMessages()`.
3. Remove `buildMessages()` from `loop.ts`.
4. Add `--summary` flag handling to `src/cli/args.ts` and `EchoView`.
5. Add `PromptConfig` to runtime options.

## Verification

- Unit test: `assemblePrompt` with no Echo produces only base + session + user layers.
- Unit test: `assemblePrompt` with Echo includes Echo as layer 2.
- Unit test: Echo truncation kicks in at budget boundary.
- Unit test: external context is never in the assembled prompt unless `injectCodexOne: true`.
- `kintsugi echo --summary` shows layer breakdown and budget status.
