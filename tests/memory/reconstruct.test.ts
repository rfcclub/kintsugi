import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OpsLog } from "../../src/memory/ops-store.js";
import { LearnedStore } from "../../src/memory/learned-store.js";
import { reconstruct } from "../../src/memory/reconstruct.js";

describe("reconstruct", () => {
  it("returns events and learned entries", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-reconstruct-"));
    const log = new OpsLog(dir);
    log.log({ kind: "op", actor: "kintsugi", payload: { action: "build" } });
    log.log({ kind: "learn", actor: "kintsugi", payload: { key: "lang", value: "ts" } });

    const learned = new LearnedStore({ memoryDir: dir });
    learned.set("pref", "dark");

    const memory = {
      ops: log,
      learned,
      reconstruct: () => reconstruct(memory),
    };

    const state = reconstruct(memory);
    expect(state.events).toHaveLength(2);
    expect(state.learned.pref).toBe("dark");
    expect(state.learned.lang).toBe("ts");
  });

  it("folds valid learn events into reconstructed facts", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-reconstruct-"));
    writeFileSync(
      join(dir, "ops.log"),
      [
        JSON.stringify({
          id: "oc-1",
          kind: "learn",
          actor: "external",
          payload: { key: "user.prefers", value: "direct answers" },
          at: "2026-05-23T10:00:00.000Z",
        }),
      ].join("\n") + "\n",
      "utf-8"
    );

    const ops = new OpsLog(dir);
    const learned = new LearnedStore({ memoryDir: dir });
    const memory = { ops, learned, reconstruct: () => reconstruct(memory) };

    expect(reconstruct(memory).learned["user.prefers"]).toBe("direct answers");
  });

  it("sorts events by timestamp ascending with file-order ties", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-reconstruct-"));
    writeFileSync(
      join(dir, "ops.log"),
      [
        JSON.stringify({ id: "late", kind: "note", actor: "external", payload: { text: "late" }, at: "2026-05-23T10:02:00.000Z" }),
        JSON.stringify({ id: "tie-1", kind: "note", actor: "external", payload: { text: "tie 1" }, at: "2026-05-23T10:01:00.000Z" }),
        JSON.stringify({ id: "early", kind: "note", actor: "external", payload: { text: "early" }, at: "2026-05-23T10:00:00.000Z" }),
        JSON.stringify({ id: "tie-2", kind: "note", actor: "external", payload: { text: "tie 2" }, at: "2026-05-23T10:01:00.000Z" }),
      ].join("\n") + "\n",
      "utf-8"
    );

    const ops = new OpsLog(dir);
    const learned = new LearnedStore({ memoryDir: dir });
    const memory = { ops, learned, reconstruct: () => reconstruct(memory) };

    expect(reconstruct(memory).events.map((event) => event.id)).toEqual([
      "early",
      "tie-1",
      "tie-2",
      "late",
    ]);
  });

  it("uses latest learn event for duplicate keys and reports unsupported payloads", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-reconstruct-"));
    writeFileSync(
      join(dir, "ops.log"),
      [
        JSON.stringify({ id: "bad", kind: "learn", actor: "external", payload: { key: "tone" }, at: "2026-05-23T10:00:00.000Z" }),
        JSON.stringify({ id: "old", kind: "learn", actor: "external", payload: { key: "tone", value: "formal" }, at: "2026-05-23T10:01:00.000Z" }),
        JSON.stringify({ id: "new", kind: "learn", actor: "kintsugi", payload: { key: "tone", value: "warm" }, at: "2026-05-23T10:02:00.000Z" }),
      ].join("\n") + "\n",
      "utf-8"
    );

    const ops = new OpsLog(dir);
    const learned = new LearnedStore({ memoryDir: dir });
    const memory = { ops, learned, reconstruct: () => reconstruct(memory) };
    const state = reconstruct(memory);

    expect(state.learned.tone).toBe("warm");
    expect(state.warnings).toContainEqual({ eventId: "bad", message: "Unsupported learn payload" });
  });

  it("returns warnings for malformed events without crashing", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-reconstruct-"));
    writeFileSync(
      join(dir, "ops.log"),
      [
        "not json",
        JSON.stringify({ id: "missing-actor", kind: "note", payload: {}, at: "2026-05-23T10:00:00.000Z" }),
        JSON.stringify({ id: "valid", kind: "note", actor: "external", payload: { text: "valid" }, at: "2026-05-23T10:01:00.000Z" }),
      ].join("\n") + "\n",
      "utf-8"
    );

    const ops = new OpsLog(dir);
    const learned = new LearnedStore({ memoryDir: dir });
    const memory = { ops, learned, reconstruct: () => reconstruct(memory) };
    const state = reconstruct(memory);

    expect(state.events.map((event) => event.id)).toEqual(["valid"]);
    expect(state.warnings).toEqual([
      { line: 1, message: "Malformed memory event JSON" },
      { line: 2, message: "Invalid memory event shape" },
    ]);
  });
});
