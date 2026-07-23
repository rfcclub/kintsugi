import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_MODEL_CACHE_PATH } from "./scanner.js";
import type { ModelInfo } from "./scanner.js";

/**
 * Model cache — persists scanned model lists per provider in a JSON file
 * (`~/.config/kintsugi/model-cache.json`). The file maps provider name to
 * a list of ModelInfo entries.
 */

export type ModelCache = Record<string, ModelInfo[]>;

export interface CacheOptions {
  /** Override the cache file path (defaults to DEFAULT_MODEL_CACHE_PATH). */
  cachePath?: string;
}

function resolveCachePath(options?: CacheOptions): string {
  return options?.cachePath ?? DEFAULT_MODEL_CACHE_PATH;
}

/** Read the entire model cache. Returns `{}` when the file is missing or invalid. */
export function readCache(options?: CacheOptions): ModelCache {
  const cachePath = resolveCachePath(options);
  if (!existsSync(cachePath)) {
    return {};
  }
  try {
    const content = readFileSync(cachePath, "utf-8");
    const parsed = JSON.parse(content);
    return normalizeCache(parsed);
  } catch {
    return {};
  }
}

/** Write the entire model cache to disk, creating parent dirs as needed. */
export function writeCache(cache: ModelCache, options?: CacheOptions): void {
  const cachePath = resolveCachePath(options);
  mkdirSync(path.dirname(cachePath), { recursive: true });
  const sorted = sortCache(cache);
  writeFileSync(cachePath, JSON.stringify(sorted, null, 2) + "\n", "utf-8");
}

/** Persist the models for a single provider, preserving other providers. */
export function writeProviderCache(
  provider: string,
  models: ModelInfo[],
  options?: CacheOptions
): void {
  const cache = readCache(options);
  cache[provider] = models;
  writeCache(cache, options);
}

/** Get the cached models for a single provider (empty array if unknown). */
export function getModels(provider: string, options?: CacheOptions): ModelInfo[] {
  const cache = readCache(options);
  return cache[provider] ?? [];
}

/** List all provider names that have cached models. */
export function listCachedProviders(options?: CacheOptions): string[] {
  const cache = readCache(options);
  return Object.keys(cache).filter((key) => Array.isArray(cache[key]) && cache[key].length > 0);
}

/** Remove a provider's cached models. No-op if the provider is not present. */
export function clearProviderCache(provider: string, options?: CacheOptions): boolean {
  const cachePath = resolveCachePath(options);
  const cache = readCache(options);
  if (!(provider in cache)) {
    return false;
  }
  delete cache[provider];
  writeCache(cache, options);
  void cachePath;
  return true;
}

/** Coerce an unknown parsed value into a valid ModelCache. */
export function normalizeCache(value: unknown): ModelCache {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const raw = value as Record<string, unknown>;
  const cache: ModelCache = {};
  for (const [provider, entry] of Object.entries(raw)) {
    if (!Array.isArray(entry)) {
      continue;
    }
    const models = entry
      .map((item) => normalizeModelInfo(item))
      .filter((model): model is ModelInfo => model !== null);
    if (models.length > 0) {
      cache[provider] = models;
    }
  }
  return cache;
}

function normalizeModelInfo(value: unknown): ModelInfo | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = record.id;
  if (typeof id !== "string" || !id) {
    return null;
  }
  return {
    id,
    name: typeof record.name === "string" ? record.name : undefined,
    owned_by: typeof record.owned_by === "string" ? record.owned_by : undefined,
    created: typeof record.created === "number" ? record.created : undefined,
  };
}

function sortCache(cache: ModelCache): ModelCache {
  const sorted: ModelCache = {};
  for (const key of Object.keys(cache).sort()) {
    sorted[key] = cache[key];
  }
  return sorted;
}
