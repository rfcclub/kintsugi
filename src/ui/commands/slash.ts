export type SlashCommandName =
  | "always"
  | "approve"
  | "config"
  | "deny"
  | "doctor"
  | "exit"
  | "help"
  | "memory"
  | "model"
  | "new"
  | "remember"
  | "resume"
  | "stop"
  | "threads";

export type SlashParseResult =
  | { type: "not-command"; text: string }
  | { type: "prompt"; text: string }
  | { type: "command"; name: SlashCommandName; args: string[] }
  | { type: "error"; message: string };

const COMMANDS = new Set<SlashCommandName>([
  "always",
  "approve",
  "config",
  "deny",
  "doctor",
  "exit",
  "help",
  "memory",
  "model",
  "new",
  "remember",
  "resume",
  "stop",
  "threads",
]);

const REQUIRED_ARGS = new Set<SlashCommandName>(["resume"]);

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
