import { BUILT_IN_PROVIDER_PRESETS, type ResolvedConfig, type ProviderSettings } from "../../config/config.js";
import type { KintsugiRuntime } from "../../runtime/runtime.js";
import { createProvider, type CreateProviderOptions } from "../../providers/registry.js";
import type { Provider } from "../../providers/provider.js";
import { isProviderType, type ModelConfig, type ProviderPresetEntry, type ProviderType } from "../../providers/config.js";
import { runConfigDoctor } from "../../config/doctor.js";

export interface ModelSelection {
  provider: ProviderType;
  providerPreset?: string;
  model?: string;
  modelProfile?: string;
  modelConfig?: ModelConfig;
  providerSettings: ProviderSettings;
  providerOptions: CreateProviderOptions;
}

export interface ModelSelectionOverride {
  provider?: ProviderType;
  model?: string;
  modelProfile?: string;
  modelConfig?: ModelConfig;
  providerSettings?: ProviderSettings;
}

export function resolveModelSelection(
  config: ResolvedConfig,
  override: ModelSelectionOverride = {}
): ModelSelection {
  const profileName = override.modelProfile;
  const profile = profileName ? config.modelProfiles?.[profileName] : undefined;
  if (profileName && !profile) {
    throw new Error(`Unknown model profile: ${profileName}`);
  }

  const providerPreset = profile?.preset ?? (profileName ? undefined : config.providerPreset);
  const providerPresets = {
    ...BUILT_IN_PROVIDER_PRESETS,
    ...(config.providerPresets ?? {}),
  };
  const preset = providerPreset ? providerPresets[providerPreset] : undefined;
  if (providerPreset && !preset) {
    throw new Error(`Unknown provider preset: ${providerPreset}`);
  }
  const rawProvider = override.provider ?? profile?.provider ?? preset?.adapter ?? config.provider;
  if (!isProviderType(rawProvider)) {
    throw new Error(`Model profile "${profileName}" uses unknown provider: ${rawProvider}`);
  }

  const provider = rawProvider;
  const model = override.model ?? profile?.model ?? preset?.defaultModel ?? config.model;
  const modelConfig = {
    ...(profile?.config ?? {}),
    ...(config.modelConfig ?? {}),
    ...(override.modelConfig ?? {}),
  } as ModelConfig;
  const providerSettings = {
    ...definedProviderSettings(config.providers?.[provider] ?? (provider === config.provider ? config.providerSettings : {})),
    ...(preset ? definedProviderSettings(providerPresetToSettings(preset)) : {}),
    ...definedProviderSettings(profile?.settings ?? {}),
    ...definedProviderSettings(override.providerSettings ?? {}),
  };

  return {
    provider,
    model,
    modelProfile: profileName ?? config.modelProfile,
    providerPreset,
    modelConfig: Object.keys(modelConfig).length > 0 ? modelConfig : undefined,
    providerSettings,
    providerOptions: createModelProviderOptions({ model, modelConfig: Object.keys(modelConfig).length > 0 ? modelConfig : undefined, providerSettings }),
  };
}

export function createModelProviderOptions(
  selection: Pick<ModelSelection, "model" | "modelConfig" | "providerSettings">
): CreateProviderOptions {
  return {
    ...selection.providerSettings,
    ...selection.modelConfig,
    model: selection.model ?? selection.providerSettings.model,
  };
}

export function createProviderForModelSelection(selection: ModelSelection): Provider {
  return createProvider(selection.provider, selection.providerOptions);
}

export function applyModelSelection(runtime: KintsugiRuntime, selection: ModelSelection): void {
  runtime.provider = selection.provider;
  runtime.model = selection.model ?? selection.providerSettings.model;
  runtime.modelProfile = selection.modelProfile;
  runtime.providerPreset = selection.providerPreset;
  runtime.modelConfig = selection.modelConfig;
}

export interface ModelProfileSummary {
  name: string;
  provider: string;
  model: string;
  active: boolean;
  blocked: boolean;
  issues: string[];
}

export function listModelProfiles(config: ResolvedConfig): ModelProfileSummary[] {
  return Object.entries(config.modelProfiles ?? {}).map(([name, profile]) => {
    const active = name === config.modelProfile;
    let selection: ModelSelection | undefined;
    let issues: string[] = [];
    try {
      selection = resolveModelSelection(config, { modelProfile: name });
      issues = runConfigDoctor({
        ...config,
        provider: selection.provider,
        model: selection.model,
        modelProfile: selection.modelProfile,
        modelConfig: selection.modelConfig,
        providerSettings: selection.providerSettings,
      })
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message);
    } catch (error) {
      issues = [error instanceof Error ? error.message : String(error)];
    }

    return {
      name,
      provider: selection?.provider ?? profile.provider ?? profile.preset ?? "unknown",
      model: selection?.model ?? profile.model ?? "(not set)",
      active,
      blocked: issues.length > 0,
      issues,
    };
  });
}

export function formatModelProfiles(config: ResolvedConfig): string {
  const profiles = listModelProfiles(config);
  const lines = [
    formatActiveModel(config),
    "",
    "profiles:",
  ];

  if (profiles.length === 0) {
    lines.push("  (none configured)");
  } else {
    for (const profile of profiles) {
      const markers = [
        profile.active ? "active" : undefined,
        profile.blocked ? "blocked" : undefined,
      ].filter(Boolean).join(", ");
      lines.push(`  ${profile.name}${markers ? ` [${markers}]` : ""}: ${profile.provider}/${profile.model}`);
      for (const issue of profile.issues) {
        lines.push(`    error: ${issue}`);
      }
    }
  }

  lines.push("");
  lines.push("manual:");
  lines.push(`  ${config.provider}${config.model ? `/${config.model}` : ""}`);
  return lines.join("\n");
}

export function formatModelInspect(selection: ModelSelection): string {
  const lines = [
    `profile: ${selection.modelProfile ?? "(none)"}`,
    `preset: ${selection.providerPreset ?? "(none)"}`,
    `provider: ${selection.provider}`,
    `model: ${selection.model ?? "(not set)"}`,
    `baseUrl: ${selection.providerSettings.baseUrl ?? "(default)"}`,
    `key: ${formatKeySource(selection.providerSettings)}`,
  ];

  const modelConfig = selection.modelConfig
    ? Object.entries(selection.modelConfig).filter(([, value]) => value !== undefined)
    : [];
  if (modelConfig.length > 0) {
    lines.push("modelConfig:");
    for (const [key, value] of modelConfig) {
      lines.push(`  ${key}: ${Array.isArray(value) ? `[${value.join(", ")}]` : String(value)}`);
    }
  }

  const doctorIssues = runConfigDoctor({
    provider: selection.provider,
    model: selection.model,
    modelProfile: selection.modelProfile,
    providerPreset: selection.providerPreset,
    noSubstrate: true,
    providerSettings: selection.providerSettings,
    modelConfig: selection.modelConfig,
    permissions: { rules: [], defaultDecision: "deny" },
    sources: [],
  }).filter((issue) => issue.severity !== "info");
  if (doctorIssues.length > 0) {
    lines.push("doctor:");
    for (const issue of doctorIssues) {
      lines.push(`  ${issue.severity}: ${issue.message}`);
    }
  }

  return lines.join("\n");
}

export function formatActiveModel(config: { provider?: string; model?: string; modelProfile?: string }): string {
  const providerModel = `${config.provider ?? "unknown"}${config.model ? `/${config.model}` : ""}`;
  return config.modelProfile
    ? `active: ${config.modelProfile} (${providerModel})`
    : `active: ${providerModel}`;
}

function formatKeySource(settings: ProviderSettings): string {
  if (settings.keyFile) {
    return `keyFile:${settings.keyFile}`;
  }
  if (process.env.KINTSUGI_API_KEY?.trim()) {
    return "env:KINTSUGI_API_KEY";
  }
  return "missing";
}

function providerPresetToSettings(preset: ProviderPresetEntry): ProviderSettings {
  return {
    baseUrl: preset.baseUrl,
    model: preset.model,
    maxTokens: preset.maxTokens,
    timeoutMs: preset.timeoutMs,
    anthropicVersion: preset.anthropicVersion,
    keyFile: preset.keyFile,
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
