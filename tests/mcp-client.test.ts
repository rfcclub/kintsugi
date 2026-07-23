import { describe, expect, it, afterEach, vi } from "vitest";
import { McpClient } from "../src/protocol/mcp.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveConfig } from "../src/config/config.js";
import { parseArgs } from "../src/cli/args.js";
import React from "react";
import { render } from "ink";
import * as runtimeModule from "../src/runtime/runtime.js";
import { App } from "../src/ui/App.js";

describe("McpClient", () => {
  let client: McpClient | null = null;

  afterEach(async () => {
    if (client) {
      await client.stop();
      client = null;
    }
  });

  it("should spawn a child process and handle JSON-RPC requests/responses", async () => {
    const mockServerScript = `
      import readline from "node:readline";
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
      });
      rl.on("line", (line) => {
        try {
          const req = JSON.parse(line);
          if (req.method === "ping") {
            const resp = {
              jsonrpc: "2.0",
              id: req.id,
              result: "pong"
            };
            process.stdout.write(JSON.stringify(resp) + "\\n");
          } else {
            const resp = {
              jsonrpc: "2.0",
              id: req.id,
              result: req.params
            };
            process.stdout.write(JSON.stringify(resp) + "\\n");
          }
        } catch (err) {
          // ignore
        }
      });
    `;

    client = new McpClient("test-server", {
      command: "node",
      args: ["--input-type=module", "-e", mockServerScript],
      env: { TEST_ENV_VAR: "hello" }
    });

    client.start();

    const response1 = await client.request("ping");
    expect(response1).toBe("pong");

    const response2 = await client.request("echo", { foo: "bar" });
    expect(response2).toEqual({ foo: "bar" });
  });

  it("should handle error responses from JSON-RPC", async () => {
    const mockServerScript = `
      import readline from "node:readline";
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
      });
      rl.on("line", (line) => {
        try {
          const req = JSON.parse(line);
          const resp = {
            jsonrpc: "2.0",
            id: req.id,
            error: {
              code: -32601,
              message: "Method not found"
            }
          };
          process.stdout.write(JSON.stringify(resp) + "\\n");
        } catch (err) {
          // ignore
        }
      });
    `;

    client = new McpClient("test-server", {
      command: "node",
      args: ["--input-type=module", "-e", mockServerScript]
    });

    client.start();

    await expect(client.request("unknown_method")).rejects.toThrow("Method not found");
  });

  it("should throw error if process fails to spawn", async () => {
    client = new McpClient("invalid-server", {
      command: "non_existent_command_xyz"
    });

    client.start();

    await expect(client.request("ping")).rejects.toThrow();
  });

  it("should handle unexpected exit or crash of the child process", async () => {
    const mockServerScript = `
      import readline from "node:readline";
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
      });
      rl.on("line", (line) => {
        try {
          const req = JSON.parse(line);
          if (req.method === "ping") {
            process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: "pong" }) + "\\n");
          } else if (req.method === "exit") {
            process.exit(1);
          }
        } catch (err) {
          // ignore
        }
      });
    `;

    client = new McpClient("test-server", {
      command: "node",
      args: ["--input-type=module", "-e", mockServerScript]
    });

    client.start();

    // Verify it is running
    const response = await client.request("ping");
    expect(response).toBe("pong");

    // Tell it to exit
    client.notification("exit");

    // Wait for the close event
    await new Promise<void>((resolve) => {
      client!.once("close", () => resolve());
    });

    // Now a request should fail because it has exited
    await expect(client.request("ping")).rejects.toThrow();
  });

  it("should fetch tools (tools/list), map them, and execute them (tools/call)", async () => {
    const mockServerScript = `
      import readline from "node:readline";
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
      });
      rl.on("line", (line) => {
        try {
          const req = JSON.parse(line);
          if (req.method === "tools/list") {
            const resp = {
              jsonrpc: "2.0",
              id: req.id,
              result: {
                tools: [
                  {
                    name: "mock_tool_snake",
                    description: "A snake case tool for testing",
                    inputSchema: {
                      type: "object",
                      properties: {
                        param1: { type: "string", description: "Parameter 1" }
                      },
                      required: ["param1"]
                    }
                  },
                  {
                    name: "mockToolCamel",
                    description: "A camel case tool for testing",
                    inputSchema: {
                      type: "object",
                      properties: {
                        param2: { type: "number", description: "Parameter 2" }
                      }
                    }
                  }
                ]
              }
            };
            process.stdout.write(JSON.stringify(resp) + "\\n");
          } else if (req.method === "tools/call") {
            const { name, arguments: args } = req.params;
            let content = [];
            let isError = false;

            if (name === "mock_tool_snake") {
              content = [{ type: "text", text: "Executed mock_tool_snake with " + args.param1 }];
            } else if (name === "mockToolCamel") {
              if (args.param2 === 42) {
                content = [{ type: "text", text: "Answer found" }];
              } else {
                content = [{ type: "text", text: "Error: value must be 42" }];
                isError = true;
              }
            } else {
              content = [{ type: "text", text: "Unknown tool: " + name }];
              isError = true;
            }

            const resp = {
              jsonrpc: "2.0",
              id: req.id,
              result: {
                content,
                isError
              }
            };
            process.stdout.write(JSON.stringify(resp) + "\\n");
          } else {
            const resp = {
              jsonrpc: "2.0",
              id: req.id,
              result: {}
            };
            process.stdout.write(JSON.stringify(resp) + "\\n");
          }
        } catch (err) {
          // ignore
        }
      });
    `;

    client = new McpClient("test-tools-server", {
      command: "node",
      args: ["--input-type=module", "-e", mockServerScript]
    });

    client.start();

    // Fetch and map tools
    const tools = await client.getTools();
    expect(tools).toHaveLength(2);

    // Verify mapping to ToolSpec with kebab-case name
    const tool1 = tools.find((t) => t.spec.name === "mock-tool-snake")!;
    expect(tool1).toBeDefined();
    expect(tool1.spec.description).toBe("A snake case tool for testing");
    expect(tool1.spec.parameters.properties.param1).toEqual({
      type: "string",
      description: "Parameter 1"
    });
    expect(tool1.spec.parameters.required).toEqual(["param1"]);

    const tool2 = tools.find((t) => t.spec.name === "mock-tool-camel")!;
    expect(tool2).toBeDefined();
    expect(tool2.spec.description).toBe("A camel case tool for testing");

    // Execute tool 1 via Kintsugi Tool interface
    const context = {
      workingDir: "/mock",
      workspaceRoots: ["/mock"],
      permission: "allow" as any
    };
    const result1 = await tool1.execute({ toolCallId: "call-1", param1: "hello" }, context);
    expect(result1).toEqual({
      toolCallId: "call-1",
      output: "Executed mock_tool_snake with hello",
      isError: false
    });

    // Execute tool 2 with success
    const result2Success = await tool2.execute({ toolCallId: "call-2", param2: 42 }, context);
    expect(result2Success).toEqual({
      toolCallId: "call-2",
      output: "Answer found",
      isError: false
    });

    // Execute tool 2 with failure (isError true)
    const result2Fail = await tool2.execute({ toolCallId: "call-3", param2: 0 }, context);
    expect(result2Fail).toEqual({
      toolCallId: "call-3",
      output: "Error: value must be 42",
      isError: true
    });
  });
});

describe("MCP Config Resolution", () => {
  it("should read and parse .kintsugi/mcp.json relative to cwd", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "kintsugi-mcp-test-"));
    const repoDir = path.join(dir, ".kintsugi");
    mkdirSync(repoDir, { recursive: true });
    const mcpJsonPath = path.join(repoDir, "mcp.json");

    const mcpConfig = {
      mcpServers: {
        "test-mcp-server": {
          command: "node",
          args: ["-e", "console.log('hello')"],
          env: { SOME_VAR: "value" }
        }
      }
    };

    writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig), "utf-8");

    const resolved = resolveConfig(parseArgs(["ask", "hi"]), {
      cwd: dir,
      homeConfigPath: path.join(dir, "missing-home.yaml"),
      repoConfigPath: path.join(dir, "missing-repo.yaml"),
    });

    expect(resolved.mcpServers).toBeDefined();
    expect(resolved.mcpServers?.["test-mcp-server"]).toEqual({
      command: "node",
      args: ["-e", "console.log('hello')"],
      env: { SOME_VAR: "value" }
    });
  });
});

describe("MCP Dynamic Tool Registration in RuntimeApp", () => {
  it("should register dynamic MCP tools in the tool registry upon startup and call stop on unmount", async () => {
    const mockServerScript = `
      import readline from "node:readline";
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
      });
      rl.on("line", (line) => {
        try {
          const req = JSON.parse(line);
          if (req.method === "tools/list") {
            const resp = {
              jsonrpc: "2.0",
              id: req.id,
              result: {
                tools: [
                  {
                    name: "mock_mcp_tool",
                    description: "A tool registered via MCP config",
                    inputSchema: {
                      type: "object",
                      properties: {
                        param: { type: "string" }
                      }
                    }
                  }
                ]
              }
            };
            process.stdout.write(JSON.stringify(resp) + "\\n");
          } else {
            process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: {} }) + "\\n");
          }
        } catch (err) {}
      });
    `;

    const args = parseArgs(["boot"]);
    const config = resolveConfig(parseArgs(["boot"]), {
      homeConfigPath: "missing-home.yaml",
      repoConfigPath: "missing-repo.yaml",
    });

    config.mcpServers = {
      "mock-mcp-server-startup": {
        command: "node",
        args: ["--input-type=module", "-e", mockServerScript]
      }
    };

    let capturedRuntime: any = null;
    const originalBootRuntime = runtimeModule.bootRuntime;
    const spy = vi.spyOn(runtimeModule, "bootRuntime").mockImplementation((opts) => {
      const rt = originalBootRuntime(opts);
      capturedRuntime = rt;
      return rt;
    });

    const stopSpy = vi.spyOn(McpClient.prototype, "stop");

    const { unmount } = render(React.createElement(App, { args, config }), { patchConsole: false });

    const start = Date.now();
    let registeredTool: any = null;
    while (Date.now() - start < 2000) {
      if (capturedRuntime && capturedRuntime.toolRegistry) {
        registeredTool = capturedRuntime.toolRegistry.lookup("mock-mcp-tool");
        if (registeredTool) {
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(registeredTool).toBeDefined();
    expect(registeredTool.spec.name).toBe("mock-mcp-tool");

    unmount();

    expect(stopSpy).toHaveBeenCalled();

    spy.mockRestore();
    stopSpy.mockRestore();
  });
});



