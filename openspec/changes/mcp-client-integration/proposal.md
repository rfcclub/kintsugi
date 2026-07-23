## Why

To allow Kintsugi to instantly integrate with external systems (such as databases, APIs, version control systems) by behaving as a Model Context Protocol (MCP) client. This separates the tools lifecycle from the core CLI implementation, enabling dynamic tool discovery.

## What Changes

- Add MCP client architecture supporting `stdio` transport.
- Enable automatic discovery of MCP tools via a `.kintsugi/mcp.json` or config block.
- Dynamically register MCP tools in the `Kintsugi` tool execution registry.
- **BREAKING**: None.

## Capabilities

### New Capabilities
- `mcp-client-integration`: Provides capability to load external MCP servers, discover their tools, dynamic schemas, and route tool execution calls.

### Modified Capabilities
None.

## Impact

- `src/tools/registry.ts` will accept dynamic tool definitions.
- `src/runtime/loop.ts` execution loop will intercept and proxy MCP tool requests.
- Add dependencies for managing child process lifecycles.
