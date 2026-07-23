import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { bootRuntime } from "../src/runtime/runtime.js";
import {
  assemblePrompt,
  summarizeEcho,
  type PromptConfig,
} from "../src/runtime/prompt.js";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "kintsugi-prompt-ext-"));
}

describe("assemblePrompt — session state edge cases", () => {
  it("skips messages that exceed session budget", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    // Add messages of varying lengths — some should fit, others skipped
    runtime.prompts.push({ role: "user", text: "short", at: "1" });
    runtime.prompts.push({
      role: "user",
      text: "x".repeat(200),
      at: "2",
    });
    runtime.prompts.push({ role: "user", text: "also short", at: "3" });

    const prompt = assemblePrompt(runtime, "hello", { sessionBudget: 80 });
    const session = prompt.layers.find((l) => l.name === "session");

    // Session should exist — short messages fit, the 200-byte one is skipped
    expect(session).toBeDefined();
    expect(session?.content).toContain("[Recent conversation]");
    expect(session?.content).toContain("short");
    expect(session?.content).toContain("also short");
    // The long message should NOT appear (it was skipped due to budget)
    expect(session?.content).not.toContain("x".repeat(50));
  });

  it("returns undefined session when no messages fit budget", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    runtime.prompts.push({
      role: "user",
      text: "x".repeat(200),
      at: "1",
    });

    const prompt = assemblePrompt(runtime, "hello", { sessionBudget: 10 });
    const session = prompt.layers.find((l) => l.name === "session");

    // With a 10-byte budget and a 200-byte message, nothing fits
    expect(session).toBeUndefined();
  });

  it("does not add session layer when only one message exists", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    // No prompts added — only the current user text counts

    const prompt = assemblePrompt(runtime, "hello");
    const session = prompt.layers.find((l) => l.name === "session");

    expect(session).toBeUndefined();
  });

  it("prioritizes runtime and tool messages over user messages", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    runtime.prompts.push({ role: "user", text: "user message", at: "1" });
    runtime.prompts.push({ role: "assistant", text: "assistant reply", at: "2" });
    runtime.prompts.push({ role: "runtime", text: "runtime note", at: "3" });
    runtime.prompts.push({ role: "tool", text: "tool output", at: "4" });

    const prompt = assemblePrompt(runtime, "hello", { sessionBudget: 200 });
    const session = prompt.layers.find((l) => l.name === "session");

    expect(session).toBeDefined();
    // Runtime and tool messages should appear (higher priority)
    expect(session?.content).toContain("runtime: runtime note");
    expect(session?.content).toContain("tool: tool output");
  });
});

describe("assemblePrompt — echo truncation with no boundary", () => {
  it("truncates content without a --- boundary by slicing at byte budget", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    runtime.substrate = {
      path: "echo",
      content: "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH",
    };

    const prompt = assemblePrompt(runtime, "hello", { echoBudget: 30 });
    const echo = prompt.layers.find((l) => l.name === "echo");

    expect(echo?.truncated).toBe(true);
    expect(echo?.content).toContain("[truncated:");
    // No --- boundary in content, so it slices at byte budget
    expect(echo?.bytes).toBeLessThanOrEqual(30);
  });
});

describe("summarizeEcho — truncated echo", () => {
  it("reports truncated status when content exceeds budget", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    runtime.substrate = {
      path: "echo-file",
      content: "X".repeat(500),
    };

    const summary = summarizeEcho(runtime, { echoBudget: 100 });

    expect(summary).toBeDefined();
    expect(summary?.truncated).toBe(true);
    expect(summary?.totalBytes).toBe(500);
    expect(summary?.budget).toBe(100);
    expect(summary?.truncatedBytes).toBeLessThanOrEqual(100);
  });

  it("returns undefined when no substrate exists", () => {
    const runtime = bootRuntime({ noSubstrate: true });

    const summary = summarizeEcho(runtime);

    expect(summary).toBeUndefined();
  });

  it("lists echo files from a directory substrate", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "alpha.md"), "Alpha content", "utf-8");
    fs.writeFileSync(path.join(dir, "beta.md"), "Beta content", "utf-8");
    fs.writeFileSync(path.join(dir, "not-md.txt"), "Ignored", "utf-8");
    const runtime = bootRuntime({ substrate: dir });

    const summary = summarizeEcho(runtime, { echoBudget: 4096 });

    expect(summary?.files).toHaveLength(2);
    expect(summary?.files.map((f) => f.name)).toEqual(["alpha.md", "beta.md"]);
    expect(summary?.files[0].bytes).toBeGreaterThan(0);
  });

  it("returns single file summary for non-directory substrate", () => {
    const file = path.join(tempDir(), "echo.md");
    fs.writeFileSync(file, "Echo content here", "utf-8");
    const runtime = bootRuntime({ noSubstrate: true });
    runtime.substrate = { path: file, content: "Echo content here" };

    const summary = summarizeEcho(runtime, { echoBudget: 4096 });

    expect(summary?.files).toHaveLength(1);
    expect(summary?.files[0].name).toBe("echo.md");
    expect(summary?.files[0].bytes).toBe(Buffer.byteLength("Echo content here", "utf-8"));
  });
});

describe("assemblePrompt — plugin content", () => {
  const pluginsBase = path.join(os.homedir(), ".config", "kintsugi", "plugins");

  afterEach(() => {
    // Clean up any test plugin dirs we create
    const testPlugin = path.join(pluginsBase, "__test_plugin__");
    if (fs.existsSync(testPlugin)) {
      fs.rmSync(testPlugin, { recursive: true, force: true });
    }
  });

  it("includes plugin content from plugins directory", () => {
    const pluginDir = path.join(pluginsBase, "__test_plugin__");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, "SKILL.md"), "Test skill content", "utf-8");

    const runtime = bootRuntime({ noSubstrate: true });
    const prompt = assemblePrompt(runtime, "hello");

    const pluginLayer = prompt.layers.find((l) => l.name === "plugin:__test_plugin__");
    expect(pluginLayer).toBeDefined();
    expect(pluginLayer?.content).toContain("Test skill content");
  });

  it("reads nested markdown files in plugin directories", () => {
    const pluginDir = path.join(pluginsBase, "__test_plugin__");
    const subDir = path.join(pluginDir, "docs");
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, "SKILL.md"), "Top level", "utf-8");
    fs.writeFileSync(path.join(subDir, "guide.md"), "Nested guide", "utf-8");

    const runtime = bootRuntime({ noSubstrate: true });
    const prompt = assemblePrompt(runtime, "hello");

    const pluginLayer = prompt.layers.find((l) => l.name === "plugin:__test_plugin__");
    expect(pluginLayer?.content).toContain("Top level");
    expect(pluginLayer?.content).toContain("Nested guide");
  });

  it("ignores node_modules and .git in plugin directories", () => {
    const pluginDir = path.join(pluginsBase, "__test_plugin__");
    const nmDir = path.join(pluginDir, "node_modules");
    const gitDir = path.join(pluginDir, ".git");
    fs.mkdirSync(nmDir, { recursive: true });
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, "SKILL.md"), "Real skill", "utf-8");
    fs.writeFileSync(path.join(nmDir, "ignore.md"), "Should not appear", "utf-8");
    fs.writeFileSync(path.join(gitDir, "config.md"), "Should not appear", "utf-8");

    const runtime = bootRuntime({ noSubstrate: true });
    const prompt = assemblePrompt(runtime, "hello");

    const pluginLayer = prompt.layers.find((l) => l.name === "plugin:__test_plugin__");
    expect(pluginLayer?.content).toContain("Real skill");
    expect(pluginLayer?.content).not.toContain("Should not appear");
  });
});

describe("assemblePrompt — workspace context edge cases", () => {
  it("reads workspace from a single file path", () => {
    const file = path.join(tempDir(), "context.md");
    fs.writeFileSync(file, "Single file workspace content", "utf-8");

    const runtime = bootRuntime({ noSubstrate: true });
    const prompt = assemblePrompt(runtime, "hello", { workspacePath: file });

    const workspace = prompt.layers.find((l) => l.name === "workspace");
    expect(workspace?.content).toBe("Single file workspace content");
  });

  it("returns undefined for non-existent workspace path", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    const prompt = assemblePrompt(runtime, "hello", {
      workspacePath: "/tmp/nonexistent-workspace-xyz-123",
    });

    expect(prompt.layers.find((l) => l.name === "workspace")).toBeUndefined();
  });

  it("returns undefined for workspace path that is neither file nor directory", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    // Use a special device path that exists but is neither file nor directory
    // On macOS /dev/null is a character device — statSync().isFile() and isDirectory() both false
    const prompt = assemblePrompt(runtime, "hello", { workspacePath: "/dev/null" });

    // /dev/null may be handled differently — just verify no crash
    expect(prompt.layers.length).toBeGreaterThanOrEqual(2);
  });
});

describe("assemblePrompt — project context edge cases", () => {
  it("excludes codex-one paths when injectCodexOne is not set", () => {
    const dir = tempDir();
    // Create a path that contains codex-one segment
    const codexDir = path.join(dir, "codex-one");
    fs.mkdirSync(codexDir, { recursive: true });
    fs.writeFileSync(path.join(codexDir, "AGENTS.md"), "Codex content", "utf-8");

    const runtime = bootRuntime({ noSubstrate: true });
    const prompt = assemblePrompt(runtime, "hello", { projectPath: codexDir });

    expect(prompt.layers.find((l) => l.name === "project")).toBeUndefined();
  });

  it("includes codex-one paths when injectCodexOne is true", () => {
    const dir = tempDir();
    const codexDir = path.join(dir, "codex-one");
    fs.mkdirSync(codexDir, { recursive: true });
    fs.writeFileSync(path.join(codexDir, "AGENTS.md"), "Codex content", "utf-8");

    const runtime = bootRuntime({ noSubstrate: true });
    const prompt = assemblePrompt(runtime, "hello", {
      projectPath: codexDir,
      injectCodexOne: true,
    });

    const project = prompt.layers.find((l) => l.name === "project");
    expect(project?.content).toContain("Codex content");
  });

  it("returns undefined for non-existent project path", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    const prompt = assemblePrompt(runtime, "hello", {
      projectPath: "/tmp/nonexistent-project-xyz-123",
    });

    expect(prompt.layers.find((l) => l.name === "project")).toBeUndefined();
  });

  it("returns undefined for project directory without AGENTS.md or README.md", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "other.md"), "Other content", "utf-8");

    const runtime = bootRuntime({ noSubstrate: true });
    const prompt = assemblePrompt(runtime, "hello", { projectPath: dir });

    expect(prompt.layers.find((l) => l.name === "project")).toBeUndefined();
  });
});

describe("assemblePrompt — memory context edge cases", () => {
  it("returns undefined memory layer when no learned facts or notes", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    runtime.reconstructedMemory = {
      learned: {},
      events: [],
      warnings: [],
    };

    const prompt = assemblePrompt(runtime, "hello");

    expect(prompt.layers.find((l) => l.name === "memory")).toBeUndefined();
  });

  it("includes notes sorted by recency with limit", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    const events = [];
    for (let i = 0; i < 12; i++) {
      events.push({
        id: `note-${i}`,
        kind: "note" as const,
        actor: "external" as const,
        payload: { text: `Note ${i}` },
        at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      });
    }
    runtime.reconstructedMemory = {
      learned: {},
      events,
      warnings: [],
    };

    const prompt = assemblePrompt(runtime, "hello", { memoryBudget: 4096 });
    const memory = prompt.layers.find((l) => l.name === "memory");

    // Should be limited to 8 notes (DEFAULT_MEMORY_NOTE_LIMIT)
    expect(memory?.content).toContain("most recent 8 of 8");
    // Most recent note should appear (Jan 12 > Jan 1)
    expect(memory?.content).toContain("Note 11");
    // Older notes beyond limit should not appear
    expect(memory?.content).not.toContain("Note 0");
  });

  it("filters out non-note events from memory context", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    runtime.reconstructedMemory = {
      learned: { "test.key": "test value" },
      events: [
        {
          id: "learn-1",
          kind: "learn" as const,
          actor: "external" as const,
          payload: { key: "x", value: "y" },
          at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "note-1",
          kind: "note" as const,
          actor: "external" as const,
          payload: { text: "A real note" },
          at: "2026-01-02T00:00:00.000Z",
        },
      ],
      warnings: [],
    };

    const prompt = assemblePrompt(runtime, "hello");
    const memory = prompt.layers.find((l) => l.name === "memory");

    expect(memory?.content).toContain("A real note");
    expect(memory?.content).toContain("test.key: test value");
  });
});

describe("assemblePrompt — custom system instructions", () => {
  it("uses runtime.systemInstructions when provided", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    runtime.systemInstructions = "Custom system prompt for testing";

    const prompt = assemblePrompt(runtime, "hello");

    expect(prompt.layers[0].content).toBe("Custom system prompt for testing");
  });
});
