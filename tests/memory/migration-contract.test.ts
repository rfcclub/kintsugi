import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isEchoPayload,
  isLearnPayload,
  isMemoryActor,
  isMemoryEvent,
  isMemoryEventKind,
  isNotePayload,
  parseMemoryEventLine,
  parseMemoryEventLines,
  validateMemoryEvent,
} from "../../src/memory/events.js";

describe("shared memory migration contract", () => {
  it("accepts the companion runtime ops log fixture", () => {
    const fixture = readFileSync("tests/fixtures/memory/external-ops.log", "utf-8");
    const parsed = parseMemoryEventLines(fixture);

    expect(parsed.warnings).toEqual([]);
    expect(parsed.events).toHaveLength(3);
    expect(parsed.events.map((event) => event.id)).toEqual(["oc-1", "oc-2", "oc-3"]);
    expect(parsed.events.every((event) => event.actor === "external")).toBe(true);
    expect(isLearnPayload(parsed.events[0].payload)).toBe(true);
    expect(isNotePayload(parsed.events[1].payload)).toBe(true);
    expect(isEchoPayload(parsed.events[2].payload)).toBe(true);
  });

  it("accepts companion runtime-authored learn events", () => {
    const event = {
      id: "oc-1",
      kind: "learn",
      actor: "external",
      payload: { key: "user.prefers", value: "direct answers" },
      at: "2026-05-23T10:00:00.000Z",
    };

    expect(isMemoryActor(event.actor)).toBe(true);
    expect(isMemoryEventKind(event.kind)).toBe(true);
    expect(isMemoryEvent(event)).toBe(true);
    expect(isLearnPayload(event.payload)).toBe(true);
    expect(validateMemoryEvent(event)).toEqual({ ok: true, event });
  });

  it("rejects unsupported actors, kinds, timestamps, and learn payloads", () => {
    expect(isMemoryActor("codex")).toBe(false);
    expect(isMemoryEventKind("memory")).toBe(false);
    expect(
      isMemoryEvent({
        id: "bad",
        kind: "learn",
        actor: "external",
        payload: { key: "x", value: "y" },
        at: "not-a-date",
      })
    ).toBe(false);
    expect(isLearnPayload({ key: "x", value: 42 })).toBe(false);
    expect(validateMemoryEvent({ id: "bad", kind: "learn", actor: "external", payload: { key: "x" }, at: "2026-05-23T10:00:00.000Z" })).toMatchObject({
      ok: false,
      warning: { reason: "learn payload is invalid" },
    });
  });

  it("records warnings for malformed lines without dropping valid events", () => {
    const content = [
      '{"id":"oc-1","kind":"learn","actor":"external","payload":{"key":"user.prefers","value":"direct answers"},"at":"2026-05-23T10:00:00.000Z"}',
      "not json",
      '{"id":"oc-bad","kind":"learn","payload":{"key":"bad","value":"x"},"at":"2026-05-23T10:00:01.000Z"}',
      '{"id":"oc-2","kind":"note","actor":"external","payload":{"text":"Kintsugi should keep replies compact."},"at":"2026-05-23T10:01:00.000Z"}',
    ].join("\n");

    const parsed = parseMemoryEventLines(content);

    expect(parsed.events.map((event) => event.id)).toEqual(["oc-1", "oc-2"]);
    expect(parsed.warnings).toEqual([
      { line: 2, reason: "Malformed memory event JSON" },
      { line: 3, reason: "Invalid memory event shape" },
    ]);
    expect(parseMemoryEventLine("not json", 7)).toEqual({
      ok: false,
      warning: { line: 7, reason: "Malformed memory event JSON" },
    });
  });
});
