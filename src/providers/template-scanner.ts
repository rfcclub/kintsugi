import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml } from "yaml";

/**
 * Template scanner — parses provider templates from ~/.anima/providers.d/*.yaml
 * and maps them to kintsugi-compatible provider configurations.
 */

export interface ProviderTemplate {
  id: string;
  label: string;
  api: string;
  adapter: string | null;
  baseUrl: string;
  apiKeyRef: string;
  models: string[];
  supported: boolean;
  raw: Record<string, unknown>;
}

export interface ScanTemplatesOptions {
  providersDir?: string;
}

const DEFAULT_PROVIDERS_DIR = path.join(homedir(), ".anima", "providers.d");

/**
 * Map providers.d 'api' field to kintsugi adapter type.
 * Returns null for unsupported adapters (generic, unknown).
 */
export function mapApiToAdapter(api: string): string | null {
  switch (api) {
    case "openai-completions":
      return "openai-chat";
    case "anthropic-messages":
      return "anthropic-messages";
    default:
      return null;
  }
}

/**
 * Parse a single provider YAML file into a ProviderTemplate.
 * Returns null if the file is malformed or missing required fields.
 */
export function parseTemplateFile(filePath: string): ProviderTemplate | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const raw = parseYaml(content) as Record<string, unknown>;

    if (!raw || typeof raw !== "object") return null;

    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    const api = typeof raw.api === "string" ? raw.api.trim() : "";
    const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "";

    if (!id || !label || !api || !baseUrl) return null;

    const apiKeyRef = typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";

    // Parse models: array of {id: string} objects
    let models: string[] = [];
    if (Array.isArray(raw.models)) {
      models = raw.models
        .filter(
          (m: unknown) =>
            m && typeof m === "object" && typeof (m as Record<string, unknown>).id === "string"
        )
        .map((m: Record<string, unknown>) => (m.id as string).trim())
        .filter((id: string) => id.length > 0);
    }

    const adapter = mapApiToAdapter(api);

    return {
      id,
      label,
      api,
      adapter,
      baseUrl,
      apiKeyRef,
      models,
      supported: adapter !== null,
      raw,
    };
  } catch {
    return null;
  }
}

/**
 * Scan providers.d directory and parse all .yaml files.
 * Returns array of ProviderTemplate, sorted by label.
 */
export function scanTemplates(options?: ScanTemplatesOptions): ProviderTemplate[] {
  const dir = options?.providersDir ?? DEFAULT_PROVIDERS_DIR;

  if (!existsSync(dir)) return [];

  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  } catch {
    return [];
  }

  const templates: ProviderTemplate[] = [];
  for (const file of files) {
    const template = parseTemplateFile(path.join(dir, file));
    if (template) templates.push(template);
  }

  return templates.sort((a, b) => a.label.localeCompare(b.label));
}
