import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ProviderMessage } from "../providers/provider.js";
import type { RuntimeMessage } from "../protocol/messages.js";
import type { KintsugiRuntime } from "./session.js";

const DEFAULT_ECHO_BUDGET = 16 * 1024;
const DEFAULT_WORKSPACE_BUDGET = 64 * 1024;
const DEFAULT_MEMORY_BUDGET = 4 * 1024;
const DEFAULT_MEMORY_NOTE_LIMIT = 8;
const DEFAULT_PROJECT_BUDGET = 8 * 1024;
const DEFAULT_SESSION_BUDGET = 4 * 1024;
const DEFAULT_WORKSPACE_PATH = path.join(
  os.homedir(),
  ".config",
  "kintsugi",
  "workspace"
);
const DEFAULT_WORKSPACE_CONTEXT_FILES = [
  "AGENTS.md",
  "AGENTS_FIRST_RUN.md",
  "AGENTS_FULL.md",
  "AGENTS_MEMORY.md",
  "AGENTS_TOOLS.md",
  "IDENTITY.md",
  "SOUL.md",
  "MEMORY.md",
  "USER.md",
  "TOOLS.md",
  "SKILL.md",
  "HEARTBEAT.md",
  "TASK_INBOX.md",
  path.join("memory", "0_CONSTITUTION", "AXIOMS.md"),
  path.join("memory", "0_CONSTITUTION", "BOUNDARIES.md"),
  path.join("memory", "0_CONSTITUTION", "CREATOR_AUTHORITY.md"),
  path.join("memory", "0_CONSTITUTION", "PERMISSION_MATRIX.md"),
  path.join("memory", "1_IDENTITY", "IDENTITY_PROFILE.md"),
  path.join("memory", "1_IDENTITY", "UNCERTAINTY_MODEL.md"),
  path.join("memory", "1_IDENTITY", "VALUE_TRADEOFFS.md"),
  path.join("memory", "2_COGNITIVE", "DECISION_STYLE.md"),
  path.join("memory", "2_COGNITIVE", "HEURISTICS.md"),
  path.join("memory", "3_LEARNING", "SIGNALS.md"),
  path.join("memory", "4_OPERATIONAL", "MEMORY.md"),
];

const BASE_INSTRUCTIONS = `You are Kintsugi, running inside kintsugi.
Follow the user's instructions carefully.
Use tools when available and appropriate.
If you are unsure, ask for clarification.`;

export interface PromptLayer {
  name: string;
  role: ProviderMessage["role"];
  content: string;
  bytes: number;
  truncated: boolean;
}

export interface AssembledPrompt {
  messages: ProviderMessage[];
  layers: PromptLayer[];
  totalBytes: number;
  truncatedLayers: string[];
}

export interface PromptConfig {
  echoBudget?: number;
  workspaceBudget?: number;
  memoryBudget?: number;
  projectBudget?: number;
  sessionBudget?: number;
  projectPath?: string;
  workspacePath?: string | false;
  injectCodexOne?: boolean;
}

export interface EchoSummaryFile {
  name: string;
  bytes: number;
}

export interface EchoSummary {
  path: string;
  totalBytes: number;
  budget: number;
  truncated: boolean;
  truncatedBytes: number;
  files: EchoSummaryFile[];
}

export function assemblePrompt(
  runtime: KintsugiRuntime,
  userText: string,
  config: PromptConfig = {}
): AssembledPrompt {
  const layers: PromptLayer[] = [
    makeLayer("base", "system", runtime.systemInstructions ?? BASE_INSTRUCTIONS, false),
  ];

  if (runtime.substrate) {
    layers.push(
      makeBoundedLayer(
        "echo",
        "system",
        runtime.substrate.content,
        config.echoBudget ?? DEFAULT_ECHO_BUDGET
      )
    );
  }

  const pluginsDir = path.join(os.homedir(), ".config", "kintsugi", "plugins");
  if (fs.existsSync(pluginsDir)) {
    try {
      const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() || entry.isSymbolicLink()) {
          const pluginPath = path.join(pluginsDir, entry.name);
          const pluginContent = readPluginContent(pluginPath);
          if (pluginContent) {
            layers.push(
              makeBoundedLayer(
                `plugin:${entry.name}`,
                "system",
                pluginContent,
                32 * 1024
              )
            );
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  const workspaceContent = readWorkspaceContext(config.workspacePath);
  if (workspaceContent) {
    layers.push(
      makeBoundedLayer(
        "workspace",
        "system",
        workspaceContent,
        config.workspaceBudget ?? DEFAULT_WORKSPACE_BUDGET
      )
    );
  }

  const memoryContent = buildMemoryContext(runtime);
  if (memoryContent) {
    layers.push(
      makeBoundedLayer(
        "memory",
        "system",
        memoryContent,
        config.memoryBudget ?? DEFAULT_MEMORY_BUDGET
      )
    );
  }

  const projectContent = readProjectContext(config.projectPath, config.injectCodexOne);
  if (projectContent) {
    layers.push(
      makeBoundedLayer(
        "project",
        "system",
        projectContent,
        config.projectBudget ?? DEFAULT_PROJECT_BUDGET
      )
    );
  }

  const sessionContent = buildSessionState(runtime.prompts, config.sessionBudget);
  if (sessionContent) {
    layers.push(makeLayer("session", "system", sessionContent, false));
  }

  layers.push(makeLayer("user", "user", userText, false));

  return {
    messages: layers.map((layer) => ({
      role: layer.role,
      content: layer.content,
    })),
    layers,
    totalBytes: layers.reduce((total, layer) => total + layer.bytes, 0),
    truncatedLayers: layers
      .filter((layer) => layer.truncated)
      .map((layer) => layer.name),
  };
}

export function summarizeEcho(
  runtime: KintsugiRuntime,
  config: PromptConfig = {}
): EchoSummary | undefined {
  const substrate = runtime.substrate;
  if (!substrate) {
    return undefined;
  }

  const budget = config.echoBudget ?? DEFAULT_ECHO_BUDGET;
  const totalBytes = byteLength(substrate.content);
  const truncated = totalBytes > budget;

  return {
    path: substrate.path,
    totalBytes,
    budget,
    truncated,
    truncatedBytes: truncated
      ? byteLength(truncateAtBoundary(substrate.content, budget).content)
      : totalBytes,
    files: listEchoFiles(substrate.path, substrate.content),
  };
}

function makeLayer(
  name: string,
  role: ProviderMessage["role"],
  content: string,
  truncated: boolean
): PromptLayer {
  return {
    name,
    role,
    content,
    bytes: byteLength(content),
    truncated,
  };
}

function makeBoundedLayer(
  name: string,
  role: ProviderMessage["role"],
  content: string,
  budget: number
): PromptLayer {
  const bounded = truncateAtBoundary(content, budget);
  return makeLayer(name, role, bounded.content, bounded.truncated);
}

function truncateAtBoundary(
  content: string,
  budget: number
): { content: string; truncated: boolean } {
  if (byteLength(content) <= budget) {
    return { content, truncated: false };
  }

  const notice = `[truncated: ${byteLength(content)} -> ${budget} bytes]`;
  const contentBudget = Math.max(0, budget - byteLength(`\n\n${notice}`));
  const prefix = sliceBytes(content, contentBudget);
  const boundaryIndex = prefix.lastIndexOf("---");
  const truncated = (boundaryIndex >= 0 ? prefix.slice(0, boundaryIndex) : prefix).trim();

  return {
    content: `${truncated}\n\n${notice}`,
    truncated: true,
  };
}

function readWorkspaceContext(workspacePath: string | false | undefined): string | undefined {
  if (workspacePath === false) {
    return undefined;
  }

  const configured =
    workspacePath ?? process.env.KINTSUGI_WORKSPACE ?? DEFAULT_WORKSPACE_PATH;
  const resolved = resolveUserPath(configured);
  if (!fs.existsSync(resolved)) {
    return undefined;
  }

  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    return fs.readFileSync(resolved, "utf-8").trim();
  }
  if (!stat.isDirectory()) {
    return undefined;
  }

  const blocks = DEFAULT_WORKSPACE_CONTEXT_FILES.flatMap((relativePath) => {
    const file = path.join(resolved, relativePath);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return [];
    }
    const content = fs.readFileSync(file, "utf-8").trim();
    if (!content) {
      return [];
    }
    return [
      [
        `# Kintsugi Workspace: ${relativePath.replace(/\\/g, "/")}`,
        "",
        content,
      ].join("\n"),
    ];
  });

  return blocks.length > 0 ? blocks.join("\n\n---\n\n") : undefined;
}

function readProjectContext(
  projectPath: string | undefined,
  injectCodexOne: boolean | undefined
): string | undefined {
  if (!projectPath) {
    return undefined;
  }

  const resolved = path.resolve(projectPath);
  if (!injectCodexOne && resolved.includes(`${path.sep}codex-one`)) {
    return undefined;
  }

  if (!fs.existsSync(resolved)) {
    return undefined;
  }

  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    return fs.readFileSync(resolved, "utf-8").trim();
  }

  if (!stat.isDirectory()) {
    return undefined;
  }

  const files = ["AGENTS.md", "README.md"]
    .map((file) => path.join(resolved, file))
    .filter((file) => fs.existsSync(file) && fs.statSync(file).isFile());

  if (files.length === 0) {
    return undefined;
  }

  return files
    .map((file) => [`# ${path.basename(file)}`, "", fs.readFileSync(file, "utf-8").trim()].join("\n"))
    .join("\n\n---\n\n");
}

function resolveUserPath(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return path.resolve(value);
}

function buildMemoryContext(runtime: KintsugiRuntime): string | undefined {
  const reconstructed = runtime.reconstructedMemory;
  if (!reconstructed) {
    return undefined;
  }

  const lines = ["# Kintsugi Shared Memory", ""];
  const learned = Object.entries(reconstructed.learned).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  if (learned.length > 0) {
    lines.push("## Learned Facts");
    for (const [key, value] of learned) {
      lines.push(`- ${key}: ${value}`);
    }
    lines.push("");
  }

  const notes = reconstructed.events
    .flatMap((event) => {
      if (event.kind !== "note" || !isNotePayload(event.payload)) {
        return [];
      }
      return [{ at: event.at, text: event.payload.text }];
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, DEFAULT_MEMORY_NOTE_LIMIT);
  if (notes.length > 0) {
    lines.push(`## Notes (most recent ${notes.length} of ${DEFAULT_MEMORY_NOTE_LIMIT})`);
    for (const note of notes) {
      lines.push(`- ${note.at}: ${note.text}`);
    }
  }

  return learned.length > 0 || notes.length > 0 ? lines.join("\n").trim() : undefined;
}

function isNotePayload(payload: unknown): payload is { text: string } {
  return (
    Boolean(payload) &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    typeof (payload as { text?: unknown }).text === "string"
  );
}

function buildSessionState(
  prompts: RuntimeMessage[],
  sessionBudget = DEFAULT_SESSION_BUDGET
): string | undefined {
  if (prompts.length <= 1) {
    return undefined;
  }

  const prioritized = [...prompts].reverse().sort((a, b) => {
    return messagePriority(b) - messagePriority(a);
  });
  const selected: RuntimeMessage[] = [];
  let used = byteLength("[Recent conversation]\n");

  for (const message of prioritized) {
    const line = formatSessionMessage(message);
    const lineBytes = byteLength(`${line}\n`);
    if (used + lineBytes > sessionBudget) {
      continue;
    }
    selected.push(message);
    used += lineBytes;
  }

  if (selected.length === 0) {
    return undefined;
  }

  return ["[Recent conversation]", ...selected.map(formatSessionMessage)].join("\n");
}

function messagePriority(message: RuntimeMessage): number {
  if (message.role === "runtime" || message.role === "tool") {
    return 2;
  }
  if (message.role === "assistant") {
    return 1;
  }
  return 0;
}

function formatSessionMessage(message: RuntimeMessage): string {
  return `${message.role}: ${message.text}`;
}

function listEchoFiles(substratePath: string, content: string): EchoSummaryFile[] {
  if (!fs.existsSync(substratePath) || !fs.statSync(substratePath).isDirectory()) {
    return [{ name: path.basename(substratePath), bytes: byteLength(content) }];
  }

  return fs
    .readdirSync(substratePath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const filePath = path.join(substratePath, entry.name);
      return {
        name: entry.name,
        bytes: byteLength(fs.readFileSync(filePath, "utf-8").trim()),
      };
    });
}

function sliceBytes(content: string, bytes: number): string {
  return Buffer.from(content, "utf-8").subarray(0, bytes).toString("utf-8");
}

function byteLength(content: string): number {
  return Buffer.byteLength(content, "utf-8");
}

function readPluginContent(pluginPath: string): string {
  const mdFiles: string[] = [];
  const findMd = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") {
        findMd(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        mdFiles.push(fullPath);
      }
    }
  };
  findMd(pluginPath);

  return mdFiles
    .map((filePath) => {
      const relPath = path.relative(pluginPath, filePath);
      const content = fs.readFileSync(filePath, "utf-8").trim();
      return [`# Plugin Skill: ${relPath}`, "", content].join("\n");
    })
    .join("\n\n---\n\n")
    .trim();
}
