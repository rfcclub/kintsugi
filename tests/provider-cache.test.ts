import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearProviderCache,
  getModels,
  listCachedProviders,
  normalizeCache,
  readCache,
  writeCache,
  writeProviderCache,
} from "../src/providers/cache.js";
import type { ModelInfo } from "../src/providers/scanner.js";

function tempFile(name = "model-cache.json"): { path: string; dir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "kintsugi-cache-"));
  return { path: path.join(dir, name), dir };
}

const SAMPLE_MODELS: ModelInfo[] = [
  { id: "llama3-70b", owned_by: "meta" },
  { id: "mixtral-8x7b", name: "Mixtral" },
];

describe("readCache", () => {
  it("returns an empty object when the cache file does not exist", () => {
    const { path: cachePath } = tempFile();
    expect(readCache({ cachePath })).toEqual({});
  });

  it("reads a populated cache file", () => {
    const { path: cachePath } = tempFile();
    writeFileSync(
      cachePath,
      JSON.stringify({ groq: [{ id: "llama3-70b" }] }),
      "utf-8"
    );
    const cache = readCache({ cachePath });
    expect(cache.groq).toEqual([{ id: "llama3-70b", name: undefined, owned_by: undefined, created: undefined }]);
  });

  it("returns an empty object when the file is invalid JSON", () => {
    const { path: cachePath } = tempFile();
    writeFileSync(cachePath, "{ not json", "utf-8");
    expect(readCache({ cachePath })).toEqual({});
  });
});

describe("writeCache / writeProviderCache", () => {
  afterEach(() => {
    // no global state to reset, but keeps hooks consistent
  });

  it("writes a cache file creating parent directories", () => {
    const { dir } = tempFile();
    const cachePath = path.join(dir, "nested", "deep", "model-cache.json");
    writeCache({ groq: SAMPLE_MODELS }, { cachePath });
    expect(existsSync(cachePath)).toBe(true);
    const parsed = JSON.parse(readFileSync(cachePath, "utf-8"));
    expect(parsed.groq.map((m: ModelInfo) => m.id)).toEqual(["llama3-70b", "mixtral-8x7b"]);
  });

  it("writeProviderCache preserves other providers", () => {
    const { path: cachePath } = tempFile();
    writeProviderCache("groq", SAMPLE_MODELS, { cachePath });
    writeProviderCache("together", [{ id: "llama3" }], { cachePath });
    const cache = readCache({ cachePath });
    expect(cache.groq).toHaveLength(2);
    expect(cache.together.map((m) => m.id)).toEqual(["llama3"]);
  });

  it("writeCache sorts provider keys", () => {
    const { path: cachePath } = tempFile();
    writeCache(
      { zeta: [{ id: "z1" }], alpha: [{ id: "a1" }], mid: [{ id: "m1" }] },
      { cachePath }
    );
    const cache = readCache({ cachePath });
    expect(Object.keys(cache)).toEqual(["alpha", "mid", "zeta"]);
  });
});

describe("getModels", () => {
  it("returns cached models for a known provider", () => {
    const { path: cachePath } = tempFile();
    writeProviderCache("groq", SAMPLE_MODELS, { cachePath });
    expect(getModels("groq", { cachePath }).map((m) => m.id)).toEqual([
      "llama3-70b",
      "mixtral-8x7b",
    ]);
  });

  it("returns an empty array for an unknown provider", () => {
    const { path: cachePath } = tempFile();
    expect(getModels("unknown", { cachePath })).toEqual([]);
  });
});

describe("listCachedProviders", () => {
  it("lists providers that have at least one model", () => {
    const { path: cachePath } = tempFile();
    writeCache(
      { groq: SAMPLE_MODELS, empty: [], ollama: [{ id: "qwen" }] },
      { cachePath }
    );
    expect(listCachedProviders({ cachePath }).sort()).toEqual(["groq", "ollama"]);
  });

  it("returns an empty array when there is no cache", () => {
    const { path: cachePath } = tempFile();
    expect(listCachedProviders({ cachePath })).toEqual([]);
  });
});

describe("clearProviderCache", () => {
  it("removes a provider and returns true when present", () => {
    const { path: cachePath } = tempFile();
    writeProviderCache("groq", SAMPLE_MODELS, { cachePath });
    expect(clearProviderCache("groq", { cachePath })).toBe(true);
    expect(getModels("groq", { cachePath })).toEqual([]);
  });

  it("returns false when the provider was not present", () => {
    const { path: cachePath } = tempFile();
    writeProviderCache("groq", SAMPLE_MODELS, { cachePath });
    expect(clearProviderCache("missing", { cachePath })).toBe(false);
    expect(getModels("groq", { cachePath })).toHaveLength(2);
  });
});

describe("normalizeCache", () => {
  it("skips providers whose entry is not an array", () => {
    expect(normalizeCache({ groq: "nope", ollama: [{ id: "qwen" }] })).toEqual({
      ollama: [{ id: "qwen", name: undefined, owned_by: undefined, created: undefined }],
    });
  });

  it("returns empty object for non-object input", () => {
    expect(normalizeCache(null)).toEqual({});
    expect(normalizeCache(42)).toEqual({});
    expect(normalizeCache([1, 2])).toEqual({});
  });

  it("skips model entries without a string id", () => {
    expect(normalizeCache({ groq: [{ id: "ok" }, { noId: true }, null] })).toEqual({
      groq: [{ id: "ok", name: undefined, owned_by: undefined, created: undefined }],
    });
  });
});
