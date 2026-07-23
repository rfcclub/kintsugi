import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Env resolver — resolves ${ENV_VAR} references from providers.d templates
 * by searching process.env, ~/.anima/anima.env, and ~/.zshrc.
 */

export interface EnvResolveResult {
  resolved: boolean;
  value?: string;
  source: "env" | "anima-env" | "zshrc" | "literal" | "default" | null;
  isOAuth: boolean;
  oauthProvider?: string;
}

export interface EnvResolveOptions {
  animaEnvPath?: string;
  zshrcPath?: string;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_ANIMA_ENV_PATH = path.join(homedir(), ".anima", "anima.env");
const DEFAULT_ZSHRC_PATH = path.join(homedir(), ".zshrc");

/**
 * Parse a KEY=VALUE env file (like anima.env).
 * Skips comments (# ...) and empty lines.
 * Handles values with special characters.
 */
export function parseAnimaEnv(envPath?: string): Map<string, string> {
  const filePath = envPath ?? DEFAULT_ANIMA_ENV_PATH;
  const result = new Map<string, string>();

  if (!existsSync(filePath)) return result;

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return result;
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result.set(key, value);
  }

  return result;
}

/**
 * Parse ~/.zshrc, extract export KEY=VALUE pairs.
 * Handles single/double quotes, inline comments, skips non-export lines.
 */
export function parseZshrc(zshrcPath?: string): Map<string, string> {
  const filePath = zshrcPath ?? DEFAULT_ZSHRC_PATH;
  const result = new Map<string, string>();

  if (!existsSync(filePath)) return result;

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return result;
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("export ")) continue;

    const afterExport = trimmed.slice("export ".length).trim();
    const eqIndex = afterExport.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = afterExport.slice(0, eqIndex).trim();
    let value = afterExport.slice(eqIndex + 1).trim();

    // Strip inline comments (but not inside quotes)
    if (value.startsWith('"')) {
      const closingQuote = value.indexOf('"', 1);
      if (closingQuote > 0) {
        value = value.slice(1, closingQuote);
      }
    } else if (value.startsWith("'")) {
      const closingQuote = value.indexOf("'", 1);
      if (closingQuote > 0) {
        value = value.slice(1, closingQuote);
      }
    } else {
      // Unquoted — strip inline comment
      const commentIndex = value.indexOf("#");
      if (commentIndex >= 0) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    result.set(key, value);
  }

  return result;
}

/**
 * Resolve env var from multiple sources with priority:
 * 1. process.env
 * 2. anima.env
 * 3. .zshrc
 */
export function resolveEnvVar(
  name: string,
  options?: EnvResolveOptions
): { value: string; source: string } | null {
  const env = options?.env ?? process.env;

  // 1. process.env
  const envValue = env[name];
  if (envValue !== undefined && envValue.length > 0) {
    return { value: envValue, source: "env" };
  }

  // 2. anima.env
  const animaEnv = parseAnimaEnv(options?.animaEnvPath);
  const animaValue = animaEnv.get(name);
  if (animaValue !== undefined && animaValue.length > 0) {
    return { value: animaValue, source: "anima-env" };
  }

  // 3. .zshrc
  const zshrc = parseZshrc(options?.zshrcPath);
  const zshrcValue = zshrc.get(name);
  if (zshrcValue !== undefined && zshrcValue.length > 0) {
    return { value: zshrcValue, source: "zshrc" };
  }

  return null;
}

/**
 * Resolve an apiKey reference from providers.d.
 * Handles patterns:
 *   ${ENV_VAR}           → scan env sources
 *   ${ENV_VAR:-default}  → with fallback
 *   ${OAUTH:provider}    → mark as OAuth
 *   literal-key          → use directly
 */
export function resolveApiKeyRef(
  ref: string,
  options?: EnvResolveOptions
): EnvResolveResult {
  if (!ref || ref.length === 0) {
    return { resolved: false, source: null, isOAuth: false };
  }

  // Literal key (no ${} pattern)
  if (!ref.startsWith("${")) {
    return { resolved: true, value: ref, source: "literal", isOAuth: false };
  }

  // ${OAUTH:provider}
  const oauthMatch = ref.match(/^\$\{OAUTH:(\w+)\}$/);
  if (oauthMatch) {
    return {
      resolved: false,
      source: null,
      isOAuth: true,
      oauthProvider: oauthMatch[1],
    };
  }

  // ${ENV_VAR} or ${ENV_VAR:-default}
  const envMatch = ref.match(/^\$\{(\w+)(?::-(.*))?\}$/);
  if (envMatch) {
    const varName = envMatch[1];
    const defaultValue = envMatch[2];

    const resolved = resolveEnvVar(varName, options);
    if (resolved) {
      return {
        resolved: true,
        value: resolved.value,
        source: resolved.source as EnvResolveResult["source"],
        isOAuth: false,
      };
    }

    if (defaultValue !== undefined) {
      return { resolved: true, value: defaultValue, source: "default", isOAuth: false };
    }

    return { resolved: false, source: null, isOAuth: false };
  }

  // Unrecognized pattern — treat as literal
  return { resolved: true, value: ref, source: "literal", isOAuth: false };
}
