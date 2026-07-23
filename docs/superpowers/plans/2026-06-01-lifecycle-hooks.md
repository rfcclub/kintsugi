# Lifecycle Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a robust pre-and-post-tool lifecycle hook engine with dynamic JS/TS script loading, standard JSON IPC streams, and robust timeout/rollback fail-safes.

**Architecture:** We extend `KintsugiConfig` and `ResolvedConfig` to declare hook configurations. We create `src/runtime/hooks.ts` to manage hook resolution and child process execution via `node:child_process.spawn`. Finally, we intercept the execution flow inside `executeToolRequest` in `src/runtime/loop.ts`.

**Tech Stack:** TypeScript, Node.js (`child_process`), Vitest.

---

## 🗺️ File Changes & Structure

- Create: `src/runtime/hooks.ts` (Core hook resolver and process execution engine)
- Create: `tests/runtime/hooks.test.ts` (Complete integration and failure test suites)
- Modify: `src/config/config.ts` (Parsing and resolving YAML configuration schemas)
- Modify: `src/runtime/loop.ts` (Pre/Post hooks interception in tool execution flow)

---

### Task 1: Extend Configuration Schema & Merging Logic

**Files:**
- Modify: `src/config/config.ts`
- Modify: `tests/config.test.ts`

- [ ] **Step 1: Write failing config tests**
  Add tests inside `tests/config.test.ts` to verify `hooks` property parses and resolves default values correctly.
  
  ```typescript
  // Append to tests/config.test.ts:
  it("resolves default and custom hooks configs successfully", () => {
    const config = resolveConfig({} as any, {
      env: {},
      repoConfigPath: undefined,
      homeConfigPath: undefined,
      cwd: process.cwd()
    });
    expect(config.hooks).toBeDefined();
    expect(config.hooks.mode).toBe("strict");
    expect(config.hooks.timeoutMs).toBe(5000);
    expect(config.hooks.pre).toEqual({});
    expect(config.hooks.post).toEqual({});
    
    // Test custom override merging:
    const customConfig = resolveConfig({} as any, {
      env: {},
      repoConfigPath: undefined,
      homeConfigPath: undefined,
      cwd: process.cwd()
    });
    // Simulating custom merged object with hooks loaded from YAML:
    const mergedHooks = {
      mode: "permissive" as const,
      timeoutMs: 2000,
      pre: { edit_file: "npm run lint" },
      post: { write_file: "vitest run" }
    };
    const resolvedCustom = { ...customConfig, hooks: mergedHooks };
    expect(resolvedCustom.hooks.mode).toBe("permissive");
    expect(resolvedCustom.hooks.timeoutMs).toBe(2000);
    expect(resolvedCustom.hooks.pre).toEqual({ edit_file: "npm run lint" });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run tests/config.test.ts`
  Expected: FAIL with compilation or assertion errors (Property 'hooks' does not exist on ResolvedConfig).

- [ ] **Step 3: Implement Configuration schemas**
  Modify `src/config/config.ts` to add interfaces and default merging logic.
  
  ```typescript
  // In src/config/config.ts (around line 25, inside KintsugiConfig):
  export interface HooksConfig {
    mode?: "strict" | "permissive";
    timeoutMs?: number;
    pre?: Record<string, string>;
    post?: Record<string, string>;
  }

  // Inside KintsugiConfig interface:
  hooks?: HooksConfig;

  // Inside ResolvedConfig interface (around line 60):
  hooks: {
    mode: "strict" | "permissive";
    timeoutMs: number;
    pre: Record<string, string>;
    post: Record<string, string>;
  };

  // Inside resolveConfig return statement (around line 192):
  hooks: {
    mode: merged.hooks?.mode ?? "strict",
    timeoutMs: merged.hooks?.timeoutMs ?? 5000,
    pre: merged.hooks?.pre ?? {},
    post: merged.hooks?.post ?? {},
  },
  ```

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run tests/config.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/config/config.ts tests/config.test.ts
  git commit -m "feat(config): add hooks configuration parsing and defaults"
  ```

---

### Task 2: Build the Core Hooks Execution Engine

**Files:**
- Create: `src/runtime/hooks.ts`

- [ ] **Step 1: Write failing unit test skeleton**
  Create `tests/runtime/hooks.test.ts` with placeholder imports to make sure execution works.
  
  ```typescript
  import { describe, expect, it } from "vitest";
  import { resolveHook, runHookProcess } from "../../src/runtime/hooks.js";
  import type { KintsugiRuntime } from "../../src/runtime/session.js";

  describe("Hooks Resolution & Execution", () => {
    it("should resolve null if no hooks are configured", async () => {
      const mockRuntime = {
        config: {
          hooks: { mode: "strict" as const, timeoutMs: 5000, pre: {}, post: {} }
        }
      } as unknown as KintsugiRuntime;
      const hook = await resolveHook(mockRuntime, "pre", "edit_file");
      expect(hook).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run tests/runtime/hooks.test.ts`
  Expected: FAIL with "hooks.js not found" or compilation error.

- [ ] **Step 3: Implement Hook resolution and process spawning**
  Create `src/runtime/hooks.ts` with complete type structures, directory dynamic scanning, and spawn-based execution pipes.
  
  ```typescript
  import { spawn } from "node:child_process";
  import fs from "node:fs";
  import path from "node:path";
  import type { KintsugiRuntime } from "./session.js";

  export interface HookResolution {
    type: "config" | "script";
    commandOrPath: string;
    timeoutMs: number;
    mode: "strict" | "permissive";
  }

  export interface HookPayload {
    event: "pre" | "post";
    tool: string;
    id: string;
    arguments: Record<string, any>;
    context: {
      workspace: string;
      model: string;
      messageCount: number;
    };
    output?: string | null;
    isError?: boolean;
  }

  export interface HookResponse {
    status: "allow" | "deny";
    args?: Record<string, any>;
    output?: string;
    error?: string;
  }

  export async function resolveHook(
    runtime: KintsugiRuntime,
    event: "pre" | "post",
    toolName: string
  ): Promise<HookResolution | null> {
    const hooksConfig = runtime.config?.hooks;
    const mode = hooksConfig?.mode ?? "strict";
    const timeoutMs = hooksConfig?.timeoutMs ?? 5000;

    // 1. Resolve from YAML config
    const configuredCmd = hooksConfig?.[event]?.[toolName];
    if (configuredCmd) {
      return { type: "config", commandOrPath: configuredCmd, timeoutMs, mode };
    }

    // 2. Resolve dynamically from .kintsugi/hooks/
    const workspace = runtime.workspace ?? process.cwd();
    const hooksDir = path.join(workspace, ".kintsugi", "hooks");
    if (fs.existsSync(hooksDir)) {
      const files = fs.readdirSync(hooksDir);
      const prefix = `${event}-${toolName}.`;
      const match = files.find((f) => f.startsWith(prefix));
      if (match) {
        return {
          type: "script",
          commandOrPath: path.join(hooksDir, match),
          timeoutMs,
          mode
        };
      }
    }

    return null;
  }

  export function runHookProcess(
    hook: HookResolution,
    payload: HookPayload,
    signal?: AbortSignal
  ): Promise<HookResponse> {
    return new Promise((resolve, reject) => {
      let isSettled = false;

      // Handle abort signals directly
      if (signal?.aborted) {
        return resolve({ status: "deny", error: "Operation cancelled" });
      }

      // 1. Resolve shell command or execution engine
      let command = hook.commandOrPath;
      if (hook.type === "script" && hook.commandOrPath.endsWith(".js")) {
        command = `node ${hook.commandOrPath}`;
      } else if (hook.type === "script" && hook.commandOrPath.endsWith(".ts")) {
        command = `npx tsx ${hook.commandOrPath}`;
      }

      const child = spawn(command, [], {
        shell: true,
        cwd: payload.context.workspace || process.cwd(),
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      // 2. Write payload to stdin
      try {
        child.stdin.write(JSON.stringify(payload) + "\n");
        child.stdin.end();
      } catch (err) {
        // Safe to ignore if process closed immediately
      }

      // 3. Setup timeout handler
      const timeoutId = setTimeout(() => {
        if (isSettled) return;
        isSettled = true;
        child.kill("SIGKILL");
        
        if (hook.mode === "strict") {
          resolve({
            status: "deny",
            error: `Hook Aborted: Timeout of ${hook.timeoutMs}ms exceeded`
          });
        } else {
          resolve({ status: "allow" });
        }
      }, hook.timeoutMs);

      // Handle signal aborting during execution
      if (signal) {
        signal.addEventListener("abort", () => {
          if (isSettled) return;
          isSettled = true;
          clearTimeout(timeoutId);
          child.kill("SIGKILL");
          resolve({ status: "deny", error: "Operation cancelled" });
        });
      }

      child.on("error", (err) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeoutId);
        if (hook.mode === "strict") {
          resolve({ status: "deny", error: `Hook Spawn Failed: ${err.message}` });
        } else {
          resolve({ status: "allow" });
        }
      });

      child.on("close", (code) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeoutId);

        const cleanStdout = stdout.trim();
        if (!cleanStdout) {
          // Fallback: exit code only
          if (code === 0) {
            return resolve({ status: "allow" });
          } else {
            return resolve({
              status: "deny",
              error: stderr.trim() || `Hook process exited with code ${code}`
            });
          }
        }

        try {
          const parsed = JSON.parse(cleanStdout) as HookResponse;
          resolve({
            status: parsed.status || "allow",
            args: parsed.args,
            output: parsed.output,
            error: parsed.error
          });
        } catch (e) {
          // Failed JSON parsing -> Fallback to exit code
          if (code === 0) {
            resolve({ status: "allow" });
          } else {
            resolve({
              status: "deny",
              error: cleanStdout || stderr.trim() || `Hook process exited with code ${code}`
            });
          }
        }
      });
    });
  }
  ```

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run tests/runtime/hooks.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/runtime/hooks.ts tests/runtime/hooks.test.ts
  git commit -m "feat(runtime): build core hooks resolution and spawn-based IPC execution engine"
  ```

---

### Task 3: Integrate Pre/Post Middleware in Tool Execution Loop

**Files:**
- Modify: `src/runtime/loop.ts`

- [ ] **Step 1: Write failing Vitest loop integration test**
  Add mock loop test cases inside `tests/runtime/hooks.test.ts` confirming pre-intercepts and post-overrides.
  
  ```typescript
  // Append to tests/runtime/hooks.test.ts:
  import { bootRuntime } from "../../src/runtime/runtime.js";
  import { runTurn } from "../../src/runtime/loop.js";
  import { MockProvider } from "../../src/providers/mock.js";

  describe("Loop Hooks Integration", () => {
    it("should reject tool execution and short-circuit when a Pre-Hook fails", async () => {
      const runtime = bootRuntime({ noSubstrate: true });
      runtime.config = {
        hooks: {
          mode: "strict",
          timeoutMs: 2000,
          pre: { read_file: "node -e 'process.exit(1)'" },
          post: {}
        }
      } as any;

      const provider = new MockProvider({
        responseText: "use read",
        delayMs: 0,
        toolCall: { name: "read_file", args: { path: "README.md" } }
      });

      const events = [];
      for await (const event of runTurn(runtime, provider, "test hook rejection")) {
        events.push(event);
      }

      const completed = events.find((e) => e.type === "tool.completed");
      expect(completed).toBeDefined();
      expect((completed as any).output).toContain("Hook Aborted");
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run tests/runtime/hooks.test.ts`
  Expected: FAIL (hook rejection test case fails because loop doesn't check hooks yet).

- [ ] **Step 3: Modify loop.ts to run hooks**
  Integrate hook execution inside `executeToolRequest` in `src/runtime/loop.ts`.
  
  ```typescript
  // In src/runtime/loop.ts:
  // Add imports at top:
  import { resolveHook, runHookProcess } from "./hooks.js";
  
  // Replace executeToolRequest function (around lines 237-285):
  async function executeToolRequest(
    runtime: KintsugiRuntime,
    event: Extract<RuntimeEvent, { type: "tool.requested" }>,
    signal?: AbortSignal
  ): Promise<Extract<RuntimeEvent, { type: "tool.completed" }>> {
    const tool = runtime.toolRegistry?.lookup(event.name);
    if (!tool) {
      return { type: "tool.completed", id: event.id, output: `Unknown tool: ${event.name}` };
    }

    let toolArgs = event.args;

    // === 1. PRE-TOOL LIFECYCLE HOOKS ===
    const preHook = await resolveHook(runtime, "pre", event.name);
    if (preHook) {
      const preResult = await runHookProcess(preHook, {
        event: "pre",
        tool: event.name,
        id: event.id,
        arguments: toolArgs as Record<string, any>,
        context: {
          workspace: runtime.workspace ?? process.cwd(),
          model: runtime.modelConfig?.model ?? "unknown",
          messageCount: runtime.messageCount ?? 0,
        }
      }, signal);

      if (preResult.status === "deny") {
        return {
          type: "tool.completed",
          id: event.id,
          output: `Hook Aborted: ${preResult.error ?? "Rejected by PreToolUse hook."}`
        };
      }
      if (preResult.args) {
        toolArgs = preResult.args;
      }
    }

    let decision = runtime.sessionPermissions?.[event.name] ??
      runtime.permissionPolicy?.decide(event.name) ??
      "ask";

    if (decision === "ask") {
      decision = runtime.permissionDecider
        ? await runtime.permissionDecider(event.name, toolArgs, signal)
        : "deny";
    }

    if (signal?.aborted) {
      return { type: "tool.completed", id: event.id, output: "Permission denied" };
    }

    runtime.sessionWriter?.toolCall({
      toolCallId: event.id,
      toolName: event.name,
      args: toolArgs,
      decision,
    });

    if (decision === "deny") {
      return { type: "tool.completed", id: event.id, output: "Permission denied" };
    }

    const args = normalizeToolArgs(toolArgs, event.id);
    let result = await tool.execute(args, {
      workingDir: process.cwd(),
      workspaceRoots: runtime.workspaceRoots?.length ? runtime.workspaceRoots : [process.cwd()],
      permission: decision as PermissionDecision,
      signal,
    });

    let output = result.output;
    let isError = result.isError;

    // === 2. POST-TOOL LIFECYCLE HOOKS ===
    const postHook = await resolveHook(runtime, "post", event.name);
    if (postHook) {
      const postResult = await runHookProcess(postHook, {
        event: "post",
        tool: event.name,
        id: event.id,
        arguments: toolArgs as Record<string, any>,
        context: {
          workspace: runtime.workspace ?? process.cwd(),
          model: runtime.modelConfig?.model ?? "unknown",
          messageCount: runtime.messageCount ?? 0,
        },
        output,
        isError,
      }, signal);

      if (postResult.status === "deny") {
        isError = true;
        output = `Hook Verification Failed: ${postResult.error ?? "Rejected by PostToolUse hook."}`;
      } else if (postResult.output !== undefined) {
        output = postResult.output;
      }
    }

    return {
      type: "tool.completed",
      id: event.id,
      output: isError ? `Error: ${output}` : output,
    };
  }
  ```

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run tests/runtime/hooks.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/runtime/loop.ts tests/runtime/hooks.test.ts
  git commit -m "feat(runtime): integrate pre/post lifecycle hook runners into execution turn loop"
  ```

---

### Task 4: Complete Integration Test Suite (Timeout, Rollbacks, Fallbacks)

**Files:**
- Modify: `tests/runtime/hooks.test.ts`

- [ ] **Step 1: Write all remaining integration test cases**
  Implement timeout, argument rewrite, output rewrite, and permissive mode cases inside `tests/runtime/hooks.test.ts`.
  
  ```typescript
  // Append to tests/runtime/hooks.test.ts:
  
  describe("Advanced Hook Execution Scenarios", () => {
    it("should allow a pre-hook to dynamically rewrite tool arguments", async () => {
      const runtime = bootRuntime({ noSubstrate: true });
      runtime.config = {
        hooks: {
          mode: "strict",
          timeoutMs: 2000,
          pre: { read_file: "node -e 'console.log(JSON.stringify({ status: \"allow\", args: { path: \"package.json\", limit: 5 } }))'" },
          post: {}
        }
      } as any;

      let capturedArgs: any;
      // Inject standard registry spy or check permissionDecider parameters
      runtime.permissionDecider = async (name, args) => {
        capturedArgs = args;
        return "allow";
      };

      const provider = new MockProvider({
        responseText: "use read",
        delayMs: 0,
        toolCall: { name: "read_file", args: { path: "README.md" } }
      });

      await collect(runTurn(runtime, provider, "test rewrite"));
      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.path).toBe("package.json");
      expect(capturedArgs.limit).toBe(5);
    });

    it("should override tool results if a post-hook fails", async () => {
      const runtime = bootRuntime({ noSubstrate: true });
      runtime.config = {
        hooks: {
          mode: "strict",
          timeoutMs: 2000,
          pre: {},
          post: { read_file: "node -e 'console.log(JSON.stringify({ status: \"deny\", error: \"PostHook aborted!\" }))'" }
        }
      } as any;

      const provider = new MockProvider({
        responseText: "use read",
        delayMs: 0,
        toolCall: { name: "read_file", args: { path: "README.md" } }
      });

      const events = await collect(runTurn(runtime, provider, "test post hook"));
      const completed = events.find((e) => e.type === "tool.completed");
      expect(completed).toBeDefined();
      expect((completed as any).output).toContain("Hook Verification Failed: PostHook aborted!");
    });

    it("should enforce timeouts and terminate slow scripts", async () => {
      const runtime = bootRuntime({ noSubstrate: true });
      runtime.config = {
        hooks: {
          mode: "strict",
          timeoutMs: 100, // Very tight timeout for fast testing
          pre: { read_file: "node -e 'setTimeout(() => {}, 10000)'" },
          post: {}
        }
      } as any;

      const provider = new MockProvider({
        responseText: "use read",
        delayMs: 0,
        toolCall: { name: "read_file", args: { path: "README.md" } }
      });

      const events = await collect(runTurn(runtime, provider, "test timeout"));
      const completed = events.find((e) => e.type === "tool.completed");
      expect(completed).toBeDefined();
      expect((completed as any).output).toContain("Timeout of 100ms exceeded");
    });
  });

  async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const items: T[] = [];
    for await (const item of iterable) {
      items.push(item);
    }
    return items;
  }
  ```

- [ ] **Step 2: Run all tests to verify they pass**
  Run: `npx vitest run tests/runtime/hooks.test.ts`
  Expected: PASS

- [ ] **Step 3: Run the full Kintsugi test suite to guarantee zero regression**
  Run: `npm test` or `npx vitest run`
  Expected: All 350+ tests PASS cleanly!

- [ ] **Step 4: Commit and finalize**
  ```bash
  git add tests/runtime/hooks.test.ts
  git commit -m "test(hooks): implement robust vitest suite validating timeout, argument rewriting, and outputs"
  ```
