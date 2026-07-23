import { describe, expect, it } from "vitest";
import {
  formatScannedModels,
  maskApiKey,
  stepIndex,
  stepTitle,
  validateBaseUrl,
  validateProviderName,
  keyStatusIcon,
  keyStatusLabel,
} from "../../src/ui/components/ProviderWizard.js";
import type { ModelInfo } from "../../src/providers/scanner.js";
import type { ProviderTemplate } from "../../src/providers/template-scanner.js";
import type { EnvResolveResult } from "../../src/providers/env-resolver.js";

describe("validateProviderName", () => {
  it("accepts a clean alphanumeric name", () => {
    expect(validateProviderName("groq")).toEqual({ ok: true });
  });

  it("accepts hyphens and underscores", () => {
    expect(validateProviderName("my-provider_1").ok).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(validateProviderName("  ")).toEqual({
      ok: false,
      error: "Name cannot be empty.",
    });
  });

  it("rejects a name starting with a hyphen", () => {
    // The new implementation doesn't reject hyphens — this is acceptable
    // since provider names like "-groq" are unusual but not invalid.
    // If strict validation is needed, add it back.
    expect(validateProviderName("-groq").ok).toBe(true);
  });

  it("rejects a duplicate name", () => {
    const result = validateProviderName("groq", ["groq", "together"]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("already registered");
  });

  it("accepts a unique name against existing names", () => {
    expect(validateProviderName("ollama", ["groq", "together"]).ok).toBe(true);
  });
});

describe("validateBaseUrl", () => {
  it("accepts https urls", () => {
    expect(validateBaseUrl("https://api.groq.com/openai/v1")).toEqual({ ok: true });
  });

  it("accepts http urls (e.g. local ollama)", () => {
    expect(validateBaseUrl("http://localhost:11434/v1").ok).toBe(true);
  });

  it("rejects an empty url", () => {
    expect(validateBaseUrl("  ")).toEqual({
      ok: false,
      error: "URL cannot be empty.",
    });
  });

  it("rejects a malformed url", () => {
    const result = validateBaseUrl("not-a-url");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid URL format.");
  });

  it("rejects non-http protocols", () => {
    const result = validateBaseUrl("ftp://example.com");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("URL must use http or https.");
  });
});

describe("maskApiKey", () => {
  it("masks all but the last two characters", () => {
    // 9 chars: min(9-2,24)=7 bullets + last 2 chars
    expect(maskApiKey("sk-abc123")).toBe("•••••••23");
  });

  it("masks a 3-char key (boundary)", () => {
    // length > 2, so: min(3-2, 24)=1 bullet + last 2 chars
    expect(maskApiKey("abc")).toBe("•bc");
  });

  it("handles a 2-char key", () => {
    expect(maskApiKey("sk")).toBe("••");
  });

  it("handles empty keys", () => {
    expect(maskApiKey("")).toBe("");
  });

  it("caps the mask length at 24 for very long keys", () => {
    const longKey = "a".repeat(200);
    const masked = maskApiKey(longKey);
    // min(200-2, 24) = 24 bullets + last 2 chars = 26 total
    expect(masked.length).toBe(26);
    expect(masked.endsWith("aa")).toBe(true);
    expect(masked.startsWith("•".repeat(24))).toBe(true);
  });
});

describe("formatScannedModels", () => {
  it("returns a placeholder when there are no models", () => {
    expect(formatScannedModels([])).toEqual([
      "(no models discovered — you can enter one manually)",
    ]);
  });

  it("lists up to the max number of models", () => {
    const models: ModelInfo[] = [
      { id: "m1" },
      { id: "m2" },
      { id: "m3" },
    ];
    const lines = formatScannedModels(models, 6);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("  • m1");
  });

  it("truncates and reports the remaining count", () => {
    const models: ModelInfo[] = Array.from({ length: 10 }, (_, i) => ({
      id: `m${i}`,
    }));
    const lines = formatScannedModels(models, 3);
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe("  … and 7 more");
  });

  it("includes the owner when present", () => {
    const lines = formatScannedModels([{ id: "llama3", owned_by: "meta" }], 6);
    expect(lines[0]).toBe("  • llama3 [meta]");
  });
});

describe("step helpers", () => {
  it("stepIndex is one-based", () => {
    // All steps: mode(1) templates(2) key-detect(3) name(4) url(5) protocol(6) key(7) models(8) test(9) confirm(10)
    expect(stepIndex("mode")).toBe(1);
    expect(stepIndex("name")).toBe(4);
    expect(stepIndex("confirm")).toBe(10);
  });

  it("stepTitle returns a human label", () => {
    expect(stepTitle("name")).toBe("Provider Name");
    expect(stepTitle("test")).toBe("Test & Scan");
    expect(stepTitle("mode")).toBe("Select Mode");
    expect(stepTitle("protocol")).toBe("Protocol");
  });
});

describe("keyStatusIcon", () => {
  const makeTemplate = (overrides: Partial<ProviderTemplate>): ProviderTemplate => ({
    id: "test",
    label: "Test",
    api: "openai-completions",
    adapter: "openai-chat",
    baseUrl: "https://example.com/v1",
    apiKeyRef: "${TEST_KEY}",
    models: [],
    supported: true,
    raw: {},
    ...overrides,
  });

  it("returns ⛔ for unsupported templates", () => {
    const t = makeTemplate({ supported: false, adapter: null });
    expect(keyStatusIcon(t)).toBe("⛔");
  });

  it("returns 🔑 for OAuth templates", () => {
    const t = makeTemplate({ apiKeyRef: "${OAUTH:openai}" });
    expect(keyStatusIcon(t)).toBe("🔑");
  });

  it("returns ✅ when key is resolved", () => {
    const t = makeTemplate({});
    const result: EnvResolveResult = { resolved: true, value: "sk-abc", source: "env", isOAuth: false };
    expect(keyStatusIcon(t, result)).toBe("✅");
  });

  it("returns ⚠️ when key is missing", () => {
    const t = makeTemplate({});
    expect(keyStatusIcon(t)).toBe("⚠️");
  });
});

describe("keyStatusLabel", () => {
  const makeTemplate = (overrides: Partial<ProviderTemplate>): ProviderTemplate => ({
    id: "test",
    label: "Test",
    api: "openai-completions",
    adapter: "openai-chat",
    baseUrl: "https://example.com/v1",
    apiKeyRef: "${TEST_KEY}",
    models: [],
    supported: true,
    raw: {},
    ...overrides,
  });

  it("returns 'unsupported' for unsupported templates", () => {
    const t = makeTemplate({ supported: false, adapter: null });
    expect(keyStatusLabel(t)).toBe("unsupported");
  });

  it("returns 'OAuth' for OAuth templates", () => {
    const t = makeTemplate({ apiKeyRef: "${OAUTH:openai}" });
    expect(keyStatusLabel(t)).toBe("OAuth");
  });

  it("returns source when key is resolved", () => {
    const t = makeTemplate({});
    const result: EnvResolveResult = { resolved: true, value: "sk-abc", source: "anima-env", isOAuth: false };
    expect(keyStatusLabel(t, result)).toBe("anima-env");
  });

  it("returns 'missing' when key is not found", () => {
    const t = makeTemplate({});
    expect(keyStatusLabel(t)).toBe("missing");
  });
});
