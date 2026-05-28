import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MinorMemory } from "../../src/memory/minor.js";

describe("MinorMemory", () => {
  it("stores and retrieves values", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-minor-"));
    const mem = new MinorMemory({ filePath: join(dir, "minor.json") });
    mem.set("key", "value");
    expect(mem.get("key", "default")).toBe("value");
  });

  it("returns fallback for missing keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-minor-"));
    const mem = new MinorMemory({ filePath: join(dir, "minor.json") });
    expect(mem.get("nonexistent", 42)).toBe(42);
  });

  it("removes keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-minor-"));
    const mem = new MinorMemory({ filePath: join(dir, "minor.json") });
    mem.set("key", "value");
    mem.remove("key");
    expect(mem.get("key", null)).toBeNull();
  });

  it("persists and reloads on flush", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-minor-"));
    const filePath = join(dir, "minor.json");
    const mem = new MinorMemory({ filePath });
    mem.set("persisted", "yes");
    mem.flush();

    const content = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(content.persisted).toBe("yes");

    const mem2 = new MinorMemory({ filePath });
    expect(mem2.get("persisted", "no")).toBe("yes");
  });
});
