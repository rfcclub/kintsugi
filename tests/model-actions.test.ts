import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedConfig } from "../src/config/config.js";
import { defaultPermissionConfig } from "../src/runtime/permissions.js";
import { bootRuntime } from "../src/runtime/runtime.js";
import {
  applyModelSelection,
  createModelProviderOptions,
  createProviderForModelSelection,
  formatModelInspect,
  formatModelProfiles,
  listModelProfiles,
  resolveModelSelection,
} from "../src/ui/commands/model-actions.js";

describe("model command actions", () => {
  it("resolves selected model data and creates provider options", () => {
    const selection = resolveModelSelection({
      ...config(),
      provider: "openai-chat",
      model: "gpt-4.1-mini",
      modelProfile: "fast",
      modelConfig: { temperature: 0.2, maxTokens: 2048 },
      providerSettings: { baseUrl: "https://example.test/v1", timeoutMs: 1000, keyFile: "/tmp/key" },
    });

    expect(selection).toMatchObject({
      provider: "openai-chat",
      model: "gpt-4.1-mini",
      modelProfile: "fast",
      modelConfig: { temperature: 0.2, maxTokens: 2048 },
      providerSettings: { baseUrl: "https://example.test/v1", timeoutMs: 1000, keyFile: "/tmp/key" },
    });
    expect(selection.providerOptions).toEqual({
      baseUrl: "https://example.test/v1",
      timeoutMs: 1000,
      keyFile: "/tmp/key",
      temperature: 0.2,
      maxTokens: 2048,
      model: "gpt-4.1-mini",
    });
  });

  it("lets explicit model config override provider settings in provider options", () => {
    const options = createModelProviderOptions({
      model: "chosen-model",
      providerSettings: { model: "provider-default", temperature: 0.8, maxTokens: 4096 },
      modelConfig: { temperature: 0.1 },
    });

    expect(options).toEqual({
      model: "chosen-model",
      temperature: 0.1,
      maxTokens: 4096,
    });
  });

  it("keeps provider-level model when selection model is unset", () => {
    expect(createModelProviderOptions({
      providerSettings: { model: "provider-default" },
    })).toEqual({
      model: "provider-default",
    });
  });

  it("applies resolved model selection to a runtime", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    const selection = resolveModelSelection({
      ...config(),
      provider: "anthropic-messages",
      model: "claude-test",
      modelConfig: { reasoning_effort: "high" },
    });

    applyModelSelection(runtime, selection);

    expect(runtime.provider).toBe("anthropic-messages");
    expect(runtime.model).toBe("claude-test");
    expect(runtime.modelConfig).toEqual({ reasoning_effort: "high" });
  });

  it("applies provider-level model to runtime metadata when top-level model is unset", () => {
    const runtime = bootRuntime({ noSubstrate: true });
    const selection = resolveModelSelection({
      ...config(),
      providerSettings: { model: "provider-default" },
    });

    applyModelSelection(runtime, selection);

    expect(runtime.model).toBe("provider-default");
  });

  it("creates providers from a resolved selection", () => {
    const provider = createProviderForModelSelection(
      resolveModelSelection({
        ...config(),
        provider: "mock",
        model: "mock-model",
      })
    );

    expect(provider.id).toBe("mock");
  });

  it("resolves configured profile provider, model, settings, and model config", () => {
    const selection = resolveModelSelection(
      {
        ...config(),
        provider: "mock",
        providers: {
          "openai-chat": { baseUrl: "https://api.openai.com/v1", keyFile: "/tmp/openai-key" },
        },
        modelProfiles: {
          "example-kimi": {
            provider: "openai-chat",
            model: "kimi-k2.6",
            settings: { baseUrl: "https://api.example.com/v1", keyFile: "/tmp/example-key", maxTokens: 128 },
            config: { temperature: 0.2 },
          },
        },
      },
      { modelProfile: "example-kimi" }
    );

    expect(selection).toMatchObject({
      provider: "openai-chat",
      model: "kimi-k2.6",
      modelProfile: "example-kimi",
      modelConfig: { temperature: 0.2 },
      providerSettings: {
        baseUrl: "https://api.example.com/v1",
        keyFile: "/tmp/example-key",
        maxTokens: 128,
      },
    });
    expect(selection.providerOptions).toMatchObject({
      baseUrl: "https://api.example.com/v1",
      keyFile: "/tmp/example-key",
      maxTokens: 128,
      temperature: 0.2,
      model: "kimi-k2.6",
    });
  });

  it("lists profiles with active and blocked state", () => {
    const keyFile = tempKeyFile();
    const profiles = listModelProfiles({
      ...config(),
      provider: "openai-chat",
      model: "kimi-k2.6",
      modelProfile: "example-kimi",
      modelProfiles: {
        "example-kimi": {
          provider: "openai-chat",
          model: "kimi-k2.6",
          settings: { keyFile },
        },
        broken: {
          provider: "not-real",
          model: "x",
        },
      },
    });

    expect(profiles[0]).toMatchObject({
      name: "example-kimi",
      provider: "openai-chat",
      model: "kimi-k2.6",
      active: true,
      blocked: false,
    });
    expect(profiles[1]).toMatchObject({
      name: "broken",
      active: false,
      blocked: true,
    });
  });

  it("formats profile list and inspect output without secret contents", () => {
    const keyFile = tempKeyFile();
    const selection = resolveModelSelection({
      ...config(),
      provider: "openai-chat",
      model: "kimi-k2.6",
      modelProfile: "example-kimi",
      providerSettings: { keyFile, baseUrl: "https://api.example.com/v1" },
      modelConfig: { maxTokens: 128 },
      modelProfiles: {
        "example-kimi": {
          provider: "openai-chat",
          model: "kimi-k2.6",
          settings: { keyFile, baseUrl: "https://api.example.com/v1" },
        },
      },
    });

    const list = formatModelProfiles({
      ...config(),
      provider: "openai-chat",
      model: "kimi-k2.6",
      modelProfile: "example-kimi",
      providerSettings: { keyFile, baseUrl: "https://api.example.com/v1" },
      modelProfiles: {
        "example-kimi": {
          provider: "openai-chat",
          model: "kimi-k2.6",
          settings: { keyFile, baseUrl: "https://api.example.com/v1" },
        },
      },
    });
    const inspect = formatModelInspect(selection);

    expect(list).toContain("example-kimi [active]: openai-chat/kimi-k2.6");
    expect(inspect).toContain(`key: keyFile:${keyFile}`);
    expect(inspect).not.toContain("sk-");
  });

  it("rejects unknown profile selection", () => {
    expect(() => resolveModelSelection(config(), { modelProfile: "missing" })).toThrow(
      "Unknown model profile: missing"
    );
  });
});

function config(): ResolvedConfig {
  return {
    provider: "mock",
    noSubstrate: true,
    providerSettings: {},
    permissions: defaultPermissionConfig,
    sources: [],
  };
}

function tempKeyFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "kintsugi-model-actions-"));
  const file = join(dir, "key");
  writeFileSync(file, "sk-test\n", "utf-8");
  return file;
}
