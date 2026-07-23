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
