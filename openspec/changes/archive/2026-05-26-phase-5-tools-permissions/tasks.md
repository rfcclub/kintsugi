# Tasks: Phase 5 — Tools and Permissions

## Tool Interface

- [x] T1: Create `src/tools/tool.ts` — `ToolSpec`, `ToolResult`, `Tool`, `ToolContext`
- [x] T2: Create `src/tools/registry.ts` — `ToolRegistry` with register, lookup, allSpecs, canSatisfy

## Read-Only Tools

- [x] T3: Create `src/tools/path.ts` — shared `resolveAndValidate()` with symlink escape protection
- [x] T4: Create `src/tools/read.ts` — `read_file` with shared path validation, offset, limit
- [x] T5: Create `src/tools/list-files.ts` — `list_files` with shared path validation and glob
- [x] T5a: Create `src/tools/grep.ts` — `grep` with shared path validation and pattern filter

## Permission Model

- [x] T6: Create `src/runtime/permissions.ts` — `PermissionPolicy`, `PermissionConfig`, `PermissionDecision`
- [x] T7: Default policy: read tools = allow, write/edit/bash = ask

## Mutating Tools

- [x] T8: Create `src/tools/write.ts` — `write_file` with permission check and path validation
- [x] T9: Create `src/tools/edit.ts` — `edit_file` with oldText/newText search-replace; fail if `oldText` matches multiple locations
- [x] T10: Create `src/tools/bash.ts` — `bash` with timeout, output truncation, always-ask

## Turn Loop Integration

- [x] T11: Update `src/runtime/loop.ts` — handle `tool.requested` events via registry + policy
- [x] T12: Unknown tool → deny without permission prompt, then `tool.completed` with error output
- [x] T13: Denied tool → `tool.completed` with "Permission denied"

## TUI Permission Prompt

- [x] T14: Add permission prompt component in `TuiView` — show tool name + args, offer y/n/always
- [x] T15: Session-scoped "always" decisions stored in runtime state

## Tests

- [x] T16: Create `tests/tools-registry.test.ts` — register, lookup, allSpecs, canSatisfy
- [x] T17: Create `tests/tool-read.test.ts` — read inside/outside roots, offset, limit
- [x] T18: Create `tests/tool-write.test.ts` — write with permission, path validation
- [x] T19: Create `tests/permissions.test.ts` — policy resolution, default, wildcard, explicit

## Verification

- [x] T20: `npm run build` succeeds
- [x] T21: `npm test` passes
- [x] T22: Smoke: `kintsugi ask "read src/cli/args.ts" --provider openai-chat` triggers read_file tool
- [x] T23: Smoke: TUI shows permission prompt for write operations
