import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";

// Mock spawn — factory cannot reference outer variables, so use vi.fn() inside
vi.mock("node:child_process", () => {
  const { EventEmitter } = require("node:events");
  const { Writable, Readable } = require("node:stream");
  
  function makeFakeProcess() {
    const proc = new EventEmitter();
    proc.pid = 12345;
    proc.killed = false;
    proc.exitCode = null;
    proc.signalCode = null;
    proc.stdin = new Writable({ write() {} });
    proc.stdout = new Readable({ read() {} });
    proc.stderr = new Readable({ read() {} });
    proc.kill = vi.fn((sig) => {
      proc.signalCode = sig;
      proc.exitCode = sig === "SIGTERM" ? null : 1;
      // Emit close in next tick so stop()'s proc.once("close") fires
      // immediately, avoiding the 500ms SIGKILL fallback timer
      process.nextTick(() => proc.emit("close", proc.exitCode, sig));
    });
    return proc;
  }

  const spawnMock = vi.fn(() => makeFakeProcess());
  // Attach helper for tests to override
  (spawnMock as any)._makeFake = makeFakeProcess;
  return { spawn: spawnMock, ChildProcess: EventEmitter };
});

vi.mock("readline", () => {
  const createInterface = vi.fn(() => ({
    on: vi.fn(),
    close: vi.fn(),
  }));
  return { default: { createInterface }, createInterface };
});

const { spawn: mockSpawn } = await import("node:child_process") as any;

import { McpClient } from "../../src/protocol/mcp.js";
import type { McpServerConfig } from "../../src/protocol/mcp.js";

function fakeProcess() {
  return (mockSpawn as any)._makeFake();
}

describe("McpClient — lifecycle & error paths", () => {
  let client: McpClient;
  const config: McpServerConfig = { command: "echo", args: ["hello"], env: { FOO: "bar" } };

  beforeEach(() => {
    mockSpawn.mockReset();
    mockSpawn.mockImplementation(() => fakeProcess());
    client = new McpClient("test-server", config);
  });

  afterEach(async () => {
    // Stop if still running; ignore errors from double-stop
    if (client && (client as any).process) {
      try { await client.stop(); } catch {}
    }
  });

  describe("start()", () => {
    it("spawns process with config command, args, and env", () => {
      client.start();

      expect(mockSpawn).toHaveBeenCalledWith(
        "echo",
        ["hello"],
        expect.objectContaining({
          env: expect.objectContaining({ FOO: "bar" }),
          stdio: ["pipe", "pipe", "pipe"],
        }),
      );
    });

    it("throws if already started", () => {
      client.start();
      expect(() => client.start()).toThrow(/already started/);
    });

    it("throws and sets spawnError when spawn throws", () => {
      mockSpawn.mockImplementationOnce(() => { throw new Error("ENOENT"); });
      expect(() => client.start()).toThrow("ENOENT");
    });

    it("emits error when process emits error event", () => {
      const proc = fakeProcess();
      mockSpawn.mockReturnValueOnce(proc);
      client.start();

      const errors: Error[] = [];
      client.on("error", (e) => errors.push(e));

      proc.emit("error", new Error("command not found"));

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe("command not found");
    });

    it("emits stderr when process emits stderr data", () => {
      const proc = fakeProcess();
      mockSpawn.mockReturnValueOnce(proc);
      client.start();

      const stderrData: string[] = [];
      client.on("stderr", (d) => stderrData.push(d));

      proc.stderr.emit("data", Buffer.from("warning output"));

      expect(stderrData).toEqual(["warning output"]);
    });

    it("emits close and cleans up when process exits unexpectedly", () => {
      const proc = fakeProcess();
      mockSpawn.mockReturnValueOnce(proc);
      client.start();

      let closed = false;
      client.on("close", () => { closed = true; });

      proc.emit("close", 1, null);

      expect(closed).toBe(true);
    });
  });

  describe("isProcessRunning()", () => {
    it("returns false before start", () => {
      expect(client.isProcessRunning()).toBe(false);
    });

    it("returns true after start with running process", () => {
      client.start();
      expect(client.isProcessRunning()).toBe(true);
    });

    it("returns false after process exits", () => {
      const proc = fakeProcess();
      mockSpawn.mockReturnValueOnce(proc);
      client.start();

      proc.exitCode = 1;
      proc.signalCode = null;

      expect(client.isProcessRunning()).toBe(false);
    });
  });

  describe("request()", () => {
    it("throws spawnError when spawn previously failed", async () => {
      mockSpawn.mockImplementationOnce(() => { throw new Error("spawn fail"); });
      expect(() => client.start()).toThrow();

      await expect(client.request("tools/list")).rejects.toThrow("spawn fail");
    });

    it("throws when process is not running", async () => {
      await expect(client.request("tools/list")).rejects.toThrow(/not running/);
    });

    it("writes JSON-RPC request to stdin", async () => {
      const proc = fakeProcess();
      mockSpawn.mockReturnValueOnce(proc);
      client.start();

      const writeSpy = vi.spyOn(proc.stdin, "write");

      // Suppress unhandled rejection — response will never come (readline mocked)
      const reqPromise = client.request("ping").catch(() => {});

      expect(writeSpy).toHaveBeenCalled();
      const writtenData = writeSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(writtenData);
      expect(parsed.method).toBe("ping");
      expect(parsed.jsonrpc).toBe("2.0");

      await client.stop().catch(() => {});
      await reqPromise;
    });

    it("rejects when stdin write fails", async () => {
      const proc = fakeProcess();
      mockSpawn.mockReturnValueOnce(proc);
      client.start();

      vi.spyOn(proc.stdin, "write").mockReturnValue(false);

      await expect(client.request("ping")).rejects.toThrow(/Failed to write/);
    });
  });

  describe("notification()", () => {
    it("throws when spawnError exists", () => {
      mockSpawn.mockImplementationOnce(() => { throw new Error("dead"); });
      expect(() => client.start()).toThrow();

      expect(() => client.notification("update")).toThrow("dead");
    });

    it("throws when process not running", () => {
      expect(() => client.notification("update")).toThrow(/not running/);
    });

    it("writes notification to stdin without expecting response", () => {
      const proc = fakeProcess();
      mockSpawn.mockReturnValueOnce(proc);
      client.start();

      const writeSpy = vi.spyOn(proc.stdin, "write");

      client.notification("update", { key: "val" });

      expect(writeSpy).toHaveBeenCalled();
      const writtenData = writeSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(writtenData);
      expect(parsed.method).toBe("update");
      expect(parsed.params).toEqual({ key: "val" });
      expect(parsed.id).toBeUndefined();
    });
  });

  describe("stop()", () => {
    it("cleans up and kills process with SIGTERM", async () => {
      const proc = fakeProcess();
      mockSpawn.mockReturnValueOnce(proc);
      client.start();

      await client.stop();

      expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
    });

    it("handles stop when process already exited", async () => {
      const proc = fakeProcess();
      mockSpawn.mockReturnValueOnce(proc);
      client.start();

      proc.exitCode = 0;
      proc.pid = undefined;

      await expect(client.stop()).resolves.toBeUndefined();
    });
  });

  describe("getTools()", () => {
    it("returns empty array when response has no tools array", async () => {
      client.start();

      const requestSpy = vi.spyOn(client, "request");
      requestSpy.mockResolvedValueOnce({});

      const tools = await client.getTools();
      expect(tools).toEqual([]);
    });

    it("converts MCP tools to kintsugi tool format", async () => {
      client.start();

      const requestSpy = vi.spyOn(client, "request");
      requestSpy.mockResolvedValueOnce({
        tools: [{
          name: "searchWeb",
          description: "Search the web",
          inputSchema: {
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        }],
      });

      const tools = await client.getTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].spec.name).toBe("search-web");
      expect(tools[0].spec.description).toBe("Search the web");
      expect(tools[0].spec.parameters.properties.query).toEqual({ type: "string" });
    });

    it("executes tool call and returns output", async () => {
      client.start();

      const requestSpy = vi.spyOn(client, "request");
      requestSpy.mockResolvedValueOnce({
        tools: [{
          name: "getData",
          description: "Get data",
          inputSchema: { properties: {}, required: [] },
        }],
      });
      requestSpy.mockResolvedValueOnce({
        content: [{ type: "text", text: "result data" }],
        isError: false,
      });

      const tools = await client.getTools();
      const result = await tools[0].execute({ toolCallId: "tc-1" }, {} as any);

      expect(result.toolCallId).toBe("tc-1");
      expect(result.output).toBe("result data");
      expect(result.isError).toBe(false);
    });

    it("returns isError true when tool call throws", async () => {
      client.start();

      const requestSpy = vi.spyOn(client, "request");
      requestSpy.mockResolvedValueOnce({
        tools: [{
          name: "failTool",
          description: "Always fails",
          inputSchema: { properties: {}, required: [] },
        }],
      });
      requestSpy.mockRejectedValueOnce(new Error("tool crashed"));

      const tools = await client.getTools();
      const result = await tools[0].execute({ toolCallId: "tc-2" }, {} as any);

      expect(result.isError).toBe(true);
      expect(result.output).toBe("tool crashed");
    });

    it("joins multiple text content blocks", async () => {
      client.start();

      const requestSpy = vi.spyOn(client, "request");
      requestSpy.mockResolvedValueOnce({
        tools: [{
          name: "multi",
          description: "Multi content",
          inputSchema: { properties: {}, required: [] },
        }],
      });
      requestSpy.mockResolvedValueOnce({
        content: [
          { type: "text", text: "line1" },
          { type: "text", text: "line2" },
          { type: "image", url: "ignored" },
        ],
      });

      const tools = await client.getTools();
      const result = await tools[0].execute({ toolCallId: "tc-3" }, {} as any);

      expect(result.output).toBe("line1\nline2");
    });
  });

  describe("toKebabCase (via getTools)", () => {
    it("converts various name formats to kebab-case", async () => {
      client.start();

      const requestSpy = vi.spyOn(client, "request");
      requestSpy.mockResolvedValueOnce({
        tools: [
          { name: "searchWeb", description: "", inputSchema: {} },
          { name: "GetData", description: "", inputSchema: {} },
          { name: "already-kebab", description: "", inputSchema: {} },
          { name: "snake_case_name", description: "", inputSchema: {} },
        ],
      });

      const tools = await client.getTools();
      expect(tools.map((t) => t.spec.name)).toEqual([
        "search-web",
        "get-data",
        "already-kebab",
        "snake-case-name",
      ]);
    });
  });
});
