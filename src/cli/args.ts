import { type ProviderType } from "../providers/config.js";
import { parseProviderType } from "../providers/registry.js";
import { type MemoryActor, type MemoryEventKind, isMemoryActor, isMemoryEventKind } from "../memory/events.js";

export type CommandName = "ask" | "tui" | "threads" | "echo" | "boot" | "config" | "remember" | "help";

export interface ParsedArgs {
  command: CommandName;
  prompt?: string;
  substrate?: string;
  provider: ProviderType;
  providerExplicit: boolean;
  model?: string;
  modelProfile?: string;
  resume?: string;
  export?: string;
  noSubstrate: boolean;
  print: boolean;
  summary: boolean;
  initConfig: boolean;
  configShow: boolean;
  configDoctor: boolean;
  rememberKind?: MemoryEventKind;
  rememberActor?: MemoryActor;
  rememberLimit?: number;
  rememberLearned: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = [...argv];
  const parsed: ParsedArgs = {
    command: "tui",
    provider: "mock",
    providerExplicit: false,
    noSubstrate: false,
    print: false,
    summary: false,
    initConfig: false,
    configShow: false,
    configDoctor: false,
    rememberLearned: false,
  };

  const first = args[0];
  if (
    first === "ask" ||
    first === "tui" ||
    first === "threads" ||
    first === "echo" ||
    first === "boot" ||
    first === "config" ||
    first === "remember"
  ) {
    parsed.command = first;
    args.shift();
  } else if (first === "help" || first === "--help" || first === "-h") {
    parsed.command = "help";
    args.shift();
  }

  const promptParts: string[] = [];
  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) {
      continue;
    }

    if (arg === "--no-substrate") {
      parsed.noSubstrate = true;
      continue;
    }

    if (arg === "--substrate") {
      const value = args.shift();
      if (!value) {
        throw new Error("--substrate requires a path");
      }
      parsed.substrate = value;
      continue;
    }

    if (arg === "--provider") {
      const value = args.shift();
      if (!value) {
        throw new Error("--provider requires a value");
      }
      parsed.provider = parseProviderType(value);
      parsed.providerExplicit = true;
      continue;
    }

    if (arg === "--model") {
      const value = args.shift();
      if (!value) {
        throw new Error("--model requires a value");
      }
      parsed.model = value;
      continue;
    }

    if (arg === "--model-profile") {
      const value = args.shift();
      if (!value) {
        throw new Error("--model-profile requires a value");
      }
      parsed.modelProfile = value;
      continue;
    }

    if (arg === "--resume") {
      const value = args.shift();
      if (!value) {
        throw new Error("--resume requires a session id");
      }
      parsed.resume = value;
      continue;
    }

    if (arg === "--export") {
      const value = args.shift();
      if (!value) {
        throw new Error("--export requires a session id");
      }
      parsed.export = value;
      parsed.command = "threads";
      continue;
    }

    if (arg === "--print") {
      parsed.print = true;
      continue;
    }

    if (arg === "--summary") {
      parsed.summary = true;
      continue;
    }

    if (arg === "--kind" && parsed.command === "remember") {
      const value = args.shift();
      if (!isMemoryEventKind(value)) {
        throw new Error("--kind must be op, learn, echo, or note");
      }
      parsed.rememberKind = value;
      continue;
    }

    if (arg === "--actor" && parsed.command === "remember") {
      const value = args.shift();
      if (!isMemoryActor(value)) {
        throw new Error("--actor must be external, kintsugi, or kintsugi");
      }
      parsed.rememberActor = value;
      continue;
    }

    if (arg === "--limit" && parsed.command === "remember") {
      const raw = args.shift();
      const value = Number(raw);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("--limit must be a positive integer");
      }
      parsed.rememberLimit = value;
      continue;
    }

    if (arg === "--learned" && parsed.command === "remember") {
      parsed.rememberLearned = true;
      continue;
    }

    if (arg === "init" && parsed.command === "config") {
      parsed.initConfig = true;
      continue;
    }

    if (arg === "show" && parsed.command === "config") {
      parsed.configShow = true;
      continue;
    }

    if (arg === "doctor" && parsed.command === "config") {
      parsed.configDoctor = true;
      continue;
    }

    promptParts.push(arg);
  }

  if (promptParts.length > 0) {
    parsed.prompt = promptParts.join(" ");
    if (parsed.command === "tui") {
      parsed.command = "ask";
    }
  }

  if (parsed.summary && parsed.command !== "echo") {
    throw new Error("--summary is only valid with echo");
  }

  if (parsed.command === "config" && !parsed.initConfig && !parsed.configShow && !parsed.configDoctor) {
    throw new Error("config command requires: init, show, or doctor");
  }

  return parsed;
}
