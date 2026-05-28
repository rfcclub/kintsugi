export type MemoryEventKind = "op" | "learn" | "echo" | "note";
export type MemoryActor = "external" | "kintsugi" | "kintsugi";

export interface MemoryEvent {
  id: string;
  kind: MemoryEventKind;
  actor: MemoryActor;
  payload: unknown;
  at: string;
}

export interface LearnPayload {
  key: string;
  value: string;
}

export interface NotePayload {
  text: string;
}

export interface EchoPayload {
  path: string;
  hash?: string;
}

export interface MemoryEventWarning {
  line: number;
  reason: string;
}

export type MemoryEventValidationResult =
  | { ok: true; event: MemoryEvent }
  | { ok: false; warning: MemoryEventWarning };

const MEMORY_EVENT_KINDS = new Set<MemoryEventKind>(["op", "learn", "echo", "note"]);
const MEMORY_ACTORS = new Set<MemoryActor>(["external", "kintsugi", "kintsugi"]);

export function isMemoryEventKind(value: unknown): value is MemoryEventKind {
  return typeof value === "string" && MEMORY_EVENT_KINDS.has(value as MemoryEventKind);
}

export function isMemoryActor(value: unknown): value is MemoryActor {
  return typeof value === "string" && MEMORY_ACTORS.has(value as MemoryActor);
}

export function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isMemoryEvent(value: unknown): value is MemoryEvent {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    isMemoryEventKind(value.kind) &&
    isMemoryActor(value.actor) &&
    isIsoTimestamp(value.at) &&
    "payload" in value
  );
}

export function isLearnPayload(value: unknown): value is LearnPayload {
  return isRecord(value) && typeof value.key === "string" && typeof value.value === "string";
}

export function isNotePayload(value: unknown): value is NotePayload {
  return isRecord(value) && (value.text === undefined || typeof value.text === "string");
}

export function isEchoPayload(value: unknown): value is EchoPayload {
  return (
    isRecord(value) &&
    (value.path === undefined || typeof value.path === "string") &&
    (value.hash === undefined || typeof value.hash === "string")
  );
}

export function isOpPayload(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

export function isMemoryPayload(kind: MemoryEventKind, payload: unknown): boolean {
  switch (kind) {
    case "learn":
      return isLearnPayload(payload);
    case "note":
      return isNotePayload(payload);
    case "echo":
      return isEchoPayload(payload);
    case "op":
      return isOpPayload(payload);
  }
}

export function validateMemoryEvent(value: unknown, line = 1): MemoryEventValidationResult {
  if (!isRecord(value)) {
    return invalid(line, "event must be an object");
  }
  if (typeof value.id !== "string") {
    return invalid(line, "event id must be a string");
  }
  if (!isMemoryEventKind(value.kind)) {
    return invalid(line, "event kind is unsupported");
  }
  if (!isMemoryActor(value.actor)) {
    return invalid(line, "event actor is unsupported");
  }
  if (!isIsoTimestamp(value.at)) {
    return invalid(line, "event timestamp is invalid");
  }
  if (!isMemoryPayload(value.kind, value.payload)) {
    return invalid(line, `${value.kind} payload is invalid`);
  }
  return {
    ok: true,
    event: {
      id: value.id,
      kind: value.kind,
      actor: value.actor,
      payload: value.payload,
      at: value.at,
    },
  };
}

export function parseMemoryEventLine(lineText: string, line = 1): MemoryEventValidationResult {
  try {
    const parsed = JSON.parse(lineText);
    if (!isMemoryEvent(parsed)) {
      return invalid(line, "Invalid memory event shape");
    }
    return { ok: true, event: parsed };
  } catch {
    return invalid(line, "Malformed memory event JSON");
  }
}

export function parseMemoryEventLines(content: string): {
  events: MemoryEvent[];
  warnings: MemoryEventWarning[];
} {
  const events: MemoryEvent[] = [];
  const warnings: MemoryEventWarning[] = [];
  const lines = content.split("\n");

  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    const result = parseMemoryEventLine(line, index + 1);
    if (result.ok) {
      events.push(result.event);
    } else {
      warnings.push(result.warning);
    }
  }

  return { events, warnings };
}

function invalid(line: number, reason: string): MemoryEventValidationResult {
  return { ok: false, warning: { line, reason } };
}
