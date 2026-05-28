# Design: Phase 5 — Tools and Permissions

## Tool Interface

```ts
// src/tools/tool.ts

export interface ToolSpec {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, PropertySpec>;
    required?: string[];
  };
}

export interface PropertySpec {
  type: string;
  description: string;
  enum?: string[];
}

export interface ToolResult {
  toolCallId: string;
  output: string;
  isError: boolean;
}

export interface ToolContext {
  workingDir: string;
  workspaceRoots: string[];
  permission: PermissionDecision;
}

export interface Tool {
  readonly spec: ToolSpec;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
```

## Tool Registry

```ts
// src/tools/registry.ts

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.spec.name, tool);
  }

  lookup(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  allSpecs(): ToolSpec[] {
    return [...this.tools.values()].map(t => t.spec);
  }

  canSatisfy(toolCalls: Array<{ name: string }>): { satisfied: string[]; missing: string[] } {
    const satisfied: string[] = [];
    const missing: string[] = [];
    for (const call of toolCalls) {
      (this.tools.has(call.name) ? satisfied : missing).push(call.name);
    }
    return { satisfied, missing };
  }
}
```

## Built-in Tools

### Read-Only Tools (Phase 5a)

#### `read_file`

```ts
spec: {
  name: "read_file",
  description: "Read the contents of a file",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to read" },
      offset: { type: "number", description: "Line offset (1-based)" },
      limit: { type: "number", description: "Max lines to read" },
    },
    required: ["path"],
  },
}
```

- Validates path is inside `workspaceRoots`.
- Returns file content (or truncated if `limit` set).
- Returns `isError: true` if file not found or outside roots.

All file tools use a shared `resolveAndValidate(path, workspaceRoots)` helper. The helper resolves relative paths, normalizes `..`, resolves symlinks with `realpath` when the path exists, and verifies the final path remains inside an allowed workspace root. Symlink escape is denied.

#### `list_files`

```ts
spec: {
  name: "list_files",
  description: "List files in a directory",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path" },
      pattern: { type: "string", description: "Glob pattern (default: **/*)" },
    },
    required: ["path"],
  },
}
```

- Validates path is inside `workspaceRoots`.
- Returns newline-separated file list.

#### `grep`

```ts
spec: {
  name: "grep",
  description: "Search file contents for a pattern",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex or string pattern" },
      path: { type: "string", description: "Directory or file to search" },
      include: { type: "string", description: "File glob filter (e.g. *.ts)" },
    },
    required: ["pattern", "path"],
  },
}
```

- Uses Node.js `child_process` to run `grep` or `rg`.
- Validates path is inside `workspaceRoots`.

### Mutating Tools (Phase 5b)

#### `write_file`

- Creates or overwrites a file.
- Permission: `ask` by default.
- Validates path is inside `workspaceRoots`.

#### `edit_file`

- Applies a search/replace patch to a file.
- Permission: `ask` by default.
- Validates path is inside `workspaceRoots`.
- Requires `oldText` and `newText` parameters.
- Fails if `oldText` appears more than once; never silently edits the first match.

#### `bash`

- Runs a shell command with timeout.
- Permission: `ask` always (cannot be auto-allowed without explicit config).
- Working directory: `context.workingDir`.
- Timeout: 30s default, configurable.
- Output truncated at 10 KB.
- Truncation appends `[output truncated at 10 KB]`.

## Permission Model

```ts
// src/runtime/permissions.ts

export type PermissionDecision = "allow" | "deny" | "ask";

export interface PermissionRule {
  tool: string;          // tool name or "*" for all
  decision: PermissionDecision;
}

export interface PermissionConfig {
  rules: PermissionRule[];
  defaultDecision: PermissionDecision;  // default: "ask"
}

export class PermissionPolicy {
  constructor(private config: PermissionConfig) {}

  decide(toolName: string): PermissionDecision {
    // Check explicit rules first (most specific wins)
    const explicit = this.config.rules.find(r => r.tool === toolName);
    if (explicit) return explicit.decision;

    // Check wildcard
    const wildcard = this.config.rules.find(r => r.tool === "*");
    if (wildcard) return wildcard.decision;

    return this.config.defaultDecision;
  }
}
```

### Default Policy

```json
{
  "rules": [
    { "tool": "read_file", "decision": "allow" },
    { "tool": "list_files", "decision": "allow" },
    { "tool": "grep", "decision": "allow" },
    { "tool": "write_file", "decision": "ask" },
    { "tool": "edit_file", "decision": "ask" },
    { "tool": "bash", "decision": "ask" }
  ],
  "defaultDecision": "ask"
}
```

Unknown tools are denied before policy prompting. `defaultDecision: "ask"` applies only to registered tools without an explicit rule.

### TUI Permission Prompt

When `decide(toolName) === "ask"`, the TUI shows an inline prompt:

```text
kintsugi wants to run: write_file(path="src/hello.ts")
Allow? [y/n/always]
```

- `y` — allow once
- `n` — deny this call (returns `isError: true` to provider)
- `always` — add rule `{ tool: name, decision: "allow" }` to session policy

### Session Policy Memory

Session-scoped "always" decisions are stored in runtime state (not persisted until Phase 6). On next boot, the default policy is restored.

## Turn Loop Integration

Updated `runTurn()` in Phase 5:

```ts
// When provider emits tool.requested:
if (event.type === "tool.requested") {
  const tool = registry.lookup(event.name);
  if (!tool) {
    yield { type: "tool.completed", id: event.id, output: `Unknown tool: ${event.name}` };
    continue;
  }

  const decision = policy.decide(event.name);
  if (decision === "deny") {
    yield { type: "tool.completed", id: event.id, output: "Permission denied" };
    continue;
  }
  if (decision === "ask") {
    // TUI shows prompt, resolves to allow/deny
    const userDecision = await askPermission(event.name, event.args);
    if (userDecision !== "allow") {
      yield { type: "tool.completed", id: event.id, output: "Permission denied by user" };
      continue;
    }
  }

  const result = await tool.execute(event.args, toolContext);
  yield { type: "tool.completed", id: result.toolCallId, output: result.output };
}
```

## File Map (new files)

```text
src/
  tools/
    tool.ts              # ToolSpec, ToolResult, Tool, ToolContext
    registry.ts          # ToolRegistry
    read.ts              # read_file
    list-files.ts        # list_files
    grep.ts              # grep
    write.ts             # write_file
    edit.ts              # edit_file
    bash.ts              # bash
  runtime/
    permissions.ts       # PermissionPolicy, PermissionConfig, PermissionDecision
```

## Verification

- Unit: each tool executes with valid args and returns correct output.
- Unit: path validation rejects paths outside workspace roots.
- Unit: permission policy resolves correctly (allow/deny/ask).
- Integration: TUI shows permission prompt for `write_file`.
- Integration: `bash` requires per-call approval.
- Integration: read-only tools work without prompts under default policy.
