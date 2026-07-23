# Implementation Plan: mcp-client-integration

## Preparation

- [ ] Review spec scenarios for mcp-client-integration
- [ ] Review design.md test strategy

## Tasks

### Task 1: Establish McpClient child process manager and JSON-RPC transport

**Files:**
- Create: `src/protocol/mcp.ts`
- Test: `tests/mcp-client.test.ts`

- [ ] **Step 1: Write the failing test**
  Verify configuration loads, spawns child process, and responds to standard JSON-RPC 2.0 messages.
- [ ] **Step 2: Write minimal implementation**
  Implement McpClient class utilizing child_process.spawn.
- [ ] **Step 3: Commit**

### Task 2: Implement tools listing and dynamic registration

**Files:**
- Modify: `src/tools/registry.ts`
- Test: `tests/mcp-client.test.ts`

- [ ] **Step 1: Write the failing test**
  Verify `tools/list` returns schema details and Kintsugi converts them to LLM definitions.
- [ ] **Step 2: Write minimal implementation**
  Add dynamic registration hook in Registry.
- [ ] **Step 3: Commit**

### Task 3: Hook tool execution in loop to proxy MCP actions

**Files:**
- Modify: `src/runtime/loop.ts`
- Test: `tests/mcp-client.test.ts`

- [ ] **Step 1: Write the failing test**
  Verify executing an MCP-registered tool intercepts and dispatches message via stdin, capturing response.
- [ ] **Step 2: Write minimal implementation**
  Extend runtime executeToolRequest method.
- [ ] **Step 3: Commit**

## Verification

- [ ] All scenarios passing (coverage = 100%)
- [ ] `.traceability.yaml` updated
