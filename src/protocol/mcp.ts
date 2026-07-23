import { spawn, type ChildProcess } from "node:child_process";
import readline from "node:readline";
import { EventEmitter } from "node:events";
import type { Tool, ToolSpec, ToolResult, ToolContext } from "../tools/tool.js";
import { toolCallIdFrom } from "../tools/utils.js";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class McpClient extends EventEmitter {
  public process: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private pendingRequests = new Map<
    string | number,
    {
      resolve: (value: any) => void;
      reject: (reason: any) => void;
    }
  >();
  private nextId = 1;
  private spawnError: Error | null = null;
  private isStopping = false;

  constructor(
    public readonly name: string,
    private readonly config: McpServerConfig
  ) {
    super();
  }

  /**
   * Checks if the MCP server child process is currently running.
   */
  public isProcessRunning(): boolean {
    return (
      this.process !== null &&
      this.process.pid !== undefined &&
      !this.process.killed &&
      this.process.exitCode === null &&
      this.process.signalCode === null
    );
  }

  /**
   * Spawns the MCP server child process and establishes stdio communication.
   */
  public start(): void {
    if (this.process) {
      throw new Error(`McpClient for "${this.name}" is already started`);
    }

    this.spawnError = null;
    this.isStopping = false;

    try {
      this.process = spawn(this.config.command, this.config.args || [], {
        env: {
          ...process.env,
          ...(this.config.env || {}),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err: any) {
      this.spawnError = err;
      throw err;
    }

    // Prevent stream errors from crashing the process
    if (this.process.stdin) {
      this.process.stdin.on("error", (err) => {
        if (this.listenerCount("error") > 0) {
          this.emit("error", new Error(`stdin error: ${err.message}`));
        }
      });
    }

    // Set up stdout reading line by line
    if (this.process.stdout) {
      this.process.stdout.on("error", (err) => {
        if (this.listenerCount("error") > 0) {
          this.emit("error", new Error(`stdout error: ${err.message}`));
        }
      });

      this.rl = readline.createInterface({
        input: this.process.stdout,
        terminal: false,
      });

      this.rl.on("line", (line) => {
        this.handleLine(line);
      });
    }

    // Set up stderr logging/forwarding
    if (this.process.stderr) {
      this.process.stderr.on("error", (err) => {
        if (this.listenerCount("error") > 0) {
          this.emit("error", new Error(`stderr error: ${err.message}`));
        }
      });

      this.process.stderr.on("data", (data) => {
        this.emit("stderr", data.toString());
      });
    }

    // Process error event (e.g. command not found)
    this.process.on("error", (err) => {
      this.spawnError = err;
      if (this.listenerCount("error") > 0) {
        this.emit("error", err);
      }
      this.cleanup(err);
    });

    // Process close/exit event
    this.process.on("close", (code, signal) => {
      if (!this.isStopping) {
        const exitError = new Error(
          `MCP server "${this.name}" exited with code ${code} (signal: ${signal})`
        );
        this.emit("close", code, signal);
        this.cleanup(exitError);
      }
    });
  }

  /**
   * Sends a JSON-RPC request to the MCP server.
   */
  public async request(method: string, params?: any): Promise<any> {
    if (this.spawnError) {
      throw this.spawnError;
    }

    if (!this.isProcessRunning()) {
      throw new Error(`MCP server "${this.name}" is not running`);
    }

    const id = this.nextId++;
    const payload: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const written = this.process!.stdin?.write(JSON.stringify(payload) + "\n");
      if (!written) {
        // If write failed, reject immediately
        this.pendingRequests.delete(id);
        reject(new Error(`Failed to write request to MCP server "${this.name}" stdin`));
      }
    });
  }

  /**
   * Sends a JSON-RPC notification (no response expected).
   */
  public notification(method: string, params?: any): void {
    if (this.spawnError) {
      throw this.spawnError;
    }

    if (!this.isProcessRunning()) {
      throw new Error(`MCP server "${this.name}" is not running`);
    }

    const payload = {
      jsonrpc: "2.0",
      method,
      params,
    };

    this.process!.stdin?.write(JSON.stringify(payload) + "\n");
  }

  /**
   * Handles incoming line from stdout.
   */
  private handleLine(line: string): void {
    if (!line.trim()) return;

    try {
      const response: JsonRpcResponse & { method?: string; params?: any } = JSON.parse(line);

      // JSON-RPC 2.0 validation
      if (response.jsonrpc !== "2.0") {
        return;
      }

      // Check if it's a response to a request
      if (response.id !== undefined && response.id !== null) {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          if (response.error) {
            const err = new Error(response.error.message || "JSON-RPC Error");
            (err as any).code = response.error.code;
            (err as any).data = response.error.data;
            pending.reject(err);
          } else {
            pending.resolve(response.result);
          }
        }
      } else if (response.method) {
        // It's a notification from the server
        this.emit("notification", {
          method: response.method,
          params: response.params,
        });
      }
    } catch (err) {
      if (this.listenerCount("error") > 0) {
        this.emit("error", new Error(`Failed to parse MCP response line: ${err}`));
      }
    }
  }

  /**
   * Rejects all pending requests and cleans up resources.
   */
  private cleanup(error: Error): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    for (const [id, pending] of this.pendingRequests.entries()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  /**
   * Stops the MCP server and cleans up resources.
   */
  public async stop(): Promise<void> {
    this.isStopping = true;
    const stopError = new Error(`MCP server "${this.name}" was stopped`);
    this.cleanup(stopError);

    if (this.process) {
      const proc = this.process;
      this.process = null;

      if (proc.pid !== undefined && proc.exitCode === null && proc.signalCode === null) {
        try {
          proc.kill("SIGTERM");
        } catch {
          // Ignore error if process couldn't be killed
        }

        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            if (proc.pid !== undefined && proc.exitCode === null && proc.signalCode === null) {
              try {
                proc.kill("SIGKILL");
              } catch {
                // Ignore
              }
            }
            resolve();
          }, 500);

          proc.once("close", () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    }
  }

  /**
   * Retrieves tools from the MCP server, converting them to Kintsugi tools.
   */
  public async getTools(): Promise<Tool[]> {
    const response = await this.request("tools/list");
    if (!response || !Array.isArray(response.tools)) {
      return [];
    }

    return response.tools.map((mcpTool: any) => {
      const originalName = mcpTool.name;
      const kebabName = toKebabCase(originalName);

      const spec: ToolSpec = {
        name: kebabName,
        description: mcpTool.description || "",
        parameters: {
          type: "object",
          properties: mcpTool.inputSchema?.properties || {},
          required: mcpTool.inputSchema?.required,
        },
      };

      return {
        spec,
        execute: async (
          args: Record<string, unknown>,
          context: ToolContext
        ): Promise<ToolResult> => {
          const toolCallId = toolCallIdFrom(args);
          const { toolCallId: _, ...mcpArgs } = args;

          try {
            const result = await this.request("tools/call", {
              name: originalName,
              arguments: mcpArgs,
            });

            const output = Array.isArray(result?.content)
              ? result.content
                  .filter((c: any) => c.type === "text" && typeof c.text === "string")
                  .map((c: any) => c.text)
                  .join("\n")
              : "";

            const isError = result?.isError === true;

            return {
              toolCallId,
              output,
              isError,
            };
          } catch (error) {
            return {
              toolCallId,
              output: error instanceof Error ? error.message : String(error),
              isError: true,
            };
          }
        },
      };
    });
  }
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

