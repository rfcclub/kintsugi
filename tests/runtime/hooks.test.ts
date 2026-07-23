import { describe, expect, it, afterAll, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveHook, runHookProcess } from "../../src/runtime/hooks.js";
import type { KintsugiRuntime, HookPayload, HookResolution } from "../../src/runtime/hooks.js";
import { bootRuntime } from "../../src/runtime/runtime.js";
import { runTurn } from "../../src/runtime/loop.js";
import { MockProvider } from "../../src/providers/mock.js";

describe("Hooks Resolution & Execution", () => {
  const tempDir = path.join(process.cwd(), "tests", "runtime", "temp-hooks-workspace");

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should resolve null if no hooks are configured", async () => {
    const mockRuntime = {
      config: {
        hooks: { mode: "strict" as const, timeoutMs: 5000, pre: {}, post: {} }
      }
    } as unknown as KintsugiRuntime;
    const hook = await resolveHook(mockRuntime, "pre", "edit_file");
    expect(hook).toBeNull();
  });

  it("should resolve from config", async () => {
    const mockRuntime = {
      config: {
        hooks: {
          mode: "strict" as const,
          timeoutMs: 3000,
          pre: {
            edit_file: "echo 'pre-edit'"
          },
          post: {}
        }
      }
    } as unknown as KintsugiRuntime;
    const hook = await resolveHook(mockRuntime, "pre", "edit_file");
    expect(hook).toEqual({
      type: "config",
      commandOrPath: "echo 'pre-edit'",
      timeoutMs: 3000,
      mode: "strict"
    });
  });

  it("should resolve dynamically from .kintsugi/hooks/", async () => {
    const hooksDir = path.join(tempDir, ".kintsugi", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    const hookScriptPath = path.join(hooksDir, "pre-run_command.js");
    fs.writeFileSync(hookScriptPath, "console.log('hello');");

    const mockRuntime = {
      workspace: tempDir,
      config: {
        hooks: {
          mode: "permissive" as const,
          timeoutMs: 4000,
          pre: {},
          post: {}
        }
      }
    } as unknown as KintsugiRuntime;

    const hook = await resolveHook(mockRuntime, "pre", "run_command");
    expect(hook).toEqual({
      type: "script",
      commandOrPath: hookScriptPath,
      timeoutMs: 4000,
      mode: "permissive"
    });
  });

  it("should execute hook and allow if exit code is 0", async () => {
    const hook: HookResolution = {
      type: "config",
      commandOrPath: "node -e 'process.exit(0)'",
      timeoutMs: 2000,
      mode: "strict"
    };

    const payload: HookPayload = {
      event: "pre",
      tool: "some_tool",
      id: "123",
      arguments: {},
      context: {
        workspace: process.cwd(),
        model: "test-model",
        messageCount: 1
      }
    };

    const res = await runHookProcess(hook, payload);
    expect(res).toEqual({ status: "allow" });
  });

  it("should deny hook if exit code is non-zero", async () => {
    const hook: HookResolution = {
      type: "config",
      commandOrPath: "node -e 'console.error(\"failed execution\"); process.exit(1)'",
      timeoutMs: 2000,
      mode: "strict"
    };

    const payload: HookPayload = {
      event: "pre",
      tool: "some_tool",
      id: "123",
      arguments: {},
      context: {
        workspace: process.cwd(),
        model: "test-model",
        messageCount: 1
      }
    };

    const res = await runHookProcess(hook, payload);
    expect(res.status).toBe("deny");
    expect(res.error).toContain("failed execution");
  });

  it("should parse JSON output from stdout", async () => {
    const hook: HookResolution = {
      type: "config",
      commandOrPath: "node -e 'console.log(JSON.stringify({ status: \"deny\", error: \"Policy violation\", args: { foo: 42 } }))'",
      timeoutMs: 2000,
      mode: "strict"
    };

    const payload: HookPayload = {
      event: "pre",
      tool: "some_tool",
      id: "123",
      arguments: {},
      context: {
        workspace: process.cwd(),
        model: "test-model",
        messageCount: 1
      }
    };

    const res = await runHookProcess(hook, payload);
    expect(res).toEqual({
      status: "deny",
      error: "Policy violation",
      args: { foo: 42 },
      output: undefined
    });
  });

  it("should handle timeout in strict mode", async () => {
    const hook: HookResolution = {
      type: "config",
      commandOrPath: "node -e 'setTimeout(() => {}, 10000)'",
      timeoutMs: 200,
      mode: "strict"
    };

    const payload: HookPayload = {
      event: "pre",
      tool: "some_tool",
      id: "123",
      arguments: {},
      context: {
        workspace: process.cwd(),
        model: "test-model",
        messageCount: 1
      }
    };

    const res = await runHookProcess(hook, payload);
    expect(res.status).toBe("deny");
    expect(res.error).toContain("Timeout of 200ms exceeded");
  });

  it("should handle timeout in permissive mode", async () => {
    const hook: HookResolution = {
      type: "config",
      commandOrPath: "node -e 'setTimeout(() => {}, 10000)'",
      timeoutMs: 200,
      mode: "permissive"
    };

    const payload: HookPayload = {
      event: "pre",
      tool: "some_tool",
      id: "123",
      arguments: {},
      context: {
        workspace: process.cwd(),
        model: "test-model",
        messageCount: 1
      }
    };

    const res = await runHookProcess(hook, payload);
    expect(res.status).toBe("allow");
  });

  it("should abort execution if signal is already aborted", async () => {
    const hook: HookResolution = {
      type: "config",
      commandOrPath: "echo 'should not run'",
      timeoutMs: 2000,
      mode: "strict"
    };

    const payload: HookPayload = {
      event: "pre",
      tool: "some_tool",
      id: "123",
      arguments: {},
      context: {
        workspace: process.cwd(),
        model: "test-model",
        messageCount: 1
      }
    };

    const controller = new AbortController();
    controller.abort();

    const res = await runHookProcess(hook, payload, controller.signal);
    expect(res).toEqual({
      status: "deny",
      error: "Operation cancelled"
    });
  });

  it("should cancel execution when signal is aborted during execution", async () => {
    const hook: HookResolution = {
      type: "config",
      commandOrPath: "node -e 'setTimeout(() => {}, 5000)'",
      timeoutMs: 2000,
      mode: "strict"
    };

    const payload: HookPayload = {
      event: "pre",
      tool: "some_tool",
      id: "123",
      arguments: {},
      context: {
        workspace: process.cwd(),
        model: "test-model",
        messageCount: 1
      }
    };

    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 100);

    const res = await runHookProcess(hook, payload, controller.signal);
    expect(res).toEqual({
      status: "deny",
      error: "Operation cancelled"
    });
  });
});

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
    runtime.permissionPolicy = { decide: () => "ask" } as any;
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

  it("should enforce timeouts in loop and terminate slow scripts", async () => {
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
