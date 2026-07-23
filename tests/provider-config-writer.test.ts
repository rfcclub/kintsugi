import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  addProviderToConfig,
  isProviderRegistered,
  listRegisteredProviders,
  setProviderDefaultModel,
} from "../src/config/config.js";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "kintsugi-provreg-"));
}

interface Opts {
  configPath: string;
  keyFileDir: string;
}

function makeOpts(): Opts {
  const dir = tempDir();
  return {
    configPath: path.join(dir, "config.yaml"),
    keyFileDir: path.join(dir, "keys"),
  };
}

function readYaml(file: string): Record<string, unknown> {
  return parseYaml(readFileSync(file, "utf-8")) as Record<string, unknown>;
}

describe("addProviderToConfig", () => {
  afterEach(() => {
    // state is isolated to temp dirs; nothing global to reset
  });

  it("creates a new config.yaml with a provider preset", () => {
    const opts = makeOpts();
    const result = addProviderToConfig(
      { name: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "sk-test" },
      opts
    );

    expect(result.backedUp).toBe(false);
    expect(result.keyFilePath).toBeDefined();
    expect(existsSync(result.keyFilePath!)).toBe(true);
    expect(readFileSync(result.keyFilePath!, "utf-8").trim()).toBe("sk-test");

    const yaml = readYaml(opts.configPath);
    const presets = yaml.providerPresets as Record<string, any>;
    expect(presets.groq.adapter).toBe("openai-chat");
    expect(presets.groq.baseUrl).toBe("https://api.groq.com/openai/v1");
    expect(presets.groq.keyFile).toBe(result.keyFilePath);
    // apiKey must NOT be stored in the YAML
    expect(presets.groq.apiKey).toBeUndefined();
  });

  it("writes the api key to a 0600 key file when provided", () => {
    const opts = makeOpts();
    const result = addProviderToConfig(
      { name: "crof", baseUrl: "https://crof.ai/v1", apiKey: "sk-secret" },
      opts
    );
    expect(result.keyFilePath).toBe(path.join(opts.keyFileDir, "crof.key"));
    expect(existsSync(result.keyFilePath!)).toBe(true);
  });

  it("omits the key file when no api key is provided", () => {
    const opts = makeOpts();
    const result = addProviderToConfig(
      { name: "local", baseUrl: "http://localhost:11434/v1" },
      opts
    );
    expect(result.keyFilePath).toBeUndefined();
    const presets = readYaml(opts.configPath).providerPresets as Record<string, any>;
    expect(presets.local.keyFile).toBeUndefined();
  });

  it("preserves existing config keys and backs up the previous file", () => {
    const opts = makeOpts();
    writeFileSync(opts.configPath, "provider: mock\nmodel: keep-me\n", "utf-8");
    const result = addProviderToConfig(
      { name: "groq", baseUrl: "https://api.groq.com/openai/v1" },
      opts
    );
    expect(result.backedUp).toBe(true);
    expect(existsSync(`${opts.configPath}.bak`)).toBe(true);
    expect(readFileSync(`${opts.configPath}.bak`, "utf-8")).toContain("keep-me");

    const yaml = readYaml(opts.configPath);
    expect(yaml.provider).toBe("mock");
    expect(yaml.model).toBe("keep-me");
    expect((yaml.providerPresets as any).groq).toBeDefined();
  });

  it("overwrites an existing provider preset with the new entry", () => {
    const opts = makeOpts();
    addProviderToConfig({ name: "groq", baseUrl: "https://old.test/v1" }, opts);
    addProviderToConfig(
      { name: "groq", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama3-70b" },
      opts
    );
    const presets = readYaml(opts.configPath).providerPresets as Record<string, any>;
    expect(presets.groq.baseUrl).toBe("https://api.groq.com/openai/v1");
    expect(presets.groq.defaultModel).toBe("llama3-70b");
  });

  it("uses a custom adapter when provided", () => {
    const opts = makeOpts();
    addProviderToConfig(
      { name: "anthropic-custom", baseUrl: "https://api.anthropic.com/v1", adapter: "anthropic-messages" },
      opts
    );
    const presets = readYaml(opts.configPath).providerPresets as Record<string, any>;
    expect(presets["anthropic-custom"].adapter).toBe("anthropic-messages");
  });

  it("throws on an empty name", () => {
    const opts = makeOpts();
    expect(() =>
      addProviderToConfig({ name: "  ", baseUrl: "https://x.test/v1" }, opts)
    ).toThrow("Provider name must not be empty");
  });

  it("throws on an empty base url", () => {
    const opts = makeOpts();
    expect(() => addProviderToConfig({ name: "groq", baseUrl: "" }, opts)).toThrow(
      "Provider base URL must not be empty"
    );
  });
});

describe("setProviderDefaultModel", () => {
  it("updates the default model for a registered provider", () => {
    const opts = makeOpts();
    addProviderToConfig({ name: "groq", baseUrl: "https://api.groq.com/openai/v1" }, opts);
    const result = setProviderDefaultModel("groq", "llama3-70b", opts);
    expect(result.backedUp).toBe(true);
    const presets = readYaml(opts.configPath).providerPresets as Record<string, any>;
    expect(presets.groq.defaultModel).toBe("llama3-70b");
  });

  it("throws when the provider is not registered", () => {
    const opts = makeOpts();
    expect(() => setProviderDefaultModel("missing", "model", opts)).toThrow(
      'Provider preset "missing" is not registered'
    );
  });

  it("throws on empty model", () => {
    const opts = makeOpts();
    addProviderToConfig({ name: "groq", baseUrl: "https://api.groq.com/openai/v1" }, opts);
    expect(() => setProviderDefaultModel("groq", "  ", opts)).toThrow("Model must not be empty");
  });
});

describe("listRegisteredProviders / isProviderRegistered", () => {
  it("lists registered providers in sorted order", () => {
    const opts = makeOpts();
    addProviderToConfig({ name: "zeta", baseUrl: "https://z.test/v1" }, opts);
    addProviderToConfig({ name: "alpha", baseUrl: "https://a.test/v1" }, opts);
    expect(listRegisteredProviders(opts)).toEqual(["alpha", "zeta"]);
  });

  it("returns an empty array when there is no config file", () => {
    const opts = makeOpts();
    expect(listRegisteredProviders(opts)).toEqual([]);
  });

  it("detects registered and unregistered names", () => {
    const opts = makeOpts();
    addProviderToConfig({ name: "groq", baseUrl: "https://api.groq.com/openai/v1" }, opts);
    expect(isProviderRegistered("groq", opts)).toBe(true);
    expect(isProviderRegistered("groq  ", opts)).toBe(true);
    expect(isProviderRegistered("together", opts)).toBe(false);
  });
});

