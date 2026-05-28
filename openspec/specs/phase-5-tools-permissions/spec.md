# phase-5-tools-permissions Specification

## Purpose
TBD - created by archiving change phase-5-tools-permissions. Update Purpose after archive.
## Requirements
### Requirement: Tool interface SHALL define spec, execution, and result

Each tool SHALL implement a `Tool` interface with a JSON-schema `ToolSpec`, an async `execute()` method, and a typed `ToolResult`. Tools SHALL NOT import Ink or provider code.

#### Scenario: Tool spec is valid JSON Schema
- **WHEN** a developer registers a tool
- **THEN** its `spec.parameters` conforms to JSON Schema object type

#### Scenario: Tool result carries output and error flag
- **WHEN** a tool executes
- **THEN** it returns `{ toolCallId, output, isError }`

### Requirement: ToolRegistry SHALL register and look up tools

`ToolRegistry` SHALL accept `register()`, `lookup()`, `allSpecs()`, and `canSatisfy()`.

#### Scenario: Lookup finds registered tool
- **WHEN** `registry.lookup("read_file")` is called after registration
- **THEN** it returns the `read_file` tool

#### Scenario: Lookup returns undefined for unknown tool
- **WHEN** `registry.lookup("nonexistent")` is called
- **THEN** it returns `undefined`

#### Scenario: allSpecs returns specs for provider
- **WHEN** `registry.allSpecs()` is called
- **THEN** it returns an array of `ToolSpec` suitable for `ProviderTurnRequest.tools`

### Requirement: Read-only tools SHALL operate within workspace roots

`read_file`, `list_files`, and `grep` SHALL validate that target paths are inside `workspaceRoots`. Paths outside roots SHALL return `isError: true`.

#### Scenario: Read file inside roots
- **WHEN** `read_file` is called with a path inside workspace roots
- **THEN** it returns file content with `isError: false`

#### Scenario: Read file outside roots
- **WHEN** `read_file` is called with a path outside workspace roots
- **THEN** it returns an error message with `isError: true`

### Requirement: Mutating tools SHALL require permission approval

`write_file`, `edit_file`, and `bash` SHALL default to `ask` permission. They SHALL NOT execute without user approval in TUI mode.

#### Scenario: Write file with permission denied
- **WHEN** permission policy denies `write_file`
- **THEN** tool result has `isError: true` and output "Permission denied"

#### Scenario: Bash always requires approval
- **WHEN** `bash` tool is called under default policy
- **THEN** the permission decision is `ask`

### Requirement: PermissionPolicy SHALL resolve tool decisions

`PermissionPolicy` SHALL check explicit rules, then wildcard, then default. Default decision SHALL be `ask`.

#### Scenario: Explicit rule overrides default
- **WHEN** policy has `{ tool: "read_file", decision: "allow" }`
- **THEN** `policy.decide("read_file")` returns `"allow"`

#### Scenario: No rule falls to default
- **WHEN** no explicit or wildcard rule matches a tool name
- **THEN** `policy.decide(toolName)` returns `"ask"`

### Requirement: TUI SHALL show permission prompt for ask-decision tools

When a tool requires `ask` permission in TUI, the UI SHALL show the tool name and arguments and offer allow/deny/always choices.

#### Scenario: User allows once
- **WHEN** user selects "y" on the permission prompt
- **THEN** the tool executes once and the next call still prompts

#### Scenario: User selects always
- **WHEN** user selects "always" on the permission prompt
- **THEN** the tool executes and future calls of the same tool are auto-allowed for the session

---

