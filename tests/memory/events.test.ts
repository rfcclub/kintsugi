import { describe, expect, it } from "vitest";
import {
  validateMemoryEvent,
  parseMemoryEventLine,
  parseMemoryEventLines,
  isMemoryEvent,
  isLearnPayload,
  isNotePayload,
  isEchoPayload,
  isOpPayload,
  isMemoryPayload,
  isMemoryEventKind,
  isMemoryActor,
  isIsoTimestamp,
  isRecord,
  type MemoryEvent,
} from "../../src/memory/events.js";

function makeValidEvent(): Record<string, unknown> {
  return {
    id: "evt-1",
    kind: "learn",
    actor: "external",
    at: new Date().toISOString(),
    payload: { key: "color", value: "blue" },
  };
}

describe("validateMemoryEvent", () => {
  it("validates a correct event", () => {
    const result = validateMemoryEvent(makeValidEvent());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.id).toBe("evt-1");
      expect(result.event.kind).toBe("learn");
    }
  });

  it("rejects non-object input", () => {
    const result = validateMemoryEvent("not-an-object");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.reason).toBe("event must be an object");
    }
  });

  it("rejects missing id", () => {
    const event = makeValidEvent();
    delete event.id;
    const result = validateMemoryEvent(event);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.reason).toBe("event id must be a string");
    }
  });

  it("rejects invalid kind", () => {
    const event = makeValidEvent();
    event.kind = "unknown-kind";
    const result = validateMemoryEvent(event);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.reason).toBe("event kind is unsupported");
    }
  });

  it("rejects invalid actor", () => {
    const event = makeValidEvent();
    event.actor = "unknown-actor";
    const result = validateMemoryEvent(event);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.reason).toBe("event actor is unsupported");
    }
  });

  it("rejects invalid timestamp", () => {
    const event = makeValidEvent();
    event.at = "not-a-date";
    const result = validateMemoryEvent(event);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.reason).toBe("event timestamp is invalid");
    }
  });

  it("rejects invalid payload for kind", () => {
    const event = makeValidEvent();
    event.payload = { wrong: "shape" };
    const result = validateMemoryEvent(event);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.reason).toBe("learn payload is invalid");
    }
  });

  it("validates note events", () => {
    const event = makeValidEvent();
    event.kind = "note";
    event.payload = { text: "hello world" };
    const result = validateMemoryEvent(event);
    expect(result.ok).toBe(true);
  });

  it("validates echo events", () => {
    const event = makeValidEvent();
    event.kind = "echo";
    event.payload = { path: "/some/path", hash: "abc123" };
    const result = validateMemoryEvent(event);
    expect(result.ok).toBe(true);
  });

  it("validates op events", () => {
    const event = makeValidEvent();
    event.kind = "op";
    event.payload = { action: "read", file: "test.txt" };
    const result = validateMemoryEvent(event);
    expect(result.ok).toBe(true);
  });
});

describe("parseMemoryEventLine", () => {
  it("parses a valid JSON line", () => {
    const line = JSON.stringify(makeValidEvent());
    const result = parseMemoryEventLine(line, 5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.id).toBe("evt-1");
    }
  });

  it("returns warning for malformed JSON", () => {
    const result = parseMemoryEventLine("{not valid json}", 3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.line).toBe(3);
      expect(result.warning.reason).toBe("Malformed memory event JSON");
    }
  });

  it("returns warning for valid JSON but invalid event shape", () => {
    const result = parseMemoryEventLine(JSON.stringify({ foo: "bar" }), 7);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.line).toBe(7);
      expect(result.warning.reason).toBe("Invalid memory event shape");
    }
  });
});

describe("parseMemoryEventLines", () => {
  it("parses multiple valid lines", () => {
    const content = [
      JSON.stringify(makeValidEvent()),
      "",
      JSON.stringify({ ...makeValidEvent(), id: "evt-2" }),
    ].join("\n");
    const { events, warnings } = parseMemoryEventLines(content);
    expect(events).toHaveLength(2);
    expect(warnings).toHaveLength(0);
  });

  it("collects warnings for invalid lines", () => {
    const content = [
      JSON.stringify(makeValidEvent()),
      "not json at all",
      JSON.stringify({ bad: "shape" }),
    ].join("\n");
    const { events, warnings } = parseMemoryEventLines(content);
    expect(events).toHaveLength(1);
    expect(warnings).toHaveLength(2);
  });

  it("handles empty content", () => {
    const { events, warnings } = parseMemoryEventLines("");
    expect(events).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });
});

describe("type guards", () => {
  it("isMemoryEventKind", () => {
    expect(isMemoryEventKind("learn")).toBe(true);
    expect(isMemoryEventKind("note")).toBe(true);
    expect(isMemoryEventKind("echo")).toBe(true);
    expect(isMemoryEventKind("op")).toBe(true);
    expect(isMemoryEventKind("unknown")).toBe(false);
    expect(isMemoryEventKind(123)).toBe(false);
  });

  it("isMemoryActor", () => {
    expect(isMemoryActor("external")).toBe(true);
    expect(isMemoryActor("kintsugi")).toBe(true);
    expect(isMemoryActor("unknown")).toBe(false);
    expect(isMemoryActor(null)).toBe(false);
  });

  it("isIsoTimestamp", () => {
    expect(isIsoTimestamp("2026-06-19T12:00:00Z")).toBe(true);
    expect(isIsoTimestamp("2026-06-19")).toBe(true);
    expect(isIsoTimestamp("not-a-date")).toBe(false);
    expect(isIsoTimestamp(123)).toBe(false);
  });

  it("isRecord", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("string")).toBe(false);
    expect(isRecord([1, 2])).toBe(false);
  });

  it("isLearnPayload", () => {
    expect(isLearnPayload({ key: "k", value: "v" })).toBe(true);
    expect(isLearnPayload({ key: "k" })).toBe(false);
    expect(isLearnPayload({ key: 1, value: "v" })).toBe(false);
  });

  it("isNotePayload", () => {
    expect(isNotePayload({ text: "hello" })).toBe(true);
    expect(isNotePayload({})).toBe(true); // text is optional
    expect(isNotePayload({ text: 123 })).toBe(false);
  });

  it("isEchoPayload", () => {
    expect(isEchoPayload({ path: "/x", hash: "h" })).toBe(true);
    expect(isEchoPayload({ path: "/x" })).toBe(true);
    expect(isEchoPayload({})).toBe(true);
    expect(isEchoPayload({ path: 123 })).toBe(false);
    expect(isEchoPayload({ hash: 123 })).toBe(false);
  });

  it("isOpPayload", () => {
    expect(isOpPayload({ action: "read" })).toBe(true);
    expect(isOpPayload({})).toBe(true);
    expect(isOpPayload(null)).toBe(false);
    expect(isOpPayload([1])).toBe(false);
  });

  it("isMemoryPayload dispatches by kind", () => {
    expect(isMemoryPayload("learn", { key: "k", value: "v" })).toBe(true);
    expect(isMemoryPayload("note", { text: "hi" })).toBe(true);
    expect(isMemoryPayload("echo", { path: "/x" })).toBe(true);
    expect(isMemoryPayload("op", { action: "x" })).toBe(true);
    expect(isMemoryPayload("learn", { wrong: true })).toBe(false);
  });

  it("isMemoryEvent", () => {
    expect(isMemoryEvent(makeValidEvent())).toBe(true);
    expect(isMemoryEvent({ foo: "bar" })).toBe(false);
    expect(isMemoryEvent(null)).toBe(false);
    expect(isMemoryEvent("string")).toBe(false);
  });
});
