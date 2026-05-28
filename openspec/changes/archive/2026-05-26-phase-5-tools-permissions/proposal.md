# Proposal: Phase 5 — Tools and Permissions

## Motivation

Phases 2–4 give kintsugi a streaming provider pipeline. But without tools, Kintsugi can only talk — she can't read files, search code, or edit anything. Before adding broad shell execution, kintsugi needs a tool interface, a registry, and a permission model. This is the safety gate: tools without permissions are a loaded gun.

## Non-Goals

- No MCP (Model Context Protocol) integration yet — future phase.
- No sandboxed container execution (subprocess isolation only).
- No tool result rendering beyond plain text in transcript.
- No tool approval UX beyond inline TUI prompts.

## Proposed Approach

1. Define `ToolSpec` (schema), `ToolResult` (output), and `Tool` (interface).
2. Create a `ToolRegistry` for registering and looking up tools.
3. Implement read-only tools first: `read_file`, `list_files`, `grep`.
4. Add a `PermissionPolicy` that classifies tools into `allow`, `deny`, and `ask` categories.
5. In TUI, `ask`-category tools prompt the user before execution.
6. Implement mutating tools after read-only tools are verified: `write_file`, `edit_file`, `bash`.
7. `bash` gets the strictest permission: always `ask` unless explicitly `allow`ed in config.
8. Working directory boundary: tools cannot operate outside approved workspace roots.

## Affected Capabilities

- Kintsugi can read, search, and edit files within approved roots
- Permission decisions are explicit and visible
- `bash` execution requires per-call approval by default
- Tool calls appear in transcript with results

---

*Proposal: Kintsugi — 2026-05-20*
