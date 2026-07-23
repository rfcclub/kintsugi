import { describe, expect, it, afterAll, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveHook, runHookProcess } from "../../src/runtime/hooks.js";
import type { KintsugiRuntime, HookPayload, HookResolution } from "../../src/runtime/hooks.js";

describe("Hooks: Coverage Gaps", () => {
  const tempDir = path.join(process.cwd(), "tests", "runtime", "temp-hooks-coverage");

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

  // Covers lines 85-87: script type with .ts extension
  it("should resolve .ts script from .kintsugi/hooks/", async () => {
    const hooksDir = path.join(tempDir, ".kintsugi", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    const hookScriptPath = path.join(hooksDir, "pre-run_command.ts");
    fs.writeFileSync(hookScriptPath, "// ts hook");

    const mockRuntime = {
      workspace: tempDir,
      config: {
        hooks: {
          mode: "strict" as const,
          timeoutMs: 4000,
          pre: {},
          post: {}
        }
      }
    } as unknown as KintsugiRuntime;

    const hook = await resolveHook(mockRuntime, "pre", "run_command");
    expect(hook).not.toBeNull();
    expect(hook!.type).toBe("script");
    expect(hook!.commandOrPath).toBe(hookScriptPath);
  });

  // Covers shell error path: nonexistent command with shell:true goes to close handler (exit 127) not error handler.
  // The close handler with non-zero exit + stderr → deny in strict mode
  it("should deny with stderr when shell command not found (strict mode)", async () => {
    const hook: HookResolution = {
      type: "config",
      commandOrPath: "/nonexistent/command/that/does/not/exist",
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
    // Shell reports "No such file or directory" — handled by close handler, not error handler
    expect(res.error).toBeTruthy();
  });

  // Covers shell error path in permissive mode: nonzero exit + stderr → deny (permissive only applies to timeout/spawn-error)
  it("should deny when shell command not found (permissive mode still denies on nonzero exit)", async () => {
    const hook: HookResolution = {
      type: "config",
      commandOrPath: "/nonexistent/command/that/does/not/exist",
      timeoutMs: 2000,
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
    // Permissive only allows on timeout/spawn-error, not on nonzero exit
    expect(res.status).toBe("deny");
  });

  // Covers lines 180-183: non-JSON stdout with exit code 0
  it("should allow when stdout is non-JSON but exit code is 0", async () => {
    const hook: HookResolution = {
      type: "config",
      commandOrPath: "node -e 'console.log(\"not json at all\")'",
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
    expect(res.status).toBe("allow");
  });

  // Covers lines 180-183: non-JSON stdout with exit code 1 (error fallback)
  it("should deny with stdout content when JSON parse fails and exit code is non-zero", async () => {
    const hook: HookResolution = {
      type: "config",
      commandOrPath: "node -e 'console.log(\"some error output\"); process.exit(1)'",
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
    expect(res.error).toContain("some error output");
  });

  // Covers .js script execution path (lines 84-85)
  it("should execute .js script from .kintsugi/hooks/ with node prefix", async () => {
    const hooksDir = path.join(tempDir, ".kintsugi", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    const jsHookPath = path.join(hooksDir, "post-run_command.js");
    fs.writeFileSync(jsHookPath, 'console.log(JSON.stringify({ status: "allow" }));');

    const mockRuntime = {
      workspace: tempDir,
      config: {
        hooks: {
          mode: "strict" as const,
          timeoutMs: 4000,
          pre: {},
          post: {}
        }
      }
    } as unknown as KintsugiRuntime;

    const hook = await resolveHook(mockRuntime, "post", "run_command");
    expect(hook).not.toBeNull();
    expect(hook!.type).toBe("script");
    expect(hook!.commandOrPath).toBe(jsHookPath);

    // Verify execution works with the node prefix
    const payload: HookPayload = {
      event: "post",
      tool: "run_command",
      id: "456",
      arguments: {},
      context: {
        workspace: tempDir,
        model: "test-model",
        messageCount: 1
      }
    };

    const res = await runHookProcess(hook!, payload);
    expect(res.status).toBe("allow");
  });
});
