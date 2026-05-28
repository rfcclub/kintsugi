import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LearnedStore } from "../../src/memory/learned-store.js";

describe("LearnedStore", () => {
  it("stores and retrieves key-value facts", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-learned-"));
    const store = new LearnedStore({ memoryDir: dir });
    store.set("user.prefers", "direct answers");
    expect(store.get("user.prefers")).toBe("direct answers");
  });

  it("returns undefined for unknown keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-learned-"));
    const store = new LearnedStore({ memoryDir: dir });
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("iterates entries", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-learned-"));
    const store = new LearnedStore({ memoryDir: dir });
    store.set("a", "1");
    store.set("b", "2");
    const entries = Array.from(store.entries());
    expect(entries).toHaveLength(2);
    expect(entries).toContainEqual(["a", "1"]);
    expect(entries).toContainEqual(["b", "2"]);
  });
});
