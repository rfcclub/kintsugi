import { describe, expect, it } from "vitest";
import { bootRuntime } from "../src/runtime/runtime.js";
import { SubagentManager } from "../src/runtime/subagents.js";
import { assemblePrompt } from "../src/runtime/prompt.js";
import { runTurn } from "../src/runtime/loop.js";
import type { Provider } from "../src/providers/provider.js";
import type { RuntimeEvent } from "../src/protocol/events.js";

describe("Subagent Isolation", () => {
  it("verifies spawning subagents creates isolated KintsugiRuntime instances with independent history pools and custom system instructions", () => {
    const parentRuntime = bootRuntime({ noSubstrate: true });
    parentRuntime.prompts.push({ role: "user", text: "Hello from parent", at: new Date().toISOString() });

    const manager = new SubagentManager();
    
    // Spawn Subagent 1
    const subagent1 = manager.spawn({
      id: "subagent-1",
      role: "math-expert",
      prompt: "You are a math expert.",
      permissions: ["read_file"],
    }, parentRuntime);

    // Spawn Subagent 2
    const subagent2 = manager.spawn({
      id: "subagent-2",
      role: "writer-expert",
      prompt: "You are a creative writer.",
      permissions: ["read_file"],
    }, parentRuntime);

    // Verify system instructions are correctly set
    expect(subagent1.systemInstructions).toBe("You are a math expert.");
    expect(subagent2.systemInstructions).toBe("You are a creative writer.");

    // Verify independent history pools (prompts)
    expect(subagent1.prompts).toBeDefined();
    expect(subagent1.prompts).toHaveLength(0);
    expect(subagent2.prompts).toBeDefined();
    expect(subagent2.prompts).toHaveLength(0);
    expect(parentRuntime.prompts).toHaveLength(1);

    // Push prompt to subagent 1 and check isolation
    subagent1.prompts.push({ role: "user", text: "What is 2+2?", at: new Date().toISOString() });
    expect(subagent1.prompts).toHaveLength(1);
    expect(subagent2.prompts).toHaveLength(0);
    expect(parentRuntime.prompts).toHaveLength(1);

    // Check that assemblePrompt utilizes the custom systemInstructions on subagent1
    const assembled1 = assemblePrompt(subagent1, "Test math");
    expect(assembled1.messages[0].content).toBe("You are a math expert.");

    // Check that assemblePrompt utilizes the custom systemInstructions on subagent2
    const assembled2 = assemblePrompt(subagent2, "Test writing");
    expect(assembled2.messages[0].content).toBe("You are a creative writer.");

    // Check parent assemblePrompt still uses BASE_INSTRUCTIONS
    const assembledParent = assemblePrompt(parentRuntime, "Test parent");
    expect(assembledParent.messages[0].content).toContain("You are Kintsugi, running inside kintsugi.");
  });

  it("verifies that if a subagent is configured with restricted permissions, attempts to execute restricted tools return a permission error", async () => {
    const parentRuntime = bootRuntime({ noSubstrate: true });
    const manager = new SubagentManager();

    // Spawn a subagent restricted to only "read_file"
    const subagent = manager.spawn({
      id: "subagent-restricted",
      role: "reader-only",
      prompt: "You are a read-only agent.",
      permissions: ["read_file"],
    }, parentRuntime);

    // Verify subagent runtime has the allowedTools defined
    expect(subagent.allowedTools).toEqual(["read_file"]);

    // Force permission decider to allow all tools, so only allowedTools can block it
    subagent.permissionDecider = async () => "allow";

    // Create a mock provider requesting "write_file" (not in allowedTools)
    const providerRestricted = toolProvider({
      type: "tool.requested",
      id: "tc-restricted",
      name: "write_file",
      args: { path: "forbidden.txt", content: "evil" },
    });

    const events = await collect(runTurn(subagent, providerRestricted, "write forbidden"));
    const completed = events.find((event) => event.type === "tool.completed");

    expect(completed).toBeDefined();
    expect(completed?.type).toBe("tool.completed");
    expect(completed && "output" in completed ? completed.output : "").toContain("Permission denied");
  });

  it("verifies spawning a subagent via the invoke_subagent tool call", async () => {
    const manager = new SubagentManager();
    const parentRuntime = bootRuntime({ noSubstrate: true, subagentManager: manager });
    parentRuntime.permissionDecider = async () => "allow";

    const provider = toolProvider({
      type: "tool.requested",
      id: "tc-invoke",
      name: "invoke_subagent",
      args: {
        id: "child-agent",
        role: "helper",
        prompt: "Help the parent.",
        permissions: ["read_file"],
      },
    });

    const events = await collect(runTurn(parentRuntime, provider, "invoke subagent"));
    const completed = events.find((e) => e.type === "tool.completed");
    expect(completed).toBeDefined();
    expect(completed && "output" in completed ? completed.output : "").toContain("spawned successfully");

    const child = manager.get("child-agent");
    expect(child).toBeDefined();
    expect(child?.systemInstructions).toBe("Help the parent.");
    expect(child?.allowedTools).toEqual(["read_file"]);
  });

  it("verifies sending messages back and forth between parent and child via the send_message tool", async () => {
    const manager = new SubagentManager();
    const parentRuntime = bootRuntime({ noSubstrate: true, subagentManager: manager, sessionId: "parent-agent" });
    parentRuntime.permissionDecider = async () => "allow";

    const child = manager.spawn({
      id: "child-agent",
      role: "helper",
      prompt: "Help the parent.",
      permissions: ["send_message"],
    }, parentRuntime);
    child.permissionDecider = async () => "allow";

    let parentReceived: any = null;
    parentRuntime.messageHandler = (msg) => {
      parentReceived = msg;
    };

    let childReceived: any = null;
    child.messageHandler = (msg) => {
      childReceived = msg;
    };

    // 1. Parent sends to child
    const parentProvider = toolProvider({
      type: "tool.requested",
      id: "tc-send-to-child",
      name: "send_message",
      args: {
        recipientId: "child-agent",
        content: "hello child",
      },
    });

    await collect(runTurn(parentRuntime, parentProvider, "send to child"));

    // Wait a tick for nextTick propagation
    await new Promise((resolve) => process.nextTick(resolve));

    expect(childReceived).not.toBeNull();
    expect(childReceived.senderId).toBe("parent-agent");
    expect(childReceived.content).toBe("hello child");

    // 2. Child sends to parent
    const childProvider = toolProvider({
      type: "tool.requested",
      id: "tc-send-to-parent",
      name: "send_message",
      args: {
        recipientId: "parent-agent",
        content: "hello parent",
      },
    });

    await collect(runTurn(child, childProvider, "send to parent"));

    // Wait a tick for nextTick propagation
    await new Promise((resolve) => process.nextTick(resolve));

    expect(parentReceived).not.toBeNull();
    expect(parentReceived.senderId).toBe("child-agent");
    expect(parentReceived.content).toBe("hello parent");
  });

  it("verifies preventing recursive depth > 2", async () => {
    const manager = new SubagentManager();
    const parentRuntime = bootRuntime({ noSubstrate: true, subagentManager: manager, sessionId: "A" });
    parentRuntime.permissionDecider = async () => "allow";

    // A (depth 0) spawns B (depth 1)
    const subagentB = manager.spawn({
      id: "B",
      role: "helper-b",
      prompt: "B prompt",
      permissions: ["invoke_subagent"],
    }, parentRuntime);
    subagentB.permissionDecider = async () => "allow";

    // B (depth 1) spawns C (depth 2)
    const subagentC = manager.spawn({
      id: "C",
      role: "helper-c",
      prompt: "C prompt",
      permissions: ["invoke_subagent"],
    }, subagentB);
    subagentC.permissionDecider = async () => "allow";

    expect(parentRuntime.subagentDepth).toBeUndefined();
    expect(subagentB.subagentDepth).toBe(1);
    expect(subagentC.subagentDepth).toBe(2);

    // C (depth 2) attempting to spawn D should fail
    const cProvider = toolProvider({
      type: "tool.requested",
      id: "tc-spawn-d",
      name: "invoke_subagent",
      args: {
        id: "D",
        role: "helper-d",
        prompt: "D prompt",
      },
    });

    const events = await collect(runTurn(subagentC, cProvider, "spawn D"));
    const completed = events.find((e) => e.type === "tool.completed");
    expect(completed).toBeDefined();
    expect(completed && "output" in completed ? completed.output : "").toContain("depth limit exceeded");
    
    // Also verify manager.spawn throws directly
    expect(() => {
      manager.spawn({
        id: "D2",
        role: "helper-d2",
        prompt: "D2 prompt",
        permissions: [],
      }, subagentC);
    }).toThrow("depth limit exceeded");
  });

  it("verifies enforcing max concurrency limit and rejecting when exceeded", async () => {
    // Instantiate manager with maxConcurrency = 2
    const manager = new SubagentManager(2);
    const parentRuntime = bootRuntime({ noSubstrate: true, subagentManager: manager });

    // Spawn 1
    manager.spawn({ id: "agent-1", role: "helper", prompt: "prompt", permissions: [] }, parentRuntime);
    // Spawn 2
    manager.spawn({ id: "agent-2", role: "helper", prompt: "prompt", permissions: [] }, parentRuntime);

    // Spawn 3 should fail
    expect(() => {
      manager.spawn({ id: "agent-3", role: "helper", prompt: "prompt", permissions: [] }, parentRuntime);
    }).toThrow("concurrency limit reached");
  });
});

function toolProvider(tool: Extract<RuntimeEvent, { type: "tool.requested" }>): Provider {
  return {
    id: "tool-provider",
    async *streamTurn(_request: any): AsyncIterable<RuntimeEvent> {
      yield { type: "turn.started", id: "turn-tool" };
      yield tool;
      yield { type: "assistant.completed", text: "done" };
      yield { type: "turn.completed" };
    },
  };
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}
