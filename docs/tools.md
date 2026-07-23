# Tools Guide

Kintsugi tools give the LLM access to the local filesystem and shell. Tools execute through a permission policy that determines whether each call is allowed, denied, or requires user approval.

## Built-in Tools

### read_file

Read the contents of a file. Allowed by default.

```json
{
  "name": "read_file",
  "parameters": {
    "path": "string — file path to read"
  }
}
```

### list_files

List files in a directory. Allowed by default.

```json
{
  "name": "list_files",
  "parameters": {
    "path": "string — directory path"
  }
}
```

### grep

Search file contents with regex. Allowed by default.

```json
{
  "name": "grep",
  "parameters": {
    "pattern": "string — regex pattern",
    "path": "string — directory to search (optional)",
    "include": "string — file glob filter (optional)"
  }
}
```

### glob

Find files matching a pattern. Allowed by default.

```json
{
  "name": "glob",
  "parameters": {
    "pattern": "string — glob pattern",
    "path": "string — base directory (optional)"
  }
}
```

### write_file

Create or overwrite a file. Requires approval by default.

```json
{
  "name": "write_file",
  "parameters": {
    "path": "string — file path",
    "content": "string — file content"
  }
}
```

### edit_file

Find-and-replace edit in a file. Requires approval by default.

```json
{
  "name": "edit_file",
  "parameters": {
    "path": "string — file path",
    "old_string": "string — text to find",
    "new_string": "string — replacement text"
  }
}
```

### bash

Execute a shell command. Requires approval by default.

```json
{
  "name": "bash",
  "parameters": {
    "command": "string — shell command to run"
  }
}
```

## Permission Model

Each tool has a permission decision:

| Decision | Behavior |
|----------|----------|
| `allow` | Execute immediately without asking |
| `ask` | Prompt the user for approval before executing |
| `deny` | Refuse to execute |

Default permissions:

```yaml
permissions:
  read_file: allow
  list_files: allow
  grep: allow
  write_file: ask
  edit_file: ask
  bash: ask
```

### TUI Permission Commands

When a tool request is pending approval:

- `/approve` — approve this single call
- `/deny` — deny this single call
- `/always` — approve this tool for the remainder of the session

`/always` is session-scoped. It does not permanently change config.

### Wildcard Rules

Use `*` as a tool name to set a default for tools without explicit rules:

```yaml
permissions:
  "*": deny
  read_file: allow
  bash: ask
```

## Tool Context

Every tool receives a `ToolContext`:

```typescript
interface ToolContext {
  workingDir: string;       // current working directory
  workspaceRoots: string[]; // allowed filesystem roots
  permission: PermissionDecision;
  signal?: AbortSignal;     // for cooperative cancellation
}
```

### Workspace Roots

File tools (`read_file`, `write_file`, `edit_file`, `list_files`, `grep`, `glob`) enforce workspace root boundaries. Paths outside all workspace roots are rejected.

Workspace roots come from:
1. `workspaceRoots` array in config
2. The `workspace` config field (defaults to cwd)

### Cancellation

When a `/stop` or `Esc` cancels a turn, the `AbortSignal` in `ToolContext` fires. Long-running tools (especially `bash`) should check this signal and terminate promptly.

## Extending Tools

To add a new tool:

1. Create `src/tools/my-tool.ts`
2. Implement the `Tool` interface from `src/tools/tool.ts`
3. Register in `src/tools/builtins.ts`
4. Add a default permission rule in `src/runtime/permissions.ts`
5. Write tests

```typescript
import type { Tool, ToolSpec, ToolResult, ToolContext } from "./tool.js";

export const myToolSpec: ToolSpec = {
  name: "my_tool",
  description: "Does something useful",
  parameters: {
    type: "object",
    properties: {
      input: { type: "string", description: "The input" },
    },
    required: ["input"],
  },
};

export function createMyTool(): Tool {
  return {
    spec: myToolSpec,
    async execute(args, context: ToolContext): Promise<ToolResult> {
      // implementation
      return { toolCallId: "", output: "result", isError: false };
    },
  };
}
```
