# mcp-client-integration Specification

## Purpose
Define the Model Context Protocol (MCP) client capabilities of Kintsugi, including dynamic server configuration, handshake, tool listing/registration, and stdio execution proxying.

## Requirements

### Requirement: MCP configuration SHALL resolve valid stdio server configurations

Kintsugi SHALL parse config from `.kintsugi/mcp.json` or config yaml files, starting server subprocesses correctly.

#### Scenario: Parse valid stdio configuration
- **WHEN** config contains a server definition with executable and args
- **THEN** Kintsugi successfully spawns a child process for the server
- **AND** registers event listeners for stdout, stderr, and close

### Requirement: Dynamic MCP tool registration SHALL expose schemas to LLM

Kintsugi SHALL query all active MCP servers for their available tools and merge them with static tools.

#### Scenario: Expose dynamic tool schemas
- **WHEN** MCP servers respond to `tools/list` request
- **THEN** Kintsugi converts tool schemas to LLM function definitions
- **AND** inserts them into the tool registry for LLM turn preparation

### Requirement: Execution loop SHALL route MCP tool calls to the correct server

Kintsugi execution loop SHALL intercept MCP tools and proxy them via JSON-RPC 2.0 stdio protocols.

#### Scenario: Dispatch tool call to server
- **WHEN** LLM invokes an MCP tool
- **THEN** Kintsugi intercepts the execution before running static tools
- **AND** sends `tools/call` JSON-RPC request to the target server subprocess stdin
- **AND** returns the result stdout or stderr block back to the execution loop

## Traceability

| Scenario | Test File |
|----------|-----------|
| Parse valid stdio configuration | `tests/mcp-client.test.ts` |
| Expose dynamic tool schemas | `tests/mcp-client.test.ts` |
| Dispatch tool call to server | `tests/mcp-client.test.ts` |

