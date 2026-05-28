# Proposal: Phase 1 — Runtime Boundaries

## Motivation

Current kintsugi prototype has 5 flat files under `src/`. All views, runtime logic, substrate loading, and arg parsing are lumped together. Before adding provider streaming (Phase 2), prompt assembly (Phase 3), or tools (Phase 5), the code must be split into the module boundaries defined in `docs/architecture.md`.

Without this refactor, every future feature will cross-cut the flat structure and make separation harder to achieve.

## Non-Goals

- No new runtime features (no provider, no streaming, no tools).
- No behavior changes to existing commands (`tui`, `ask`, `threads`, `echo`).
- No UI redesign — only structural extraction.

## Proposed Approach

1. Create module folders: `src/cli/`, `src/protocol/`, `src/runtime/`, `src/substrate/`.
2. Move `src/lib/args.ts` → `src/cli/args.ts`.
3. Move `src/lib/substrate.ts` → `src/substrate/echo.ts`.
4. Move `src/lib/runtime.ts` → `src/runtime/runtime.ts`, `src/runtime/session.ts`.
5. Add `src/protocol/events.ts` with `RuntimeEvent` type union.
6. Add `src/protocol/messages.ts` with `RuntimeMessage` type.
7. Split `src/ui/App.tsx` into `ui/views/` (Ask, Tui, Threads, Echo, Help) and `ui/components/` (Frame, Transcript, Composer, StatusLine).
8. Update all imports in `index.tsx` and test files.
9. Verify build + existing tests pass.

## Affected Capabilities

- `kintsugi tui` — same behavior, new file layout
- `kintsugi ask "prompt"` — same behavior, new file layout
- `kintsugi threads` — same behavior
- `kintsugi echo --print` — same behavior

---

*Proposal: Kintsugi — 2026-05-20*
