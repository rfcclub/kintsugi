export type SlashCommandName =
  | "always"
  | "approve"
  | "clear"
  | "config"
  | "deny"
  | "doctor"
  | "exit"
  | "export"
  | "help"
  | "memory"
  | "mode"
  | "model"
  | "new"
  | "plugin"
  | "provider"
  | "remember"
  | "rename"
  | "resume"
  | "status"
  | "stop"
  | "threads"
  | "version";

export type SlashParseResult =
  | { type: "not-command"; text: string }
  | { type: "prompt"; text: string }
  | { type: "command"; name: SlashCommandName; args: string[] }
  | { type: "error"; message: string };

const COMMANDS = new Set<SlashCommandName>([
  "always",
  "approve",
  "clear",
  "config",
  "deny",
  "doctor",
  "exit",
  "export",
  "help",
  "memory",
  "mode",
  "model",
  "new",
  "plugin",
  "provider",
  "remember",
  "rename",
  "resume",
  "status",
  "stop",
  "threads",
  "version",
]);

const REQUIRED_ARGS = new Set<SlashCommandName>(["resume", "rename", "export", "plugin"]);

export function parseSlashCommand(input: string): SlashParseResult {
  const trimmedStart = input.trimStart();
  if (!trimmedStart.startsWith("/")) {
    return { type: "not-command", text: input };
  }

  if (trimmedStart.startsWith("//")) {
    return { type: "prompt", text: trimmedStart.slice(1) };
  }

  const withoutSlash = trimmedStart.slice(1).trim();
  if (!withoutSlash) {
    return { type: "error", message: "Slash command is empty. Try /help." };
  }

  const [rawName, ...args] = withoutSlash.split(/\s+/);
  const name = rawName.toLowerCase();
  if (!isSlashCommandName(name)) {
    return { type: "error", message: `Unknown command: /${rawName}` };
  }

  if (REQUIRED_ARGS.has(name) && args.length === 0) {
    return { type: "error", message: `/${name} requires an argument.` };
  }

  return { type: "command", name, args };
}

export function isSlashCommandName(value: string): value is SlashCommandName {
  return COMMANDS.has(value as SlashCommandName);
}
