export type CommandAvailability = "available" | "contextual" | "planned";

export type OverlayCommandName =
  | "help"
  | "model"
  | "config"
  | "doctor"
  | "memory"
  | "mode"
  | "provider"
  | "threads"
  | "status"
  | "version"
  | "export";

export interface CommandInfo {
  name: OverlayCommandName;
  usage: `/${string}`;
  title: string;
  summary: string;
  availability: CommandAvailability;
  availabilityText: string;
  placeholder: string;
}

export const OVERLAY_COMMAND_NAMES = [
  "help", "model", "config", "doctor", "memory", "mode", "provider", "threads", "status", "version", "export",
] as const;

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
  mode: {
    name: "mode",
    usage: "/mode",
    title: "Mode",
    summary: "Show or switch interaction mode: auto, approve, plan.",
    availability: "available",
    availabilityText: "available",
    placeholder: "Interaction mode will appear here.",
  },
  provider: {
    name: "provider",
    usage: "/provider",
    title: "Provider",
    summary: "Show provider status or register a custom provider (/provider add).",
    availability: "available",
    availabilityText: "available",
    placeholder: "Provider status will appear here once the parent provides it.",
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
  status: {
    name: "status",
    usage: "/status",
    title: "Status",
    summary: "Show runtime status: session, provider, model, tools, permissions.",
    availability: "available",
    availabilityText: "available",
    placeholder: "Runtime status will appear here.",
  },
  version: {
    name: "version",
    usage: "/version",
    title: "Version",
    summary: "Show Kintsugi version and build info.",
    availability: "available",
    availabilityText: "available",
    placeholder: "Version info will appear here.",
  },
  export: {
    name: "export",
    usage: "/export",
    title: "Export",
    summary: "Export a session transcript as Markdown.",
    availability: "contextual",
    availabilityText: "needs session id",
    placeholder: "Exported transcript will appear here.",
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
