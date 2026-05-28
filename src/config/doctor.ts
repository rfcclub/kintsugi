import { constants, existsSync, accessSync } from "node:fs";
import { env } from "node:process";
import { BUILT_IN_PROVIDER_PRESETS, expandUserPath, loadConfigFiles, type KintsugiConfig, type ResolvedConfig } from "./config.js";
import { isProviderType, type ModelConfig } from "../providers/config.js";

export interface DoctorIssue {
  severity: "info" | "warning" | "error";
  message: string;
}

export function formatConfigShow(config: ResolvedConfig): string {
  const items: string[] = [
    `provider: ${config.provider}`,
    `providerPreset: ${config.providerPreset ?? "(none)"}`,
    `model: ${config.model ?? "(not set)"}`,
    `substrate: ${config.substrate ?? "(not set)"}`,
    `workspace: ${config.workspace ?? "~/.config/kintsugi/workspace"}`,
    `workspaceBudget: ${config.workspaceBudget ?? 65536}`,
    `noSubstrate: ${config.noSubstrate}`,
  ];

  if (config.modelProfile) {
    items.push(`modelProfile: ${config.modelProfile}`);
  }

  if (config.modelConfig) {
    items.push(`modelConfig:`);
    for (const [key, value] of Object.entries(config.modelConfig)) {
      if (value !== undefined) {
        items.push(`  ${key}: ${formatConfigValue(value)}`);
      }
    }
  }

  if (config.workspaceRoots?.length) {
    items.push(`workspaceRoots:`);
    for (const root of config.workspaceRoots) {
      items.push(`  - ${root}`);
    }
  }

  items.push("");
  items.push("sources:");
  for (const source of config.sources) {
    items.push(`  - ${source}`);
  }

  items.push("");
  items.push("permissions:");
  for (const rule of config.permissions.rules) {
    items.push(`  ${rule.tool}: ${rule.decision}`);
  }

  return items.join("\n");
}

export function runConfigDoctor(config: ResolvedConfig, raw?: KintsugiConfig): DoctorIssue[] {
  const issues: DoctorIssue[] = [];

  // Check API key
  const apiKey = env.KINTSUGI_API_KEY;
  const hasKeyFile = Boolean(config.providerSettings.keyFile?.trim() || config.keyFile?.trim() || env.KINTSUGI_KEY_FILE?.trim());
  if (!apiKey?.trim() && !hasKeyFile) {
    if (config.provider !== "mock") {
      issues.push({
        severity: "error",
        message: `KINTSUGI_API_KEY is not set. Provider "${config.provider}" requires an API key.`,
      });
    }
  }

  // Check key file
  const rawConfig = raw ?? getRawConfig();
  const keyFiles = [
    rawConfig?.keyFile,
    config.providerSettings.keyFile,
    config.keyFile,
  ].filter((value): value is string => Boolean(value));
  for (const keyFile of new Set(keyFiles)) {
    const expanded = expandUserPath(keyFile);
    if (!existsSync(expanded)) {
      issues.push({
        severity: config.provider === "mock" ? "warning" : "error",
        message: `keyFile "${keyFile}" does not exist.`,
      });
    } else {
      try {
        accessSync(expanded, constants.R_OK);
      } catch {
        issues.push({
          severity: "error",
          message: `keyFile "${keyFile}" is not readable.`,
        });
      }
    }
  }

  if (!config.model && config.provider !== "mock") {
    issues.push({
      severity: "error",
      message: `Provider "${config.provider}" requires a model.`,
    });
  }

  if (config.providerPreset) {
    const presets = { ...BUILT_IN_PROVIDER_PRESETS, ...(rawConfig?.providerPresets ?? {}) };
    if (!presets[config.providerPreset]) {
      issues.push({
        severity: "error",
        message: `Unknown provider preset: ${config.providerPreset}`,
      });
    }
  }

  const baseUrl = config.providerSettings.baseUrl;
  if (baseUrl && includesEndpointPath(baseUrl)) {
    issues.push({
      severity: "warning",
      message: `baseUrl "${baseUrl}" should be the API root, not a completion endpoint path.`,
    });
  }
  if (config.providerPreset === "openai-compatible" && !baseUrl) {
    issues.push({
      severity: "error",
      message: `Provider preset "openai-compatible" requires an explicit baseUrl.`,
    });
  }

  // Check substrate path
  if (config.substrate && !config.noSubstrate) {
    if (!existsSync(config.substrate)) {
      issues.push({
        severity: "warning",
        message: `Substrate path "${config.substrate}" does not exist.`,
      });
    }
  }

  const resolvedWorkspace = expandUserPath(config.workspace ?? "~/.config/kintsugi/workspace");
  if (!existsSync(resolvedWorkspace)) {
    issues.push({
      severity: "warning",
      message: `Kintsugi workspace "${config.workspace ?? "~/.config/kintsugi/workspace"}" does not exist.`,
    });
  }

  // Check workspace roots
  if (config.workspaceRoots?.length) {
    for (const root of config.workspaceRoots) {
      if (!existsSync(root)) {
        issues.push({
          severity: "warning",
          message: `Workspace root "${root}" does not exist.`,
        });
      }
    }
  }

  // Check model profile consistency
  if (rawConfig?.modelProfile && rawConfig?.modelProfiles) {
    if (!rawConfig.modelProfiles[rawConfig.modelProfile]) {
      issues.push({
        severity: "error",
        message: `modelProfile "${rawConfig.modelProfile}" is not defined in modelProfiles.`,
      });
    }
  }

  // Check provider type validity (profile may use a non-standard provider string)
  if (config.modelProfile && rawConfig?.modelProfiles?.[config.modelProfile]) {
    const profileProvider = rawConfig.modelProfiles[config.modelProfile].provider;
    if (profileProvider && !isProviderType(profileProvider)) {
      issues.push({
        severity: "warning",
        message: `Model profile "${config.modelProfile}" uses provider "${profileProvider}" which is not a known provider type.`,
      });
    }
  }

  if (issues.length === 0) {
    issues.push({
      severity: "info",
      message: "Configuration looks good. No issues found.",
    });
  }

  return issues;
}

function includesEndpointPath(baseUrl: string): boolean {
  return /\/(chat\/completions|responses|messages)\/?$/.test(baseUrl.replace(/\/+$/, ""));
}

function getRawConfig(): KintsugiConfig | undefined {
  try {
    const { configs } = loadConfigFiles();
    return configs.reduce((acc, c) => ({ ...acc, ...c }), {} as KintsugiConfig);
  } catch {
    return undefined;
  }
}

function formatConfigValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.join(", ")}]`;
  }
  return String(value);
}
