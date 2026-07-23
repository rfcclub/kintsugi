import { bootRuntime } from "./runtime.js";
import type { KintsugiRuntime } from "./session.js";

export interface SubagentConfig {
  id: string;
  role: string;
  prompt: string;
  permissions: string[];
}

export interface SubagentMessage {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  timestamp: number;
}

export class SubagentManager {
  private registry = new Map<string, KintsugiRuntime>();
  private parents = new Map<string, KintsugiRuntime>();

  constructor(public readonly maxConcurrency: number = 5) {}

  /**
   * Spawns a subagent as an isolated KintsugiRuntime.
   */
  public spawn(config: SubagentConfig, parentRuntime?: KintsugiRuntime): KintsugiRuntime {
    let depth = 1;
    if (parentRuntime) {
      const parentDepth = parentRuntime.subagentDepth ?? 0;
      depth = parentDepth + 1;
    }
    if (depth > 2) {
      throw new Error("Subagent spawning depth limit exceeded (max depth 2)");
    }

    if (this.registry.size >= this.maxConcurrency) {
      throw new Error(`Max concurrency limit reached (max ${this.maxConcurrency} active subagents)`);
    }

    const subagentRuntime = bootRuntime({
      noSubstrate: true,
      sessionId: config.id,
      systemInstructions: config.prompt,
      allowedTools: config.permissions,
      subagentManager: this,
      subagentDepth: depth,
    });

    if (parentRuntime) {
      this.parents.set(config.id, parentRuntime);
    }

    this.registry.set(config.id, subagentRuntime);
    return subagentRuntime;
  }

  /**
   * Sends a message to a subagent or parent runtime.
   */
  public sendMessage(senderId: string, recipientId: string, content: string): void {
    const msg: SubagentMessage = {
      id: Math.random().toString(36).substring(7),
      senderId,
      recipientId,
      content,
      timestamp: Date.now(),
    };

    let recipientRuntime: KintsugiRuntime | undefined;
    if (recipientId === "parent" || (this.parents.has(senderId) && this.parents.get(senderId)?.sessionId === recipientId)) {
      recipientRuntime = this.parents.get(senderId);
    } else {
      recipientRuntime = this.registry.get(recipientId);
    }

    if (recipientRuntime) {
      if (!recipientRuntime.incomingMessages) {
        recipientRuntime.incomingMessages = [];
      }
      recipientRuntime.incomingMessages.push(msg);

      if (recipientRuntime.messageHandler) {
        process.nextTick(() => {
          recipientRuntime.messageHandler?.(msg);
        });
      }
    }
  }

  /**
   * Retrieves a subagent's runtime by its ID.
   */
  public get(id: string): KintsugiRuntime | undefined {
    return this.registry.get(id);
  }

  /**
   * Checks if a subagent is registered.
   */
  public has(id: string): boolean {
    return this.registry.has(id);
  }

  /**
   * Removes a subagent from the registry.
   */
  public remove(id: string): boolean {
    this.parents.delete(id);
    return this.registry.delete(id);
  }

  /**
   * Clears the registry of all subagents.
   */
  public clear(): void {
    this.parents.clear();
    this.registry.clear();
  }

  /**
   * Returns the map of all active subagent runtimes.
   */
  public getActiveSubagents(): Map<string, KintsugiRuntime> {
    return this.registry;
  }
}
