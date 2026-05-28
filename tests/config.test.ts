import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../src/cli/args.js";
import {
  CONFIG_TEMPLATE,
  initConfigTemplate,
  readConfigFile,
  resolveConfig,
} from "../src/config/config.js";
import { runConfigDoctor } from "../src/config/doctor.js";

describe("kintsugi YAML config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads provider, model, permissions, and provider settings", () => {
    const file = tempConfig(`
provider: openai-responses
model: gpt-test
substrate: /tmp/kintsugi-echo
workspace: /tmp/kintsugi-workspace
workspaceBudget: 4096
providers:
  openai-responses:
    baseUrl: https://example.test/v1
    maxTokens: 123
permissions:
  write_file: allow
ui:
  theme: vivid
`);

    expect(readConfigFile(file)).toEqual({
      provider: "openai-responses",
      model: "gpt-test",
      substrate: "/tmp/kintsugi-echo",
      workspace: "/tmp/kintsugi-workspace",
      workspaceBudget: 4096,
      providers: {
        "openai-responses": {
          baseUrl: "https://example.test/v1",
          maxTokens: 123,
          keyFile: undefined,
          model: undefined,
          timeoutMs: undefined,
          anthropicVersion: undefined,
          temperature: undefined,
          top_p: undefined,
          reasoning_effort: undefined,
          stopSequences: undefined,
          presencePenalty: undefined,
          frequencyPenalty: undefined,
        },
      },
      permissions: { write_file: "allow" },
      noSubstrate: undefined,
      modelProfiles: undefined,
      modelProfile: undefined,
      providerPresets: undefined,
      modelConfig: undefined,
      ui: { theme: "vivid" },
    });
  });

  it("uses home config then repo config, with env and CLI overrides", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "kintsugi-config-"));
    const home = path.join(dir, "home.yaml");
    const repoDir = path.join(dir, ".kintsugi");
    mkdirSync(repoDir);
    const repo = path.join(repoDir, "config.yaml");
    writeFileSync(home, "provider: openai-chat\nmodel: home-model\n", "utf-8");
    writeFileSync(
      repo,
      [
        "provider: anthropic-messages",
        "providers:",
        "  anthropic-messages:",
        "    baseUrl: https://anthropic.test/v1",
      ].join("\n"),
      "utf-8"
    );

    const resolved = resolveConfig(parseArgs(["ask", "--model", "cli-model", "hi"]), {
      cwd: dir,
      homeConfigPath: home,
      repoConfigPath: repo,
      env: { KINTSUGI_PROVIDER: "openai-responses" },
    });

    expect(resolved.provider).toBe("openai-responses");
    expect(resolved.model).toBe("cli-model");
    expect(resolved.providerSettings).toEqual({});
    expect(resolved.sources).toEqual([home, repo]);
  });

  it("resolves Kintsugi workspace from env over config", () => {
    const file = tempConfig("workspace: /tmp/config-workspace\nworkspaceBudget: 1234\n");

    const resolved = resolveConfig(parseArgs(["ask", "hi"]), {
      homeConfigPath: file,
      repoConfigPath: path.join(path.dirname(file), "missing.yaml"),
      env: { KINTSUGI_WORKSPACE: "/tmp/env-workspace" },
    });

    expect(resolved.workspace).toBe("/tmp/env-workspace");
    expect(resolved.workspaceBudget).toBe(1234);
  });

  it("expands home-relative paths in resolved config", () => {
    const file = tempConfig(`
substrate: ~/.config/kintsugi/substrate
workspace: ~/.config/kintsugi/workspace
workspaceRoots:
  - ~/repo/kintsugi
`);

    const resolved = resolveConfig(parseArgs(["ask", "hi"]), {
      homeConfigPath: file,
      repoConfigPath: path.join(path.dirname(file), "missing.yaml"),
      env: {},
    });

    expect(resolved.substrate).toBe(path.join(homedir(), ".config", "kintsugi", "substrate"));
    expect(resolved.workspace).toBe(path.join(homedir(), ".config", "kintsugi", "workspace"));
    expect(resolved.workspaceRoots).toEqual([path.join(homedir(), "repo", "kintsugi")]);
  });

  it("expands CLI and env paths before config paths", () => {
    const file = tempConfig("substrate: /tmp/config-echo\nworkspace: /tmp/config-workspace\n");

    const resolved = resolveConfig(parseArgs(["ask", "--substrate", "~/cli-echo", "hi"]), {
      homeConfigPath: file,
      repoConfigPath: path.join(path.dirname(file), "missing.yaml"),
      env: { KINTSUGI_WORKSPACE: "~/env-workspace" },
    });

    expect(resolved.substrate).toBe(path.join(homedir(), "cli-echo"));
    expect(resolved.workspace).toBe(path.join(homedir(), "env-workspace"));
  });

  it("passes expanded key files into provider settings", () => {
    const file = tempConfig("keyFile: ~/.config/kintsugi/key\n");

    const resolved = resolveConfig(parseArgs(["ask", "hi"]), {
      homeConfigPath: file,
      repoConfigPath: path.join(path.dirname(file), "missing.yaml"),
      env: {},
    });

    expect(resolved.keyFile).toBe(path.join(homedir(), ".config", "kintsugi", "key"));
    expect(resolved.providerSettings.keyFile).toBe(resolved.keyFile);
  });

  it("keeps provider-specific key files when no top-level key file is configured", () => {
    const file = tempConfig(`
provider: openai-responses
providers:
  openai-responses:
    keyFile: ~/.config/kintsugi/openai-key
`);

    const resolved = resolveConfig(parseArgs(["ask", "hi"]), {
      homeConfigPath: file,
      repoConfigPath: path.join(path.dirname(file), "missing.yaml"),
      env: {},
    });

    expect(resolved.providerSettings.keyFile).toBe(path.join(homedir(), ".config", "kintsugi", "openai-key"));
  });

  it("keeps provider-specific model when no top-level model is configured", () => {
    const file = tempConfig(`
provider: openai-chat
providers:
  openai-chat:
    model: provider-model
`);

    const resolved = resolveConfig(parseArgs(["ask", "hi"]), {
      homeConfigPath: file,
      repoConfigPath: path.join(path.dirname(file), "missing.yaml"),
      env: {},
    });

    expect(resolved.model).toBeUndefined();
    expect(resolved.providerSettings.model).toBe("provider-model");
  });

  it("lets provider env settings override config provider settings", () => {
    const file = tempConfig(`
provider: openai-chat
providers:
  openai-chat:
    baseUrl: https://api.openai.com/v1
    keyFile: ~/.config/kintsugi/openai-key
    maxTokens: 1024
`);

    const resolved = resolveConfig(parseArgs(["ask", "hi"]), {
      homeConfigPath: file,
      repoConfigPath: path.join(path.dirname(file), "missing.yaml"),
      env: {
        KINTSUGI_BASE_URL: "https://api.example.com/v1",
        KINTSUGI_KEY_FILE: "~/example.key",
        KINTSUGI_MAX_TOKENS: "2048",
      },
    });

    expect(resolved.providerSettings.baseUrl).toBe("https://api.example.com/v1");
    expect(resolved.providerSettings.keyFile).toBe(path.join(homedir(), "example.key"));
    expect(resolved.providerSettings.maxTokens).toBe(2048);
  });

  it("lets CLI provider override env and config", () => {
    const file = tempConfig("provider: anthropic-messages\n");

    const resolved = resolveConfig(
      parseArgs(["ask", "--provider", "openai-chat", "hi"]),
      {
        homeConfigPath: file,
        repoConfigPath: path.join(path.dirname(file), "missing.yaml"),
        env: { KINTSUGI_PROVIDER: "openai-responses" },
      }
    );

    expect(resolved.provider).toBe("openai-chat");
  });

  it("lets explicit CLI mock provider override provider env", () => {
    const resolved = resolveConfig(
      parseArgs(["ask", "--provider", "mock", "hi"]),
      {
        homeConfigPath: path.join(tmpdir(), "missing-home.yaml"),
        repoConfigPath: path.join(tmpdir(), "missing-repo.yaml"),
        env: { KINTSUGI_PROVIDER: "openai-chat" },
      }
    );

    expect(resolved.provider).toBe("mock");
  });

  it("rejects invalid permission decisions", () => {
    const file = tempConfig("permissions:\n  bash: sure\n");

    expect(() => readConfigFile(file)).toThrow(
      "permissions.bash must be allow, deny, or ask"
    );
  });

  it("initializes a config template without overwriting existing files", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "kintsugi-config-init-"));
    const file = path.join(dir, "nested", "config.yaml");

    expect(initConfigTemplate(file)).toEqual({ path: file, created: true });
    expect(readFileSync(file, "utf-8")).toBe(CONFIG_TEMPLATE);

    writeFileSync(file, "provider: mock\n", "utf-8");
    expect(initConfigTemplate(file)).toEqual({ path: file, created: false });
    expect(readFileSync(file, "utf-8")).toBe("provider: mock\n");
  });

  describe("model profiles", () => {
    it("resolves model profile from config, overriding model", () => {
      const file = tempConfig(`
provider: openai-responses
model: default-model
modelProfile: fast
modelProfiles:
  fast:
    provider: openai-responses
    model: gpt-4o-mini
    config:
      temperature: 0.7
      maxTokens: 2048
`);

      const resolved = resolveConfig(parseArgs(["ask", "hi"]), {
        homeConfigPath: file,
        repoConfigPath: path.join(path.dirname(file), "missing.yaml"),
      });

      expect(resolved.model).toBe("gpt-4o-mini");
      expect(resolved.modelProfile).toBe("fast");
      expect(resolved.modelConfig?.temperature).toBe(0.7);
      expect(resolved.modelConfig?.maxTokens).toBe(2048);
    });

    it("merges modelConfig with profile config (profile wins on overlap)", () => {
      const file = tempConfig(`
provider: openai-responses
model: default-model
modelProfile: fast
modelProfiles:
  fast:
    provider: openai-responses
    model: gpt-4o-mini
    config:
      temperature: 0.7
modelConfig:
  temperature: 0.3
  maxTokens: 8192
`);

      const resolved = resolveConfig(parseArgs(["ask", "hi"]), {
        homeConfigPath: file,
        repoConfigPath: path.join(path.dirname(file), "missing.yaml"),
      });

      expect(resolved.model).toBe("gpt-4o-mini");
      expect(resolved.modelProfile).toBe("fast");
      // modelConfig merge: profile.config first, then top-level modelConfig on top
      // So top-level modelConfig.temperature (0.3) overrides profile (0.7)
      expect(resolved.modelConfig?.temperature).toBe(0.3);
      expect(resolved.modelConfig?.maxTokens).toBe(8192);
    });

    it("applies modelConfig without a profile", () => {
      const file = tempConfig(`
provider: openai-responses
modelConfig:
  temperature: 0.5
  top_p: 0.9
`);

      const resolved = resolveConfig(parseArgs(["ask", "hi"]), {
        homeConfigPath: file,
        repoConfigPath: path.join(path.dirname(file), "missing.yaml"),
      });

      expect(resolved.modelProfile).toBeUndefined();
      expect(resolved.modelConfig?.temperature).toBe(0.5);
      expect(resolved.modelConfig?.top_p).toBe(0.9);
    });

    it("reads model profiles from YAML", () => {
      const file = tempConfig(`
modelProfiles:
  fast:
    provider: openai-chat
    model: gpt-4o-mini
    settings:
      baseUrl: https://openrouter.ai/api/v1
      keyFile: ~/.config/kintsugi/openrouter.key
    config:
      temperature: 0.7
      maxTokens: 2048
  reasoning:
    provider: openai-responses
    model: o3-mini
    config:
      reasoning_effort: high
      maxTokens: 8192
modelProfile: reasoning
`);

      const config = readConfigFile(file);
      expect(config.modelProfiles).toBeDefined();
      expect(config.modelProfiles?.fast).toEqual({
        provider: "openai-chat",
        model: "gpt-4o-mini",
        settings: {
          baseUrl: "https://openrouter.ai/api/v1",
          keyFile: "~/.config/kintsugi/openrouter.key",
          model: undefined,
          maxTokens: undefined,
          timeoutMs: undefined,
          anthropicVersion: undefined,
          temperature: undefined,
          top_p: undefined,
          reasoning_effort: undefined,
          stopSequences: undefined,
          presencePenalty: undefined,
          frequencyPenalty: undefined,
        },
        config: { temperature: 0.7, maxTokens: 2048 },
      });
      expect(config.modelProfiles?.reasoning).toEqual({
        provider: "openai-responses",
        model: "o3-mini",
        config: { reasoning_effort: "high", maxTokens: 8192 },
      });
      expect(config.modelProfile).toBe("reasoning");
    });

    it("applies model profile provider settings over adapter settings", () => {
      const file = tempConfig(`
provider: mock
providers:
  openai-chat:
    baseUrl: https://api.openai.com/v1
    keyFile: ~/.config/kintsugi/openai.key
modelProfiles:
  example-kimi:
    provider: openai-chat
    model: kimi-k2.6
    settings:
      baseUrl: https://api.example.com/v1
      keyFile: ~/.config/kintsugi/provider.key
      maxTokens: 128
`);

      const resolved = resolveConfig(parseArgs(["ask", "--model-profile", "example-kimi", "hi"]), {
        homeConfigPath: file,
        repoConfigPath: path.join(path.dirname(file), "missing.yaml"),
        env: {},
      });

      expect(resolved.provider).toBe("openai-chat");
      expect(resolved.model).toBe("kimi-k2.6");
      expect(resolved.providerSettings.baseUrl).toBe("https://api.example.com/v1");
      expect(resolved.providerSettings.keyFile).toBe(path.join(homedir(), ".config", "kintsugi", "provider.key"));
      expect(resolved.providerSettings.maxTokens).toBe(128);
    });
  });

  describe("config doctor", () => {
    it("reports missing API keys for real providers", () => {
      vi.stubEnv("KINTSUGI_API_KEY", "");
      vi.stubEnv("KINTSUGI_KEY_FILE", "");

      const issues = runConfigDoctor({
        provider: "openai-chat",
        noSubstrate: true,
        providerSettings: {},
        permissions: { rules: [] },
        sources: [],
      });

      expect(issues).toContainEqual({
        severity: "error",
        message: 'KINTSUGI_API_KEY is not set. Provider "openai-chat" requires an API key.',
      });
    });

    it("accepts key files as API-key material for real providers", () => {
      vi.stubEnv("KINTSUGI_API_KEY", "");

      const issues = runConfigDoctor({
        provider: "openai-chat",
        noSubstrate: true,
        keyFile: "/tmp/kintsugi-key",
        providerSettings: { keyFile: "/tmp/kintsugi-key" },
        permissions: { rules: [] },
        sources: [],
      });

      expect(issues).not.toContainEqual({
        severity: "error",
        message: 'KINTSUGI_API_KEY is not set. Provider "openai-chat" requires an API key.',
      });
    });

    it("reports missing key files with home-relative paths", () => {
      const issues = runConfigDoctor(
        {
          provider: "mock",
          noSubstrate: true,
          providerSettings: {},
          permissions: { rules: [] },
          sources: [],
        },
        { keyFile: "~/definitely-missing-kintsugi-key" }
      );

      expect(issues).toContainEqual({
        severity: "warning",
        message: 'keyFile "~/definitely-missing-kintsugi-key" does not exist.',
      });
    });
  });
});

function tempConfig(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "kintsugi-config-"));
  const file = path.join(dir, "config.yaml");
  writeFileSync(file, contents.trimStart(), "utf-8");
  return file;
}
