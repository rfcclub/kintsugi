## Architecture

The MCP client integration relies on running external servers as child processes and communicating with them over `stdio` (stdin/stdout) via JSON-RPC 2.0.
When Kintsugi starts, it reads configured servers, spawns their processes, performs a handshake (`initialize`), registers their tools in Kintsugi's tool registry, and listens for command calls.

## Components

- **McpClient**: Represents a connection to a single MCP server. Spawns the child process and handles serialization/deserialization of JSON-RPC payloads.
- **McpManager**: Orchestrates multiple `McpClient`s, coordinates startup tool discovery, and handles process termination cleanup.
- **McpToolRegistry**: Translates MCP tool schemas to Kintsugi-compatible schemas and proxies invocations to the respective `McpClient`.

## Data Model

```typescript
interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}
```

## Test Strategy

| Scenario ID | Test File | Type |
|-------------|-----------|------|
| Parse valid stdio configuration | `tests/mcp-client.test.ts` | unit |
| Expose dynamic tool schemas | `tests/mcp-client.test.ts` | integration |
| Dispatch tool call to server | `tests/mcp-client.test.ts` | integration |

## Dependencies

- Node.js native `child_process` module for spawning processes.
- Node.js native `readline` module for parsing line-delimited JSON-RPC messages from stdout.

## Migration

No migrations needed. Backward compatible with all existing configurations.
