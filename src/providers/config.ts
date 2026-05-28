import { readFileSync } from "node:fs";

export type ProviderType =
  | "mock"
  | "openai-chat"
  | "openai-responses"
  | "anthropic-messages";

export interface ModelConfig {
  temperature?: number;
  top_p?: number;
  reasoning_effort?: "low" | "medium" | "high";
  maxTokens?: number;
  stopSequences?: string[];
  presencePenalty?: number;
  frequencyPenalty?: number;
}

export interface ModelProfileEntry {
  provider?: string;
  preset?: string;
  model?: string;
  capabilities?: {
    tools?: boolean;
  };
  config?: Partial<ModelConfig>;
  settings?: ProviderConfigInput;
}

export interface ProviderPresetEntry extends ProviderConfigInput {
  adapter: string;
  defaultModel?: string;
}

export interface RealProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  anthropicVersion: string;
  temperature?: number;
  top_p?: number;
  reasoning_effort?: "low" | "medium" | "high";
  stopSequences?: string[];
  presencePenalty?: number;
  frequencyPenalty?: number;
  keyFile?: string;
  fetchImpl?: typeof fetch;
}

export interface ProviderConfigInput {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  anthropicVersion?: string;
  temperature?: number;
  top_p?: number;
  reasoning_effort?: "low" | "medium" | "high";
  stopSequences?: string[];
  presencePenalty?: number;
  frequencyPenalty?: number;
  keyFile?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";

export function isProviderType(value: string): value is ProviderType {
  return (
    value === "mock" ||
    value === "openai-chat" ||
    value === "openai-responses" ||
    value === "anthropic-messages"
  );
}

export function resolveRealProviderConfig(
  provider: Exclude<ProviderType, "mock">,
  input: ProviderConfigInput = {}
): RealProviderConfig {
  const apiKey =
    firstNonBlank(input.apiKey, process.env.KINTSUGI_API_KEY) ??
    readKeyFile(input.keyFile ?? process.env.KINTSUGI_KEY_FILE);
  if (!apiKey?.trim()) {
    throw new Error(`KINTSUGI_API_KEY is required for provider ${provider}`);
  }

  return {
    apiKey,
    baseUrl: input.baseUrl ?? process.env.KINTSUGI_BASE_URL ?? defaultBaseUrl(provider),
    model: input.model ?? process.env.KINTSUGI_MODEL ?? defaultModel(provider),
    maxTokens: input.maxTokens ?? readNumberEnv("KINTSUGI_MAX_TOKENS", DEFAULT_MAX_TOKENS),
    timeoutMs: input.timeoutMs ?? readNumberEnv("KINTSUGI_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    anthropicVersion:
      input.anthropicVersion ??
      process.env.KINTSUGI_ANTHROPIC_VERSION ??
      DEFAULT_ANTHROPIC_VERSION,
    temperature: input.temperature ?? readOptionalNumberEnv("KINTSUGI_TEMPERATURE"),
    top_p: input.top_p ?? readOptionalNumberEnv("KINTSUGI_TOP_P"),
    reasoning_effort: input.reasoning_effort ?? (process.env.KINTSUGI_REASONING_EFFORT as ModelConfig["reasoning_effort"]),
    stopSequences: input.stopSequences ?? (process.env.KINTSUGI_STOP_SEQUENCES?.split(",").map(s => s.trim()).filter(Boolean)),
    presencePenalty: input.presencePenalty ?? readOptionalNumberEnv("KINTSUGI_PRESENCE_PENALTY"),
    frequencyPenalty: input.frequencyPenalty ?? readOptionalNumberEnv("KINTSUGI_FREQUENCY_PENALTY"),
    fetchImpl: input.fetchImpl,
  };
}

export function validateReasoningEffort(value: string | undefined): value is NonNullable<ModelConfig["reasoning_effort"]> {
  return value === "low" || value === "medium" || value === "high";
}

function firstNonBlank(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value.trim().length > 0);
}

function defaultBaseUrl(provider: Exclude<ProviderType, "mock">): string {
  if (provider === "anthropic-messages") {
    return "https://api.anthropic.com/v1";
  }
  return "https://api.openai.com/v1";
}

function defaultModel(provider: Exclude<ProviderType, "mock">): string {
  if (provider === "anthropic-messages") {
    return "claude-sonnet-4-5";
  }
  return "gpt-4o-mini";
}

function readNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readOptionalNumberEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) { return undefined; }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}


function readKeyFile(keyFile: string | undefined): string | undefined {
  if (!keyFile) { return undefined; }
  try {
    return readFileSync(keyFile, "utf-8").trim();
  } catch {
    return undefined;
  }
}
