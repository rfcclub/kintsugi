import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bootRuntime, handlePrompt, renderBoot } from "../src/runtime/runtime.js";
import { LearnedStore } from "../src/memory/learned-store.js";
import { OpsLog } from "../src/memory/ops-store.js";
import { reconstruct } from "../src/memory/reconstruct.js";
import { runTurn } from "../src/runtime/loop.js";
import type { Provider, ProviderTurnRequest } from "../src/providers/provider.js";
import type { RuntimeEvent } from "../src/protocol/events.js";

describe("kintsugi runtime", () => {
  it("boots without Echo when disabled", () => {
    const runtime = bootRuntime({ noSubstrate: true });

    expect(runtime.substrate).toBeUndefined();
    expect(renderBoot(runtime)).toContain("echo: not loaded");
  });

  it("handles a prompt without a provider backend", () => {
    const runtime = bootRuntime({ noSubstrate: true });

    expect(handlePrompt(runtime, "hello")).toContain(
      "no model/provider backend is attached yet"
    );
  });

  it("keeps configured workspace roots on runtime state", () => {
    const runtime = bootRuntime({
      noSubstrate: true,
      workspaceRoots: ["/tmp/kintsugi-root"],
    });

    expect(runtime.workspaceRoots).toEqual(["/tmp/kintsugi-root"]);
  });

  it("reconstructs shared memory on boot", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-runtime-memory-"));
    const ops = new OpsLog(dir);
    ops.log({ kind: "note", actor: "kintsugi", payload: { text: "hello" } });
    const learned = new LearnedStore({ memoryDir: dir });
    learned.set("tone", "warm");
    const memory = {
      ops,
      learned,
      reconstruct: () => reconstruct(memory),
    };

    const runtime = bootRuntime({ noSubstrate: true, memory, opsLog: ops });

    expect(runtime.memory).toBe(memory);
    expect(runtime.reconstructedMemory?.events).toHaveLength(1);
    expect(runtime.reconstructedMemory?.learned.tone).toBe("warm");
  });

  it("logs echo boot events with a content hash", () => {
    const memoryDir = mkdtempSync(join(tmpdir(), "kintsugi-runtime-echo-memory-"));
    const substrateDir = mkdtempSync(join(tmpdir(), "kintsugi-runtime-echo-"));
    writeFileSync(join(substrateDir, "PREFACE.md"), "Kintsugi Echo", "utf-8");
    mkdirSync(memoryDir, { recursive: true });
    const ops = new OpsLog(memoryDir);

    bootRuntime({ substrate: substrateDir, opsLog: ops });
    const events = ops.query({ kind: "echo", actor: "kintsugi" });

    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ path: substrateDir });
    expect(JSON.stringify(events[0].payload)).toContain("hash");
  });

  it("sends companion runtime-authored learned facts to provider messages", async () => {
    const runtime = bootRuntime({ noSubstrate: true });
    runtime.reconstructedMemory = {
      learned: {
        "user.prefers": "direct answers",
      },
      events: [
        {
          id: "oc-1",
          kind: "learn",
          actor: "external",
          payload: { key: "user.prefers", value: "direct answers" },
          at: "2026-05-23T10:00:00.000Z",
        },
      ],
      warnings: [],
    };
    let captured: ProviderTurnRequest | undefined;
    const provider: Provider = {
      id: "capture",
      async *streamTurn(request: ProviderTurnRequest): AsyncIterable<RuntimeEvent> {
        captured = request;
        yield { type: "assistant.completed", text: "done" };
      },
    };

    await collect(runTurn(runtime, provider, "hello"));

    const memoryMessage = captured?.messages.find((message) =>
      message.content.includes("user.prefers")
    );
    expect(memoryMessage?.role).toBe("system");
    expect(memoryMessage?.content).toContain("# Kintsugi Shared Memory");
    expect(memoryMessage?.content).toContain("- user.prefers: direct answers");
  });

  it("renders memory reconstruction counts on boot", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    runtime.reconstructedMemory = {
      events: [
        { id: "1", kind: "learn", actor: "external", payload: { key: "tone", value: "warm" }, at: "2026-05-23T10:00:00.000Z" },
      ],
      learned: { tone: "warm" },
      warnings: [{ message: "Malformed memory event JSON", line: 2 }],
    };

    const rendered = renderBoot(runtime);
    expect(rendered).toContain("memory path:");
    expect(rendered).toContain("memory events: 1");
    expect(rendered).toContain("learned facts: 1");
    expect(rendered).toContain("memory warnings: 1");
  });
});

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}
