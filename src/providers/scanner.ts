import { homedir } from "node:os";
import path from "node:path";

/**
 * Provider scanner — tests connectivity against an OpenAI-compatible
 * provider and scans its `/models` endpoint for available models.
 *
 * Uses the built-in `fetch` (Node 18+). A custom `fetchImpl` can be
 * injected for testing or to route through a proxy.
 */

export interface ModelInfo {
  id: string;
  name?: string;
  owned_by?: string;
  created?: number;
}

export interface ConnectionResult {
  ok: boolean;
  error?: string;
  status?: number;
}

export interface ScanResult {
  models: ModelInfo[];
  ok: boolean;
  error?: string;
}

export interface ScanOptions {
  /** Custom fetch implementation (defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** Request timeout in milliseconds (default 5000). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

/** Resolve the models endpoint URL from a base URL (handles trailing slash). */
export function resolveModelsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return `${trimmed}/models`;
}

function buildHeaders(apiKey: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }
  return headers;
}

function withTimeout(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number
): { promise: Promise<Response>; controller: AbortController } {
  const controller = new AbortController();
  const signal = controller.signal;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const promise = fetchImpl(input, { ...init, signal }).finally(() =>
    clearTimeout(timer)
  );
  return { promise, controller };
}

/** Test whether a provider endpoint is reachable and authenticated. */
export async function testConnection(
  baseUrl: string,
  apiKey: string,
  options: ScanOptions = {}
): Promise<ConnectionResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = resolveModelsUrl(baseUrl);

  try {
    const { promise } = withTimeout(fetchImpl, url, {
      method: "GET",
      headers: buildHeaders(apiKey),
    }, timeoutMs);
    const response = await promise;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `Provider responded with HTTP ${response.status}`,
      };
    }

    return { ok: true, status: response.status };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: `Connection timed out after ${timeoutMs}ms` };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Scan a provider's `/models` endpoint and return the list of models.
 * If the endpoint is unsupported or returns an unexpected shape, returns
 * an empty model list (does not throw — scanning failure is non-blocking).
 */
export async function scanModels(
  baseUrl: string,
  apiKey: string,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = resolveModelsUrl(baseUrl);

  try {
    const { promise } = withTimeout(fetchImpl, url, {
      method: "GET",
      headers: buildHeaders(apiKey),
    }, timeoutMs);
    const response = await promise;

    if (!response.ok) {
      return {
        models: [],
        ok: false,
        error: `Provider responded with HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    return { models: parseModels(data), ok: true };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { models: [], ok: false, error: `Scan timed out after ${timeoutMs}ms` };
    }
    return {
      models: [],
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Parse an OpenAI-compatible `/models` response into ModelInfo[]. */
export function parseModels(data: unknown): ModelInfo[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return [];
  }
  const raw = data as Record<string, unknown>;
  const list = raw.data;
  if (!Array.isArray(list)) {
    return [];
  }
  const models: ModelInfo[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const id = record.id;
    if (typeof id !== "string" || !id) {
      continue;
    }
    models.push({
      id,
      name: typeof record.name === "string" ? record.name : undefined,
      owned_by: typeof record.owned_by === "string" ? record.owned_by : undefined,
      created: typeof record.created === "number" ? record.created : undefined,
    });
  }
  return models;
}

/** Default location for the model cache, alongside config.yaml. */
export const DEFAULT_MODEL_CACHE_PATH = path.join(
  homedir(),
  ".config",
  "kintsugi",
  "model-cache.json"
);
