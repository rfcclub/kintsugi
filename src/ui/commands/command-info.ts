export type CommandAvailability = "available" | "contextual" | "planned";

export type OverlayCommandName = "help" | "model" | "config" | "doctor" | "memory" | "threads";

export interface CommandInfo {
  name: OverlayCommandName;
  usage: `/${string}`;
  title: string;
  summary: string;
  availability: CommandAvailability;
  availabilityText: string;
  placeholder: string;
}

export const OVERLAY_COMMAND_NAMES = ["help", "model", "config", "doctor", "memory", "threads"] as const;

export const COMMAND_INFO: Record<OverlayCommandName, CommandInfo> = {
  help: {
    name: "help",
    usage: "/help",
    title: "Help",
    summary: "Show command help and availability.",
    availability: "available",
    availabilityText: "available",
    placeholder: "Command help is available.",
  },
  model: {
    name: "model",
    usage: "/model",
    title: "Model",
    summary: "Show active model and configured model profiles.",
    availability: "available",
    availabilityText: "available",
    placeholder: "Model profile summary will appear here once the parent provides it.",
  },
  config: {
    name: "config",
    usage: "/config",
    title: "Config",
    summary: "Show resolved provider, model, substrate, and permission settings.",
    availability: "contextual",
    availabilityText: "needs parent content",
    placeholder: "Config summary will appear here once the parent provides it.",
  },
  doctor: {
    name: "doctor",
    usage: "/doctor",
    title: "Doctor",
    summary: "Show configuration and environment checks.",
    availability: "contextual",
    availabilityText: "needs parent content",
    placeholder: "Doctor checks will appear here once the parent provides them.",
  },
  memory: {
    name: "memory",
    usage: "/memory",
    title: "Memory",
    summary: "Show shared memory activity and reconstruction notes.",
    availability: "contextual",
    availabilityText: "needs parent content",
    placeholder: "Memory events will appear here once the parent provides them.",
  },
  threads: {
    name: "threads",
    usage: "/threads",
    title: "Threads",
    summary: "Show recent sessions and resume/export hints.",
    availability: "contextual",
    availabilityText: "needs parent content",
    placeholder: "Thread summaries will appear here once the parent provides them.",
  },
};

export function listCommandInfo(): CommandInfo[] {
  return OVERLAY_COMMAND_NAMES.map((name) => COMMAND_INFO[name]);
}

export function getCommandInfo(name: string): CommandInfo | undefined {
  return isOverlayCommandName(name) ? COMMAND_INFO[name] : undefined;
}

export function isOverlayCommandName(name: string): name is OverlayCommandName {
  return (OVERLAY_COMMAND_NAMES as readonly string[]).includes(name);
}

export function formatAvailability(availability: CommandAvailability): string {
  if (availability === "available") return "available";
  if (availability === "contextual") return "contextual";
  return "planned";
}
