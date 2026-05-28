import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OpsLog, DEFAULT_MEMORY_DIR, resolveMemoryDir } from "../../src/memory/ops-store.js";

describe("OpsLog", () => {
  it("appends events with auto-generated id and timestamp", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-ops-"));
    const log = new OpsLog(dir);
    log.log({ kind: "op", actor: "kintsugi", payload: { action: "test" } });
    const events = log.query();
    expect(events).toHaveLength(1);
    expect(events[0].id).toBeTruthy();
    expect(events[0].at).toBeTruthy();
    expect(events[0].kind).toBe("op");
    expect(events[0].actor).toBe("kintsugi");
  });

  it("filters by kind, actor, and time range", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-ops-"));
    const log = new OpsLog(dir);
    log.log({ kind: "op", actor: "kintsugi", payload: {} });
    log.log({ kind: "learn", actor: "kintsugi", payload: { key: "a", value: "b" } });
    log.log({ kind: "echo", actor: "external", payload: { path: "/tmp/echo" } });

    expect(log.query({ kind: "learn" })).toHaveLength(1);
    expect(log.query({ actor: "external" })).toHaveLength(1);
    expect(log.query({ kind: "op" })).toHaveLength(1);
  });

  it("returns empty array when no events match", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-ops-"));
    const log = new OpsLog(dir);
    expect(log.query()).toEqual([]);
  });

  it("uses KINTSUGI_MEMORY_DIR env var", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-ops-"));
    process.env.KINTSUGI_MEMORY_DIR = dir;
    expect(resolveMemoryDir()).toBe(dir);
    delete process.env.KINTSUGI_MEMORY_DIR;
    expect(resolveMemoryDir()).toBe(DEFAULT_MEMORY_DIR);
  });

  it("skips malformed lines when reading", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-ops-"));
    writeFileSync(join(dir, "ops.log"), "not json\n{\"id\":\"abc\",\"kind\":\"op\",\"actor\":\"kintsugi\",\"payload\":{},\"at\":\"2026-01-01T00:00:00.000Z\"}\n", "utf-8");
    const log = new OpsLog(dir);
    expect(log.query()).toHaveLength(1);
  });

  it("returns events ordered by timestamp ascending", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-ops-"));
    writeFileSync(
      join(dir, "ops.log"),
      [
        JSON.stringify({ id: "late", kind: "note", actor: "external", payload: { text: "late" }, at: "2026-05-23T10:02:00.000Z" }),
        JSON.stringify({ id: "early", kind: "note", actor: "external", payload: { text: "early" }, at: "2026-05-23T10:01:00.000Z" }),
      ].join("\n") + "\n",
      "utf-8"
    );

    const log = new OpsLog(dir);
    expect(log.query().map((event) => event.id)).toEqual(["early", "late"]);
  });

  it("reports malformed lines through queryWithWarnings", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-ops-"));
    writeFileSync(
      join(dir, "ops.log"),
      "not json\n{\"id\":\"abc\",\"kind\":\"op\",\"actor\":\"kintsugi\",\"payload\":{},\"at\":\"2026-01-01T00:00:00.000Z\"}\n",
      "utf-8"
    );

    const log = new OpsLog(dir);
    const result = log.queryWithWarnings();
    expect(result.events).toHaveLength(1);
    expect(result.warnings).toEqual([
      { line: 1, message: "Malformed memory event JSON" },
    ]);
  });
});
