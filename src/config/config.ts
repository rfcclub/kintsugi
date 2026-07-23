import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { isProviderType, type ProviderType, type ModelConfig, type ModelProfileEntry, type ProviderPresetEntry } from "../providers/config.js";
import { defaultPermissionConfig, type PermissionConfig, type PermissionDecision } from "../runtime/permissions.js";
import type { ParsedArgs } from "../cli/args.js";
import { type McpServerConfig } from "../protocol/mcp.js";

export interface KintsugiConfig {
  provider?: ProviderType;
  mcpServers?: Record<string, McpServerConfig>;
  model?: string;
  substrate?: string;
  noSubstrate?: boolean;
  workspace?: string;
  workspaceBudget?: number;
  modelProfile?: string;
  modelProfiles?: Record<string, ModelProfileEntry>;
  providerPresets?: Record<string, ProviderPresetEntry>;
  modelConfig?: Partial<ModelConfig>;
  workspaceRoots?: string[];
  keyFile?: string;
  providers?: Record<string, ProviderSettings>;
  permissions?: Record<string, PermissionDecision>;
  hooks?: HooksConfig;
  ui?: {
    theme?: string;
  };
}

export interface ProviderSettings {
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  anthropicVersion?: string;
  keyFile?: string;
  temperature?: number;
  top_p?: number;
  reasoning_effort?: "low" | "medium" | "high";
  stopSequences?: string[];
  presencePenalty?: number;
  frequencyPenalty?: number;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
}

export interface HooksConfig {
  mode?: "strict" | "permissive";
  timeoutMs?: number;
  pre?: Record<string, string>;
  post?: Record<string, string>;
}

export interface ResolvedConfig {
  provider: ProviderType;
  model?: string;
  substrate?: string;
  noSubstrate: boolean;
  workspace?: string;
  workspaceBudget?: number;
  modelProfile?: string;
  modelProfiles?: Record<string, ModelProfileEntry>;
  providerPreset?: string;
  providerPresets?: Record<string, ProviderPresetEntry>;
  modelConfig?: ModelConfig;
  workspaceRoots?: string[];
  keyFile?: string;
  providers?: Record<string, ProviderSettings>;
  providerSettings: ProviderSettings;
  permissions: PermissionConfig;
  mcpServers?: Record<string, McpServerConfig>;
  hooks: {
    mode: "strict" | "permissive";
    timeoutMs: number;
    pre: Record<string, string>;
    post: Record<string, string>;
  };
  sources: string[];
}

export interface LoadConfigOptions {
  cwd?: string;
  homeConfigPath?: string;
  repoConfigPath?: string;
  env?: NodeJS.ProcessEnv;
}

export interface InitConfigResult {
  path: string;
  created: boolean;
}

export const DEFAULT_HOME_CONFIG_PATH = path.join(
  homedir(),
  ".config",
  "kintsugi",
  "config.yaml"
);

export const BUILT_IN_PROVIDER_PRESETS: Record<string, ProviderPresetEntry> = {
  openai: {
    adapter: "openai-chat",
    baseUrl: "https://api.openai.com/v1",
  },
  "openai-responses": {
    adapter: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
  },
  anthropic: {
    adapter: "anthropic-messages",
    baseUrl: "https://api.anthropic.com/v1",
  },
  example: {
    adapter: "openai-chat",
    baseUrl: "https://api.example.com/v1",
    defaultModel: "greg",
  },
  "openai-compatible": {
    adapter: "openai-chat",
  },
};

export function resolveConfig(
  args: ParsedArgs,
  options: LoadConfigOptions = {}
): ResolvedConfig {
  const env = options.env ?? process.env;
  const loaded = loadConfigFiles(options);
  const merged = loaded.configs.reduce<KintsugiConfig>(
    (acc, config) => mergeConfig(acc, config),
    {}
  );
  const providerPresets = mergeProviderPresets(merged.providerPresets);

  let provider = merged.provider ?? "mock";
  let model = merged.model;
  let modelConfig: ModelConfig | undefined;
  let providerPreset: string | undefined;
  let presetSettings: ProviderSettings = {};
  let profileSettings: ProviderSettings = {};

  // Resolve model profile if selected
  const modelProfile = args.modelProfile ?? merged.modelProfile;
  if (modelProfile && merged.modelProfiles?.[modelProfile]) {
    const profile = merged.modelProfiles[modelProfile];
    providerPreset = profile.preset;
    const preset = providerPreset ? providerPresets[providerPreset] : undefined;
    if (providerPreset && !preset) {
      throw new Error(`Unknown provider preset: ${providerPreset}`);
    }
    const rawProvider = profile.provider ?? preset?.adapter;
    if (!rawProvider || !isProviderType(rawProvider)) {
      throw new Error(`Model profile "${modelProfile}" uses unknown provider: ${rawProvider ?? "(not set)"}`);
    }
    provider = rawProvider;
    presetSettings = preset ? providerPresetToSettings(preset) : {};
    profileSettings = profile.settings ?? {};
    model = profile.model ?? preset?.defaultModel ?? model;
    if (profile.config) {
      modelConfig = { ...profile.config } as ModelConfig;
    }
  }

  const providerBeforeOverride = provider;
  provider = resolveProvider(args, { ...merged, provider }, env);
  model = args.model ?? env.KINTSUGI_MODEL ?? model;
  const keepProfileSettings = provider === providerBeforeOverride;

  // Merge per-provider settings
  const providerSettings: ProviderSettings = {
    ...definedProviderSettings(merged.providers?.[provider] ?? {}),
    ...(keepProfileSettings ? definedProviderSettings(presetSettings) : {}),
    ...(keepProfileSettings ? definedProviderSettings(profileSettings) : {}),
  };
  if (providerSettings.keyFile) {
    providerSettings.keyFile = expandUserPath(providerSettings.keyFile);
  }
  const keyFile = optionalUserPath(merged.keyFile);
  if (keyFile) {
    providerSettings.keyFile = keyFile;
  }
  applyProviderEnvOverrides(providerSettings, env);

  // Merge top-level modelConfig over profile config (top-level wins on overlap)
  if (merged.modelConfig) {
    if (modelConfig) {
      modelConfig = { ...modelConfig, ...merged.modelConfig } as ModelConfig;
    } else {
      modelConfig = { ...merged.modelConfig } as ModelConfig;
    }
  }

  // Read and parse .kintsugi/mcp.json relative to cwd if it exists
  const cwd = options.cwd ?? process.cwd();
  const mcpJsonPath = path.join(cwd, ".kintsugi", "mcp.json");
  let mcpJsonServers: Record<string, McpServerConfig> | undefined;
  if (existsSync(mcpJsonPath)) {
    try {
      const content = readFileSync(mcpJsonPath, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        if (parsed.mcpServers !== undefined) {
          mcpJsonServers = optionalMcpServers(parsed.mcpServers, mcpJsonPath);
        }
      }
    } catch (err: any) {
      throw new Error(`Failed to parse ${mcpJsonPath}: ${err.message}`);
    }
  }

  const finalMcpServers = {
    ...(merged.mcpServers ?? {}),
    ...(mcpJsonServers ?? {}),
  };

  return {
    provider,
    model,
    substrate: optionalUserPath(args.substrate ?? env.KINTSUGI_SUBSTRATE ?? merged.substrate),
    noSubstrate: args.noSubstrate || merged.noSubstrate === true,
    workspace: optionalUserPath(env.KINTSUGI_WORKSPACE ?? merged.workspace),
    workspaceBudget: merged.workspaceBudget,
    modelProfile,
    providerPreset,
    modelProfiles: merged.modelProfiles,
    providerPresets,
    modelConfig,
    workspaceRoots: merged.workspaceRoots?.map(expandUserPath),
    keyFile,
    providers: expandProviderSettingsMap(merged.providers),
    providerSettings,
    permissions: resolvePermissions(merged.permissions),
    mcpServers: Object.keys(finalMcpServers).length > 0 ? finalMcpServers : undefined,
    hooks: {
      mode: merged.hooks?.mode ?? "strict",
      timeoutMs: merged.hooks?.timeoutMs ?? 5000,
      pre: merged.hooks?.pre ?? {},
      post: merged.hooks?.post ?? {},
    },
    sources: loaded.sources,
  };
}

export function expandUserPath(value: string): string {
  if (value === "~") {
    return homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(homedir(), value.slice(2));
  }
  return value;
}

function optionalUserPath(value: string | undefined): string | undefined {
  return value === undefined ? undefined : expandUserPath(value);
}

function mergeProviderPresets(
  presets: Record<string, ProviderPresetEntry> | undefined
): Record<string, ProviderPresetEntry> {
  return {
    ...BUILT_IN_PROVIDER_PRESETS,
    ...(presets ?? {}),
  };
}

function providerPresetToSettings(preset: ProviderPresetEntry): ProviderSettings {
  return {
    baseUrl: preset.baseUrl,
    model: preset.model,
    maxTokens: preset.maxTokens,
    timeoutMs: preset.timeoutMs,
    anthropicVersion: preset.anthropicVersion,
    keyFile: preset.keyFile ? expandUserPath(preset.keyFile) : undefined,
    temperature: preset.temperature,
    top_p: preset.top_p,
    reasoning_effort: preset.reasoning_effort,
    stopSequences: preset.stopSequences,
    presencePenalty: preset.presencePenalty,
    frequencyPenalty: preset.frequencyPenalty,
  };
}

function definedProviderSettings(settings: ProviderSettings): ProviderSettings {
  return Object.fromEntries(
    Object.entries(settings).filter(([, value]) => value !== undefined)
  ) as ProviderSettings;
}

function expandProviderSettingsMap(
  providers: Record<string, ProviderSettings> | undefined
): Record<string, ProviderSettings> | undefined {
  if (!providers) {
    return undefined;
  }
  const expanded: Record<string, ProviderSettings> = {};
  for (const [provider, settings] of Object.entries(providers)) {
    expanded[provider] = {
      ...settings,
      keyFile: settings.keyFile ? expandUserPath(settings.keyFile) : undefined,
    };
  }
  return expanded;
}

function applyProviderEnvOverrides(settings: ProviderSettings, env: NodeJS.ProcessEnv): void {
  if (env.KINTSUGI_BASE_URL) {
    settings.baseUrl = env.KINTSUGI_BASE_URL;
  }
  if (env.KINTSUGI_KEY_FILE) {
    settings.keyFile = expandUserPath(env.KINTSUGI_KEY_FILE);
  }
  if (env.KINTSUGI_MAX_TOKENS) {
    settings.maxTokens = optionalEnvPositiveNumber(env.KINTSUGI_MAX_TOKENS) ?? settings.maxTokens;
  }
  if (env.KINTSUGI_TIMEOUT_MS) {
    settings.timeoutMs = optionalEnvPositiveNumber(env.KINTSUGI_TIMEOUT_MS) ?? settings.timeoutMs;
  }
  if (env.KINTSUGI_ANTHROPIC_VERSION) {
    settings.anthropicVersion = env.KINTSUGI_ANTHROPIC_VERSION;
  }
  if (env.KINTSUGI_TEMPERATURE) {
    settings.temperature = optionalEnvNumber(env.KINTSUGI_TEMPERATURE) ?? settings.temperature;
  }
  if (env.KINTSUGI_TOP_P) {
    settings.top_p = optionalEnvNumber(env.KINTSUGI_TOP_P) ?? settings.top_p;
  }
  if (env.KINTSUGI_STOP_SEQUENCES) {
    settings.stopSequences = env.KINTSUGI_STOP_SEQUENCES.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (env.KINTSUGI_PRESENCE_PENALTY) {
    settings.presencePenalty = optionalEnvNumber(env.KINTSUGI_PRESENCE_PENALTY) ?? settings.presencePenalty;
  }
  if (env.KINTSUGI_FREQUENCY_PENALTY) {
    settings.frequencyPenalty = optionalEnvNumber(env.KINTSUGI_FREQUENCY_PENALTY) ?? settings.frequencyPenalty;
  }
}

function optionalEnvNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalEnvPositiveNumber(value: string): number | undefined {
  const parsed = optionalEnvNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

export function loadConfigFiles(options: LoadConfigOptions = {}): {
  configs: KintsugiConfig[];
  sources: string[];
} {
  const cwd = options.cwd ?? process.cwd();
  const paths = [
    options.homeConfigPath ?? DEFAULT_HOME_CONFIG_PATH,
    options.repoConfigPath ?? path.join(cwd, ".kintsugi", "config.yaml"),
  ];
  const configs: KintsugiConfig[] = [];
  const sources: string[] = [];

  for (const configPath of paths) {
    if (!existsSync(configPath)) {
      continue;
    }
    configs.push(readConfigFile(configPath));
    sources.push(configPath);
  }

  return { configs, sources };
}

export function readConfigFile(configPath: string): KintsugiConfig {
  const parsed = parseYaml(readFileSync(configPath, "utf-8")) as unknown;
  return normalizeConfig(parsed, configPath);
}

export function initConfigTemplate(configPath = DEFAULT_HOME_CONFIG_PATH): InitConfigResult {
  if (existsSync(configPath)) {
    return { path: configPath, created: false };
  }

  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, CONFIG_TEMPLATE, "utf-8");
  return { path: configPath, created: true };
}

export const CONFIG_TEMPLATE = `# kintsugi config
# Human-edited configuration is YAML. Runtime state stays JSON/JSONL.
# Secrets should live in env vars or key files, not directly in this file.

provider: mock
# provider: openai-responses
# model: gpt-4.1-mini
substrate: ~/.config/kintsugi/substrate
workspace: ~/.config/kintsugi/workspace
workspaceBudget: 65536

# Model profiles — shorthand aliases for provider+model+config combinations
# providerPresets:
#   example:
#     adapter: openai-chat
#     baseUrl: https://api.example.com/v1
#     keyFile: ~/.config/kintsugi/example.key
#     defaultModel: greg
# modelProfiles:
#   fast:
#     provider: openai-chat
#     model: gpt-4o-mini
#     settings:
#       baseUrl: https://api.openai.com/v1
#       keyFile: ~/.config/kintsugi/openai.key
#     config:
#       temperature: 0.7
#       maxTokens: 2048
#   example-greg:
#     preset: example
#     model: greg
#     config:
#       maxTokens: 512
#   thinker:
#     provider: anthropic-messages
#     model: claude-sonnet-4-5
#     config:
#       reasoning_effort: high
#       temperature: 0.5
# modelProfile: fast

# Per-provider overrides
providers:
  openai-chat:
    baseUrl: https://api.openai.com/v1
    # model: gpt-4o-mini
  openai-responses:
    baseUrl: https://api.openai.com/v1
    # model: gpt-4.1-mini
  anthropic-messages:
    baseUrl: https://api.anthropic.com/v1
    anthropicVersion: "2023-06-01"
    # model: claude-sonnet-4-5

permissions:
  read_file: allow
  list_files: allow
  grep: allow
  write_file: ask
  edit_file: ask
  bash: ask

ui:
  theme: vivid
`;

function normalizeConfig(value: unknown, source: string): KintsugiConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Config must be an object: ${source}`);
  }

  const raw = value as Record<string, unknown>;
  const provider = optionalProvider(raw.provider, source);
  const permissions = optionalPermissionMap(raw.permissions, source);

  return {
    provider,
    model: optionalString(raw.model, "model", source),
    substrate: optionalString(raw.substrate, "substrate", source),
    noSubstrate: optionalBoolean(raw.noSubstrate, "noSubstrate", source),
    workspace: optionalString(raw.workspace, "workspace", source),
    workspaceBudget: optionalNumber(raw.workspaceBudget, "workspaceBudget", source),
    modelProfile: optionalString(raw.modelProfile, "modelProfile", source),
    modelProfiles: optionalModelProfiles(raw.modelProfiles, source),
    providerPresets: optionalProviderPresets(raw.providerPresets, source),
    modelConfig: optionalModelConfig(raw.modelConfig, source),
    workspaceRoots: optionalStringArray(raw.workspaceRoots, "workspaceRoots", source),
    keyFile: optionalString(raw.keyFile, "keyFile", source),
    providers: optionalProviders(raw.providers, source),
    permissions,
    mcpServers: optionalMcpServers(raw.mcpServers, source),
    hooks: optionalHooks(raw.hooks, source),
    ui: optionalUi(raw.ui, source),
  };
}

function mergeConfig(base: KintsugiConfig, next: KintsugiConfig): KintsugiConfig {
  return {
    ...base,
    ...next,
    modelProfiles: {
      ...(base.modelProfiles ?? {}),
      ...(next.modelProfiles ?? {}),
    },
    providerPresets: {
      ...(base.providerPresets ?? {}),
      ...(next.providerPresets ?? {}),
    },
    providers: {
      ...(base.providers ?? {}),
      ...(next.providers ?? {}),
    },
    permissions: {
      ...(base.permissions ?? {}),
      ...(next.permissions ?? {}),
    },
    mcpServers: base.mcpServers || next.mcpServers ? {
      ...(base.mcpServers ?? {}),
      ...(next.mcpServers ?? {}),
    } : undefined,
    hooks: base.hooks || next.hooks ? {
      ...(base.hooks ?? {}),
      ...(next.hooks ?? {}),
      pre: {
        ...(base.hooks?.pre ?? {}),
        ...(next.hooks?.pre ?? {}),
      },
      post: {
        ...(base.hooks?.post ?? {}),
        ...(next.hooks?.post ?? {}),
      },
    } : undefined,
    ui: {
      ...(base.ui ?? {}),
      ...(next.ui ?? {}),
    },
  };
}

function resolveProvider(
  args: ParsedArgs,
  config: KintsugiConfig,
  env: NodeJS.ProcessEnv
): ProviderType {
  if (args.providerExplicit) {
    return args.provider;
  }
  if (env.KINTSUGI_PROVIDER) {
    return optionalProvider(env.KINTSUGI_PROVIDER, "KINTSUGI_PROVIDER") ?? "mock";
  }
  return config.provider ?? "mock";
}

function resolvePermissions(
  permissions: Record<string, PermissionDecision> | undefined
): PermissionConfig {
  return {
    defaultDecision: defaultPermissionConfig.defaultDecision,
    rules: [
      ...defaultPermissionConfig.rules,
      ...Object.entries(permissions ?? {}).map(([tool, decision]) => ({
        tool,
        decision,
      })),
    ],
  };
}

function optionalModelProfiles(
  value: unknown,
  source: string
): Record<string, ModelProfileEntry> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`modelProfiles must be an object: ${source}`);
  }

  const profiles: Record<string, ModelProfileEntry> = {};
  for (const [name, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`modelProfiles.${name} must be an object: ${source}`);
    }
    const raw = entry as Record<string, unknown>;
    const provider = optionalString(raw.provider, `modelProfiles.${name}.provider`, source);
    const preset = optionalString(raw.preset, `modelProfiles.${name}.preset`, source);
    const model = optionalString(raw.model, `modelProfiles.${name}.model`, source);
    if (!provider && !preset) {
      throw new Error(`modelProfiles.${name}.provider or modelProfiles.${name}.preset is required: ${source}`);
    }
    if (!model && !preset) {
      throw new Error(`modelProfiles.${name}.model is required unless preset supplies defaultModel: ${source}`);
    }
    profiles[name] = {
      provider,
      preset,
      model,
      capabilities: optionalCapabilities(raw.capabilities, `modelProfiles.${name}.capabilities`, source),
      config: optionalModelConfig(raw.config, source),
      settings: optionalProviderSettings(raw.settings, `modelProfiles.${name}.settings`, source),
    };
  }
  return profiles;
}

function optionalCapabilities(
  value: unknown,
  name: string,
  source: string
): ModelProfileEntry["capabilities"] {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object: ${source}`);
  }
  const raw = value as Record<string, unknown>;
  return {
    tools: optionalBoolean(raw.tools, `${name}.tools`, source),
  };
}

function optionalProviderPresets(
  value: unknown,
  source: string
): Record<string, ProviderPresetEntry> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`providerPresets must be an object: ${source}`);
  }

  const presets: Record<string, ProviderPresetEntry> = {};
  for (const [name, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`providerPresets.${name} must be an object: ${source}`);
    }
    const raw = entry as Record<string, unknown>;
    presets[name] = {
      adapter: requiredString(raw.adapter, `providerPresets.${name}.adapter`, source),
      defaultModel: optionalString(raw.defaultModel, `providerPresets.${name}.defaultModel`, source),
      ...optionalProviderSettings(raw, `providerPresets.${name}`, source),
    };
  }
  return presets;
}

function optionalModelConfig(
  value: unknown,
  source: string
): Partial<ModelConfig> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`modelConfig must be an object: ${source}`);
  }
  const raw = value as Record<string, unknown>;
  const config: Partial<ModelConfig> = {};
  if (raw.temperature !== undefined) {
    config.temperature = requiredNumber(raw.temperature, "modelConfig.temperature", source);
  }
  if (raw.top_p !== undefined) {
    config.top_p = requiredNumber(raw.top_p, "modelConfig.top_p", source);
  }
  if (raw.reasoning_effort !== undefined) {
    if (raw.reasoning_effort !== "low" && raw.reasoning_effort !== "medium" && raw.reasoning_effort !== "high") {
      throw new Error(`modelConfig.reasoning_effort must be low, medium, or high: ${source}`);
    }
    config.reasoning_effort = raw.reasoning_effort as "low" | "medium" | "high";
  }
  if (raw.maxTokens !== undefined) {
    config.maxTokens = requiredNumber(raw.maxTokens, "modelConfig.maxTokens", source);
  }
  if (raw.stopSequences !== undefined) {
    if (!Array.isArray(raw.stopSequences)) {
      throw new Error(`modelConfig.stopSequences must be an array: ${source}`);
    }
    config.stopSequences = raw.stopSequences.map((s: unknown) => String(s));
  }
  if (raw.presencePenalty !== undefined) {
    config.presencePenalty = requiredNumber(raw.presencePenalty, "modelConfig.presencePenalty", source);
  }
  if (raw.frequencyPenalty !== undefined) {
    config.frequencyPenalty = requiredNumber(raw.frequencyPenalty, "modelConfig.frequencyPenalty", source);
  }
  return Object.keys(config).length > 0 ? config : undefined;
}

function optionalProviders(
  value: unknown,
  source: string
): Record<string, ProviderSettings> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`providers must be an object: ${source}`);
  }

  const providers: Record<string, ProviderSettings> = {};
  for (const [provider, settings] of Object.entries(value)) {
    providers[provider] = optionalProviderSettings(settings, `providers.${provider}`, source) ?? {};
  }
  return providers;
}

function optionalProviderSettings(
  value: unknown,
  name: string,
  source: string
): ProviderSettings | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object: ${source}`);
  }
  const raw = value as Record<string, unknown>;
  return {
    baseUrl: optionalString(raw.baseUrl, `${name}.baseUrl`, source),
    model: optionalString(raw.model, `${name}.model`, source),
    maxTokens: optionalNumber(raw.maxTokens, `${name}.maxTokens`, source),
    timeoutMs: optionalNumber(raw.timeoutMs, `${name}.timeoutMs`, source),
    anthropicVersion: optionalString(raw.anthropicVersion, `${name}.anthropicVersion`, source),
    keyFile: optionalString(raw.keyFile, `${name}.keyFile`, source),
    temperature: optionalNumber(raw.temperature, `${name}.temperature`, source),
    top_p: optionalNumber(raw.top_p, `${name}.top_p`, source),
    reasoning_effort: optionalReasoningEffort(raw.reasoning_effort, `${name}.reasoning_effort`, source),
    stopSequences: optionalStringArray(raw.stopSequences, `${name}.stopSequences`, source),
    presencePenalty: optionalNumber(raw.presencePenalty, `${name}.presencePenalty`, source),
    frequencyPenalty: optionalNumber(raw.frequencyPenalty, `${name}.frequencyPenalty`, source),
  };
}

function optionalReasoningEffort(
  value: unknown,
  name: string,
  source: string
): "low" | "medium" | "high" | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== "low" && value !== "medium" && value !== "high") {
    throw new Error(`${name} must be low, medium, or high: ${source}`);
  }
  return value;
}

function optionalPermissionMap(
  value: unknown,
  source: string
): Record<string, PermissionDecision> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`permissions must be an object: ${source}`);
  }

  const permissions: Record<string, PermissionDecision> = {};
  for (const [tool, decision] of Object.entries(value)) {
    if (decision !== "allow" && decision !== "deny" && decision !== "ask") {
      throw new Error(`permissions.${tool} must be allow, deny, or ask: ${source}`);
    }
    permissions[tool] = decision;
  }
  return permissions;
}

function optionalUi(value: unknown, source: string): KintsugiConfig["ui"] {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`ui must be an object: ${source}`);
  }
  const raw = value as Record<string, unknown>;
  return { theme: optionalString(raw.theme, "ui.theme", source) };
}

function optionalProvider(value: unknown, source: string): ProviderType | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !isProviderType(value)) {
    throw new Error(`provider must be mock, openai-chat, openai-responses, or anthropic-messages: ${source}`);
  }
  return value;
}

function optionalString(value: unknown, name: string, source: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string: ${source}`);
  }
  return value;
}

function requiredString(value: unknown, name: string, source: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string: ${source}`);
  }
  return value;
}

function optionalBoolean(value: unknown, name: string, source: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean: ${source}`);
  }
  return value;
}

function optionalNumber(value: unknown, name: string, source: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a number: ${source}`);
  }
  return value;
}

function requiredNumber(value: unknown, name: string, source: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a number: ${source}`);
  }
  return value;
}

function optionalStringArray(value: unknown, name: string, source: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array: ${source}`);
  }
  return value.map((s: unknown) => String(s));
}

function optionalHooks(value: unknown, source: string): HooksConfig | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`hooks must be an object: ${source}`);
  }
  const raw = value as Record<string, unknown>;
  const mode = raw.mode;
  if (mode !== undefined && mode !== "strict" && mode !== "permissive") {
    throw new Error(`hooks.mode must be strict or permissive: ${source}`);
  }
  return {
    mode: mode as "strict" | "permissive" | undefined,
    timeoutMs: optionalNumber(raw.timeoutMs, "hooks.timeoutMs", source),
    pre: optionalStringRecord(raw.pre, "hooks.pre", source),
    post: optionalStringRecord(raw.post, "hooks.post", source),
  };
}

function optionalStringRecord(
  value: unknown,
  name: string,
  source: string
): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object: ${source}`);
  }
  const record: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof val !== "string") {
      throw new Error(`${name}.${key} must be a string: ${source}`);
    }
    record[key] = val;
  }
  return record;
}

// ----------------------------------------------------------------------------
// Provider registration (wizard) support
// ----------------------------------------------------------------------------

/**
 * Default directory for provider API-key files created by the registration
 * wizard. Secrets live here (mode 0600), never directly in config.yaml.
 */
export const DEFAULT_PROVIDER_KEY_DIR = path.join(
  homedir(),
  ".config",
  "kintsugi",
  "keys"
);

export interface ProviderRegistration {
  /** Preset name, e.g. "groq" or "crof". */
  name: string;
  /** Provider base URL, e.g. "https://api.groq.com/openai/v1". */
  baseUrl: string;
  /** API key — written to a key file, never stored in config.yaml. */
  apiKey?: string;
  /** Adapter type (default "openai-chat"). */
  adapter?: string;
  /** Default model id from the scan or manual entry. */
  defaultModel?: string;
}

export interface ProviderWriteOptions {
  /** Config file path (default DEFAULT_HOME_CONFIG_PATH). */
  configPath?: string;
  /** Directory for key files (default DEFAULT_PROVIDER_KEY_DIR). */
  keyFileDir?: string;
}

export interface ProviderWriteResult {
  configPath: string;
  keyFilePath?: string;
  backedUp: boolean;
}

function resolveWriteConfigPath(options?: ProviderWriteOptions): string {
  return options?.configPath ?? DEFAULT_HOME_CONFIG_PATH;
}

function resolveKeyFileDir(options?: ProviderWriteOptions): string {
  return options?.keyFileDir ?? DEFAULT_PROVIDER_KEY_DIR;
}

/** Read the raw (un-normalized) config YAML as a plain object. Returns {} when missing. */
function readRawConfig(configPath: string): Record<string, unknown> {
  if (!existsSync(configPath)) {
    return {};
  }
  const parsed = parseYaml(readFileSync(configPath, "utf-8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}

function backupConfig(configPath: string): boolean {
  if (!existsSync(configPath)) {
    return false;
  }
  copyFileSync(configPath, `${configPath}.bak`);
  return true;
}

function writeRawConfig(configPath: string, config: Record<string, unknown>): void {
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, stringifyYaml(config), "utf-8");
}

function writeKeyFile(keyFileDir: string, name: string, apiKey: string): string {
  mkdirSync(keyFileDir, { recursive: true });
  const keyPath = path.join(keyFileDir, `${name}.key`);
  writeFileSync(keyPath, `${apiKey.trim()}\n`, { encoding: "utf-8", mode: 0o600 });
  try {
    chmodSync(keyPath, 0o600);
  } catch {
    // chmod may fail on some platforms; the open mode already restricts access.
  }
  return keyPath;
}

/**
 * Register a custom provider as a provider preset in config.yaml. The API key
 * (if provided) is persisted to a key file and referenced via `keyFile`.
 * Creates a `config.yaml.bak` backup before overwriting.
 */
export function addProviderToConfig(
  registration: ProviderRegistration,
  options?: ProviderWriteOptions
): ProviderWriteResult {
  const name = registration.name.trim();
  if (!name) {
    throw new Error("Provider name must not be empty.");
  }
  if (!registration.baseUrl.trim()) {
    throw new Error("Provider base URL must not be empty.");
  }

  const configPath = resolveWriteConfigPath(options);
  const keyFileDir = resolveKeyFileDir(options);

  const config = readRawConfig(configPath);
  const presets = (config.providerPresets as Record<string, unknown> | undefined) ?? {};
  const entry: Record<string, unknown> = {
    adapter: registration.adapter?.trim() || "openai-chat",
    baseUrl: registration.baseUrl.trim(),
  };

  let keyFilePath: string | undefined;
  if (registration.apiKey && registration.apiKey.trim()) {
    keyFilePath = writeKeyFile(keyFileDir, name, registration.apiKey);
    entry.keyFile = keyFilePath;
  }
  if (registration.defaultModel && registration.defaultModel.trim()) {
    entry.defaultModel = registration.defaultModel.trim();
  }

  presets[name] = entry;
  config.providerPresets = presets;

  const backedUp = backupConfig(configPath);
  writeRawConfig(configPath, config);
  return { configPath, keyFilePath, backedUp };
}

/**
 * Update the default model for a registered provider preset. Creates a
 * `config.yaml.bak` backup before overwriting. Throws if the preset is missing.
 */
export function setProviderDefaultModel(
  name: string,
  model: string,
  options?: ProviderWriteOptions
): ProviderWriteResult {
  const trimmedName = name.trim();
  const trimmedModel = model.trim();
  if (!trimmedName) {
    throw new Error("Provider name must not be empty.");
  }
  if (!trimmedModel) {
    throw new Error("Model must not be empty.");
  }

  const configPath = resolveWriteConfigPath(options);
  const config = readRawConfig(configPath);
  const presets = config.providerPresets as Record<string, unknown> | undefined;
  if (!presets || !presets[trimmedName]) {
    throw new Error(`Provider preset "${trimmedName}" is not registered.`);
  }

  const entry = presets[trimmedName];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`Provider preset "${trimmedName}" is malformed.`);
  }
  (entry as Record<string, unknown>).defaultModel = trimmedModel;

  const backedUp = backupConfig(configPath);
  writeRawConfig(configPath, config);
  return { configPath, backedUp };
}

/** Return the names of all registered custom provider presets in config.yaml. */
export function listRegisteredProviders(options?: ProviderWriteOptions): string[] {
  const configPath = resolveWriteConfigPath(options);
  const config = readRawConfig(configPath);
  const presets = config.providerPresets as Record<string, unknown> | undefined;
  if (!presets || typeof presets !== "object") {
    return [];
  }
  return Object.keys(presets).sort();
}

/** Whether a provider preset name is already registered. */
export function isProviderRegistered(name: string, options?: ProviderWriteOptions): boolean {
  return listRegisteredProviders(options).includes(name.trim());
}

function optionalMcpServers(
  value: unknown,
  source: string
): Record<string, McpServerConfig> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`mcpServers must be an object: ${source}`);
  }

  const servers: Record<string, McpServerConfig> = {};
  for (const [name, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`mcpServers.${name} must be an object: ${source}`);
    }
    const raw = entry as Record<string, unknown>;
    const command = requiredString(raw.command, `mcpServers.${name}.command`, source);
    const args = optionalStringArray(raw.args, `mcpServers.${name}.args`, source);

    let env: Record<string, string> | undefined;
    if (raw.env !== undefined) {
      if (!raw.env || typeof raw.env !== "object" || Array.isArray(raw.env)) {
        throw new Error(`mcpServers.${name}.env must be an object: ${source}`);
      }
      env = {};
      for (const [key, val] of Object.entries(raw.env)) {
        env[key] = String(val);
      }
    }

    servers[name] = {
      command,
      ...(args !== undefined ? { args } : {}),
      ...(env !== undefined ? { env } : {}),
    };
  }
  return servers;
}

