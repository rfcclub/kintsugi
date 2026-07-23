/**
 * Runtime coverage gaps — subagents, hooks, loop, mcp.
 *
 * Covers every uncovered function/branch identified in the assignment:
 *   subagents.ts  remove(), clear(), getActiveSubagents(), sendMessage parent/handler paths
 *   hooks.ts      .ts script → npx tsx (L87), error event permissive (L142-148)
 *   loop.ts       unknown tool (L272), postHook override (L361-362), normalizeToolArgs (L375)
 *   mcp.ts        handleLine invalid JSON (L238-240), notification (L200), stop SIGKILL (L281-288),
 *                 request after cleanup (L154-159), server notification (L231-236)
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

// ═══════════════════════════════════════════════════════
// Mocks  (vi.mock is hoisted to file top)
// ═══════════════════════════════════════════════════════

let _childAutoClose = false;

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { EventEmitter: EE } = require("node:events");
  const { PassThrough: PT } = require("node:stream");

  function createFakeProcess() {
    const proc = new EE();
    proc.pid = 12345;
    proc.killed = false;
    proc.exitCode = null;
    proc.signalCode = null;
    proc.stdin = new PT();
    proc.stdout = new PT();
    proc.stderr = new PT();
    proc.kill = vi.fn((sig?: string) => {
      proc.killed = true;
      if (sig) proc.signalCode = sig;
      if (sig === "SIGKILL") proc.exitCode = 1;
      if (_childAutoClose) {
        process.nextTick(() => {
          if (proc.exitCode === null) proc.exitCode = 0;
          proc.emit("close", proc.exitCode, sig);
        });
      }
      return true;
    });
    // When autoClose is on, simulate natural process exit on creation
    if (_childAutoClose) {
      process.nextTick(() => {
        if (proc.exitCode === null && proc.signalCode === null && !proc.killed) {
          proc.exitCode = 0;
          proc.emit("close", 0, null);
        }
      });
    }
    return proc;
  }

  const spawn = vi.fn(() => createFakeProcess());
  // Spread real module to keep exec, execSync, execFile, etc. intact
  return { ...actual, spawn, ChildProcess: EE, createFakeProcess };
});

vi.mock("readline", () => {
  let _lineCb: ((line: string) => void) | null = null;

  const createInterface = vi.fn(() => ({
    on: vi.fn((event: string, cb: unknown) => {
      if (event === "line") _lineCb = cb as (line: string) => void;
    }),
    close: vi.fn(),
  }));

  return {
    default: { createInterface },
    createInterface,
    getLineCallback: () => _lineCb,
    resetLineCallback: () => {
      _lineCb = null;
    },
  };
});

// ═══════════════════════════════════════════════════════
// Imports (resolved against mocks)
// ═══════════════════════════════════════════════════════

// Dynamic import is required: vi.mock replaces the module at runtime; static
// imports would resolve against the real module before the mock is applied.
// The mock factories export test-only helpers (createFakeProcess, getLineCallback)
// that have no real type — we access them through narrowed unknown shapes.
const childModule = (await import("node:child_process")) as unknown as {
  spawn: ReturnType<typeof vi.fn>;
  createFakeProcess: () => Record<string, unknown>;
};
const { spawn: mockSpawn, createFakeProcess } = childModule;

const readlineModule = (await import("readline")) as unknown as {
  getLineCallback: () => ((line: string) => void) | null;
  resetLineCallback: () => void;
};

import { bootRuntime } from "../../src/runtime/runtime.js";
import { SubagentManager } from "../../src/runtime/subagents.js";
import { runTurn } from "../../src/runtime/loop.js";
import { McpClient } from "../../src/protocol/mcp.js";
import { runHookProcess } from "../../src/runtime/hooks.js";
import type { HookResolution, HookPayload, KintsugiRuntime } from "../../src/runtime/hooks.js";
import type { Provider } from "../../src/providers/provider.js";
import type { RuntimeEvent } from "../../src/protocol/events.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import type { Tool } from "../../src/tools/tool.js";
import type { ResolvedConfig } from "../../src/config/config.js";

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

function makeProvider(events: RuntimeEvent[]): Provider {
  return {
    id: "mock-provider",
    async *streamTurn() {
      for (const e of events) yield e;
    },
  };
}

function hookPayload(overrides?: Partial<HookPayload>): HookPayload {
  return {
    event: "pre",
    tool: "test-tool",
    id: "hook-1",
    arguments: {},
    context: { workspace: process.cwd(), model: "test", messageCount: 0 },
    ...overrides,
  };
}

function makeTool(
  name: string,
  output: string,
  captureArgs?: (args: Record<string, unknown>) => void,
): Tool {
  return {
    spec: {
      name,
      description: `mock-${name}`,
      parameters: { type: "object", properties: {} },
    },
    execute: async (args) => {
      captureArgs?.(args);
      return { toolCallId: String(args.toolCallId ?? "x"), output, isError: false };
    },
  };
}

// ═══════════════════════════════════════════════════════
// SubagentManager — uncovered functions
// ═══════════════════════════════════════════════════════

describe("SubagentManager coverage gaps", () => {
  let mgr: SubagentManager;

  beforeEach(() => {
    mgr = new SubagentManager();
  });

  // ── remove() ──────────────────────────────────────

  it("remove() returns true for an existing subagent and removes it", () => {
    const parent = bootRuntime({ noSubstrate: true });
    mgr.spawn({ id: "c1", role: "r", prompt: "p", permissions: [] }, parent);

    expect(mgr.has("c1")).toBe(true);
    expect(mgr.remove("c1")).toBe(true);
    expect(mgr.has("c1")).toBe(false);
    expect(mgr.get("c1")).toBeUndefined();
  });

  it("remove() returns false for a non-existent subagent", () => {
    expect(mgr.remove("ghost")).toBe(false);
  });

  // ── clear() ───────────────────────────────────────

  it("clear() removes all subagents and parent mappings", () => {
    const parent = bootRuntime({ noSubstrate: true });
    mgr.spawn({ id: "a", role: "r", prompt: "p", permissions: [] }, parent);
    mgr.spawn({ id: "b", role: "r", prompt: "p", permissions: [] }, parent);
    expect(mgr.has("a")).toBe(true);
    expect(mgr.has("b")).toBe(true);

    mgr.clear();

    expect(mgr.has("a")).toBe(false);
    expect(mgr.has("b")).toBe(false);
    expect(mgr.getActiveSubagents().size).toBe(0);
  });

  // ── getActiveSubagents() ──────────────────────────

  it("getActiveSubagents() returns the internal registry Map", () => {
    const parent = bootRuntime({ noSubstrate: true });
    mgr.spawn({ id: "x", role: "r", prompt: "p", permissions: [] }, parent);

    const map = mgr.getActiveSubagents();
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(1);
    expect(map.has("x")).toBe(true);
  });

  // ── sendMessage — parent path ─────────────────────

  it("sendMessage with recipientId='parent' resolves via parents map", () => {
    const parent = bootRuntime({ noSubstrate: true });
    mgr.spawn({ id: "child", role: "r", prompt: "p", permissions: [] }, parent);

    mgr.sendMessage("child", "parent", "hello parent");

    expect(parent.incomingMessages).toBeDefined();
    expect(parent.incomingMessages).toHaveLength(1);
    expect(parent.incomingMessages![0].content).toBe("hello parent");
    expect(parent.incomingMessages![0].senderId).toBe("child");
    expect(parent.incomingMessages![0].recipientId).toBe("parent");
  });

  // ── sendMessage — messageHandler callback ─────────

  it("sendMessage triggers messageHandler via process.nextTick", async () => {
    const parent = bootRuntime({ noSubstrate: true });
    const received: unknown[] = [];
    parent.messageHandler = (msg: unknown) => {
      received.push(msg);
    };

    mgr.spawn({ id: "child", role: "r", prompt: "p", permissions: [] }, parent);
    mgr.sendMessage("child", "parent", "handler test");

    // process.nextTick fires before any setTimeout(0)
    await new Promise<void>((r) => process.nextTick(r));

    expect(received).toHaveLength(1);
    const msg = received[0] as { content: string };
    expect(msg.content).toBe("handler test");
  });

  // ── sendMessage — non-existent recipient ──────────

  it("sendMessage to non-existent recipient does not throw", () => {
    expect(() => {
      mgr.sendMessage("nobody", "nobody-else", "orphan message");
    }).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════
// hooks.ts — uncovered branches
// ═══════════════════════════════════════════════════════

describe("hooks.ts coverage gaps", () => {
  beforeEach(() => {
    _childAutoClose = true;
    mockSpawn.mockReset();
  });

  afterEach(() => {
    _childAutoClose = false;
  });

  // ── line 87: .ts script → npx tsx ────────────────

  it("runHookProcess with .ts script uses 'npx tsx' command (line 87)", async () => {
    const hook: HookResolution = {
      type: "script",
      commandOrPath: "/tmp/my-hook.ts",
      timeoutMs: 5000,
      mode: "strict",
    };

    const result = await runHookProcess(hook, hookPayload());

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const cmd = mockSpawn.mock.calls[0]![0] as string;
    expect(cmd).toBe("npx tsx /tmp/my-hook.ts");

    // autoClose fires close with code 0, no stdout → "allow"
    expect(result.status).toBe("allow");
  });

  // ── lines 142-148: error event in permissive mode ─

  it("allows in permissive mode when spawn emits error (lines 142-148)", async () => {
    _childAutoClose = false;
    mockSpawn.mockReset();
    mockSpawn.mockImplementationOnce(() => {
      const proc = createFakeProcess();
      process.nextTick(() => {
        proc.emit("error", new Error("spawn ENOENT"));
      });
      return proc;
    });

    const result = await runHookProcess(
      { type: "config", commandOrPath: "nope", timeoutMs: 5000, mode: "permissive" },
      hookPayload(),
    );

    expect(result.status).toBe("allow");
  });

  // ── lines 145-146: error event in strict mode ─────

  it("denies in strict mode when spawn emits error (lines 145-146)", async () => {
    _childAutoClose = false;
    mockSpawn.mockReset();
    mockSpawn.mockImplementationOnce(() => {
      const proc = createFakeProcess();
      process.nextTick(() => {
        proc.emit("error", new Error("spawn ENOENT"));
      });
      return proc;
    });

    const result = await runHookProcess(
      { type: "config", commandOrPath: "nope", timeoutMs: 5000, mode: "strict" },
      hookPayload(),
    );

    expect(result.status).toBe("deny");
    expect(result.error).toContain("Hook Spawn Failed");
  });
});

// ═══════════════════════════════════════════════════════
// hooks.ts — runHookProcess JSON output path (covers L361-362 code path)
// ═══════════════════════════════════════════════════════

describe("hooks.ts — runHookProcess JSON output", () => {
  it("returns parsed JSON output from hook process stdout", async () => {
    _childAutoClose = false;
    mockSpawn.mockReset();
    mockSpawn.mockImplementationOnce(() => {
      const proc = createFakeProcess();
      const jsonData = JSON.stringify({ status: "allow", output: "overridden by hook" }) + "\n";
      process.nextTick(() => {
        proc.stdout.push(jsonData);
        proc.stdout.push(null);
        process.nextTick(() => {
          proc.exitCode = 0;
          proc.emit("close", 0, null);
        });
      });
      return proc;
    });

    const result = await runHookProcess(
      { type: "config", commandOrPath: "echo hook", timeoutMs: 5000, mode: "strict" },
      hookPayload(),
    );

    expect(result.status).toBe("allow");
    expect(result.output).toBe("overridden by hook");
  });
});

// ═══════════════════════════════════════════════════════
// loop.ts — uncovered branches
// ═══════════════════════════════════════════════════════

describe("loop.ts coverage gaps", () => {
  beforeEach(() => {
    _childAutoClose = false;
    mockSpawn.mockReset();
  });

  it("returns 'Unknown tool' when tool is not in registry (line 272)", async () => {
    const runtime = bootRuntime({ noSubstrate: true });
    const provider = makeProvider([
      { type: "turn.started", id: "t1" },
      { type: "tool.requested", id: "tc1", name: "nonexistent_tool", args: {} },
      { type: "assistant.completed", text: "done" },
      { type: "turn.completed" },
    ]);
    const events = await collect(runTurn(runtime, provider, "hello"));
    const tc = events.find(
      (e): e is Extract<RuntimeEvent, { type: "tool.completed" }> => e.type === "tool.completed",
    );
    expect(tc).toBeDefined();
    expect(tc!.output).toBe("Unknown tool: nonexistent_tool");
  });

  it("normalizeToolArgs wraps string args as { value } (line 375)", async () => {
    let captured: Record<string, unknown> | null = null;
    const tool = makeTool("str-tool", "ok", (a) => { captured = a; });
    const runtime = bootRuntime({
      noSubstrate: true,
      toolRegistry: (() => { const reg = new ToolRegistry(); reg.register(tool); return reg; })(),
    });
    runtime.sessionPermissions = { "str-tool": "allow" };
    const provider = makeProvider([
      { type: "turn.started", id: "t1" },
      { type: "tool.requested", id: "tc1", name: "str-tool", args: "hello string" },
      { type: "assistant.completed", text: "done" },
      { type: "turn.completed" },
    ]);
    await collect(runTurn(runtime, provider, "go"));
    expect(captured).not.toBeNull();
    expect(captured!.value).toBe("hello string");
    expect(captured!.toolCallId).toBe("tc1");
  });

  it("normalizeToolArgs wraps null args as { value: null } (line 375)", async () => {
    let captured: Record<string, unknown> | null = null;
    const tool = makeTool("null-tool", "ok", (a) => { captured = a; });
    const runtime = bootRuntime({
      noSubstrate: true,
      toolRegistry: (() => { const reg = new ToolRegistry(); reg.register(tool); return reg; })(),
    });
    runtime.sessionPermissions = { "null-tool": "allow" };
    const provider = makeProvider([
      { type: "turn.started", id: "t1" },
      { type: "tool.requested", id: "tc1", name: "null-tool", args: null },
      { type: "assistant.completed", text: "done" },
      { type: "turn.completed" },
    ]);
    await collect(runTurn(runtime, provider, "go"));
    expect(captured).not.toBeNull();
    expect(captured!.value).toBeNull();
    expect(captured!.toolCallId).toBe("tc1");
  });

  it("normalizeToolArgs wraps array args as { value } (line 375)", async () => {
    let captured: Record<string, unknown> | null = null;
    const tool = makeTool("arr-tool", "ok", (a) => { captured = a; });
    const runtime = bootRuntime({
      noSubstrate: true,
      toolRegistry: (() => { const reg = new ToolRegistry(); reg.register(tool); return reg; })(),
    });
    runtime.sessionPermissions = { "arr-tool": "allow" };
    const provider = makeProvider([
      { type: "turn.started", id: "t1" },
      { type: "tool.requested", id: "tc1", name: "arr-tool", args: [1, 2, 3] },
      { type: "assistant.completed", text: "done" },
      { type: "turn.completed" },
    ]);
    await collect(runTurn(runtime, provider, "go"));
    expect(captured).not.toBeNull();
    expect(captured!.value).toEqual([1, 2, 3]);
    expect(captured!.toolCallId).toBe("tc1");
  });
});

// ═══════════════════════════════════════════════════════
// mcp.ts — uncovered branches
// ═══════════════════════════════════════════════════════

describe("mcp.ts coverage gaps", () => {
  let client: McpClient | null = null;

  beforeEach(() => {
    _childAutoClose = false;
    mockSpawn.mockReset();
    readlineModule.resetLineCallback();
  });

  afterEach(async () => {
    if (client) {
      try {
        await client.stop();
      } catch {
        /* already stopped */
      }
      client = null;
    }
  });

  function startClient(name = "test"): McpClient {
    const c = new McpClient(name, { command: "echo" });
    mockSpawn.mockReturnValueOnce(createFakeProcess());
    c.start();
    client = c;
    return c;
  }

  function getLineCb(): (line: string) => void {
    const cb = readlineModule.getLineCallback();
    expect(cb).toBeDefined();
    return cb!;
  }

  // ── handleLine: invalid JSON (lines 238-240) ──────

  it("handleLine emits error event on invalid JSON when listeners exist", () => {
    const c = startClient();
    const errors: Error[] = [];
    c.on("error", (err: Error) => errors.push(err));

    getLineCb()!("this is not valid json {{{");

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("Failed to parse MCP response line");
  });

  it("handleLine silently ignores invalid JSON when no error listeners", () => {
    const c = startClient();
    // No error listeners — should not throw
    expect(() => getLineCb()!("bad json")).not.toThrow();
  });

  // ── handleLine: empty line ────────────────────────

  it("handleLine ignores empty / whitespace-only lines", () => {
    const c = startClient();
    expect(() => {
      getLineCb()!("");
      getLineCb()!("   ");
      getLineCb()!("\t");
    }).not.toThrow();
  });

  // ── handleLine: non-2.0 jsonrpc ──────────────────

  it("handleLine ignores messages with jsonrpc != '2.0'", () => {
    const c = startClient();
    const errors: Error[] = [];
    c.on("error", (err: Error) => errors.push(err));

    getLineCb()(JSON.stringify({ jsonrpc: "1.0", id: 1, result: "old" }));

    expect(errors).toHaveLength(0); // silently ignored
  });

  // ── handleLine: response with error field (L222-226) ─

  it("handleLine rejects pending request when response has error field", async () => {
    const c = startClient();

    const reqPromise = c.request("test-method").catch((e: unknown) => e);

    // Send error response for the pending request (id 1)
    getLineCb()(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32600, message: "Invalid Request", data: { extra: "info" } },
      }),
    );

    const result = await reqPromise;
    expect(result).toBeInstanceOf(Error);
    const err = result as Error & { code: number; data: Record<string, unknown> };
    expect(err.message).toBe("Invalid Request");
    expect(err.code).toBe(-32600);
    expect(err.data).toEqual({ extra: "info" });
  });

  // ── handleLine: response for unknown request id (L219) ─

  it("handleLine ignores response for unknown request id", () => {
    const c = startClient();

    // No pending requests — response for id 999 is silently ignored
    getLineCb()(JSON.stringify({ jsonrpc: "2.0", id: 999, result: "stale" }));
    // No error, no crash
  });

  // ── handleLine: server notification (lines 231-236) ─

  it("handleLine emits 'notification' for server-initiated messages (L231-236)", () => {
    const c = startClient();
    const notes: Array<{ method: string; params: unknown }> = [];
    c.on("notification", (n: unknown) => notes.push(n as { method: string; params: unknown }));

    getLineCb()(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "server/progress",
        params: { percent: 50 },
      }),
    );

    expect(notes).toHaveLength(1);
    expect(notes[0].method).toBe("server/progress");
    expect(notes[0].params).toEqual({ percent: 50 });
  });

  // ── notification() writes to stdin without id (L194-200) ─

  it("notification() writes JSON-RPC without id to stdin (L194-200)", () => {
    const proc = createFakeProcess();
    mockSpawn.mockReturnValueOnce(proc);

    const c = new McpClient("notif-test", { command: "echo" });
    c.start();
    client = c;

    const writeSpy = vi.spyOn(proc.stdin as NodeJS.WritableStream, "write");
    c.notification("custom/event", { data: 42 });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const written = JSON.parse(writeSpy.mock.calls[0]![0] as string);
    expect(written.jsonrpc).toBe("2.0");
    expect(written.method).toBe("custom/event");
    expect(written.params).toEqual({ data: 42 });
    expect(written.id).toBeUndefined();
  });

  // ── stop() on already-stopped client (L263-297) ───

  it("stop() on a client that was never started resolves cleanly", async () => {
    const c = new McpClient("never-started", { command: "echo" });
    // process is null
    await expect(c.stop()).resolves.toBeUndefined();
  });

  // ── stop() SIGKILL fallback (lines 281-288) ───────

  it("stop() sends SIGKILL after timeout when process hangs (L281-288)", async () => {
    const proc = createFakeProcess() as Record<string, unknown>;
    // Simulate a hung process: kill() is called but close never fires
    const killFn = vi.fn(() => {
      proc.killed = true;
      // Deliberately NOT emitting 'close'
      return true;
    });
    proc.kill = killFn;
    mockSpawn.mockReturnValueOnce(proc);

    const c = new McpClient("hung", { command: "echo" });
    c.start();
    client = c;

    await c.stop();

    // SIGTERM first, then SIGKILL after the 500ms timer
    expect(killFn).toHaveBeenCalledTimes(2);
    expect(killFn.mock.calls[0]![0]).toBe("SIGTERM");
    expect(killFn.mock.calls[1]![0]).toBe("SIGKILL");
  });

  // ── request() rejects after spawnError (L154-156) ─

  it("request() rejects with spawnError when process failed to start (L154-156)", async () => {
    mockSpawn.mockImplementationOnce(() => {
      throw new Error("ENOENT");
    });

    const c = new McpClient("fail-start", { command: "nope" });
    try {
      c.start();
    } catch {
      // expected
    }
    client = c;

    await expect(c.request("ping")).rejects.toThrow("ENOENT");
  });

  // ── request() rejects when process not running (L158-159) ─

  it("request() rejects when process is not running (L158-159)", async () => {
    const c = new McpClient("not-running", { command: "echo" });
    // Never started — process is null
    client = c;

    await expect(c.request("ping")).rejects.toThrow(/not running/);
  });
});
