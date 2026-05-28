import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { bootRuntime } from "../src/runtime/runtime.js";
import { assemblePrompt, summarizeEcho } from "../src/runtime/prompt.js";

describe("assemblePrompt", () => {
  it("assembles base and user layers without Echo", () => {
    const runtime = bootRuntime({ noSubstrate: true });

    const prompt = assemblePrompt(runtime, "hello");

    expect(prompt.layers.map((layer) => layer.name)).toEqual(["base", "user"]);
    expect(prompt.messages.at(-1)).toEqual({ role: "user", content: "hello" });
    expect(prompt.totalBytes).toBeGreaterThan(0);
  });

  it("includes Echo as an explicit system layer", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    runtime.substrate = { path: "echo", content: "Kintsugi Echo" };

    const prompt = assemblePrompt(runtime, "hello");

    expect(prompt.layers.map((layer) => layer.name)).toEqual([
      "base",
      "echo",
      "user",
    ]);
    expect(prompt.layers[1]).toMatchObject({
      role: "system",
      content: "Kintsugi Echo",
      truncated: false,
    });
  });

  it("truncates Echo at a boundary when over budget", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    runtime.substrate = {
      path: "echo",
      content: ["first section", "---", "second section is too long"].join("\n"),
    };

    const prompt = assemblePrompt(runtime, "hello", { echoBudget: 42 });
    const echo = prompt.layers.find((layer) => layer.name === "echo");

    expect(echo?.truncated).toBe(true);
    expect(echo?.content).toContain("[truncated:");
    expect(echo?.content).not.toContain("second section");
    expect(prompt.truncatedLayers).toEqual(["echo"]);
  });

  it("includes project context from a file", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kintsugi-prompt-"));
    const file = path.join(tempDir, "context.md");
    fs.writeFileSync(file, "Project context", "utf-8");
    const runtime = bootRuntime({ noSubstrate: true });

    const prompt = assemblePrompt(runtime, "hello", { projectPath: file });

    expect(prompt.layers.find((layer) => layer.name === "project")).toMatchObject({
      role: "system",
      content: "Project context",
    });
  });

  it("includes AGENTS and README from a project directory", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kintsugi-project-"));
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "Agent rules", "utf-8");
    fs.writeFileSync(path.join(tempDir, "README.md"), "Read me", "utf-8");
    const runtime = bootRuntime({ noSubstrate: true });

    const prompt = assemblePrompt(runtime, "hello", { projectPath: tempDir });
    const project = prompt.layers.find((layer) => layer.name === "project");

    expect(project?.content).toContain("# AGENTS.md");
    expect(project?.content).toContain("Agent rules");
    expect(project?.content).toContain("# README.md");
    expect(project?.content).toContain("Read me");
  });

  it("includes Kintsugi workspace identity context", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kintsugi-workspace-"));
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "Agent workspace rules", "utf-8");
    fs.writeFileSync(path.join(tempDir, "IDENTITY.md"), "Kintsugi identity", "utf-8");
    fs.writeFileSync(path.join(tempDir, "DREAMS.md"), "Too large for boot context", "utf-8");
    const runtime = bootRuntime({ noSubstrate: true });

    const prompt = assemblePrompt(runtime, "hello", { workspacePath: tempDir });
    const workspace = prompt.layers.find((layer) => layer.name === "workspace");

    expect(workspace?.role).toBe("system");
    expect(workspace?.content).toContain("# Kintsugi Workspace: AGENTS.md");
    expect(workspace?.content).toContain("Agent workspace rules");
    expect(workspace?.content).toContain("# Kintsugi Workspace: IDENTITY.md");
    expect(workspace?.content).toContain("Kintsugi identity");
    expect(workspace?.content).not.toContain("Too large for boot context");
  });

  it("can disable workspace context explicitly", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kintsugi-workspace-off-"));
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "Agent workspace rules", "utf-8");
    const runtime = bootRuntime({ noSubstrate: true });

    const prompt = assemblePrompt(runtime, "hello", {
      workspacePath: false,
    });

    expect(prompt.layers.map((layer) => layer.name)).not.toContain("workspace");
  });

  it("adds memory after workspace with learned facts sorted by key and recent notes", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kintsugi-workspace-memory-"));
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "Agent workspace rules", "utf-8");
    const runtime = bootRuntime({ noSubstrate: true });
    runtime.reconstructedMemory = {
      learned: {
        "tone.style": "compact",
        "user.prefers": "direct answers",
      },
      events: [
        {
          id: "note-1",
          kind: "note",
          actor: "external",
          payload: { text: "Kintsugi should keep replies compact." },
          at: "2026-05-23T10:01:00.000Z",
        },
      ],
      warnings: [],
    };

    const prompt = assemblePrompt(runtime, "hello", { workspacePath: tempDir });

    expect(prompt.layers.map((layer) => layer.name)).toEqual([
      "base",
      "workspace",
      "memory",
      "user",
    ]);
    const memory = prompt.layers.find((layer) => layer.name === "memory");
    expect(memory?.role).toBe("system");
    expect(memory?.content).toContain("# Kintsugi Shared Memory");
    expect(memory?.content).toContain("## Learned Facts");
    expect(memory?.content.indexOf("- tone.style: compact")).toBeLessThan(
      memory?.content.indexOf("- user.prefers: direct answers") ?? 0
    );
    expect(memory?.content).toContain("## Notes (most recent 1 of 8)");
    expect(memory?.content).toContain(
      "- 2026-05-23T10:01:00.000Z: Kintsugi should keep replies compact."
    );
  });

  it("bounds memory layer bytes and reports truncation in prompt trace", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    runtime.reconstructedMemory = {
      learned: {
        "alpha.fact": "A".repeat(80),
        "beta.fact": "B".repeat(80),
      },
      events: [],
      warnings: [],
    };

    const prompt = assemblePrompt(runtime, "hello", { memoryBudget: 72 });
    const memory = prompt.layers.find((layer) => layer.name === "memory");

    expect(memory?.truncated).toBe(true);
    expect(memory?.bytes).toBeLessThanOrEqual(72);
    expect(memory?.content).toContain("[truncated:");
    expect(prompt.truncatedLayers).toContain("memory");
  });

  it("adds a budgeted session state layer when prior messages exist", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    runtime.prompts.push({ role: "user", text: "older chatter", at: "1" });
    runtime.prompts.push({ role: "runtime", text: "pinned note", at: "2" });

    const prompt = assemblePrompt(runtime, "next", { sessionBudget: 80 });
    const session = prompt.layers.find((layer) => layer.name === "session");

    expect(session?.content).toContain("[Recent conversation]");
    expect(session?.content).toContain("runtime: pinned note");
  });

  it("does not include external context project context by default", () => {
    const runtime = bootRuntime({ noSubstrate: true });

    const prompt = assemblePrompt(runtime, "hello", {
      projectPath: "/codex-one/STATE.md",
    });

    expect(prompt.layers.map((layer) => layer.name)).not.toContain("project");
    expect(prompt.layers.some((layer) => layer.content.includes("external context"))).toBe(false);
  });
});

describe("summarizeEcho", () => {
  it("reports Echo file bytes and budget status", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kintsugi-echo-"));
    fs.writeFileSync(path.join(tempDir, "PREFACE.md"), "Preface", "utf-8");
    fs.writeFileSync(path.join(tempDir, "session.md"), "Session", "utf-8");
    const runtime = bootRuntime({ substrate: tempDir });

    const summary = summarizeEcho(runtime, { echoBudget: 1024 });

    expect(summary?.totalBytes).toBeGreaterThan(0);
    expect(summary?.budget).toBe(1024);
    expect(summary?.truncated).toBe(false);
    expect(summary?.files.map((file) => file.name)).toEqual([
      "PREFACE.md",
      "session.md",
    ]);
  });
});
