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
        hooks: { mode: "strict", timeoutMs: 5000, pre: {}, post: {} },
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
        hooks: { mode: "strict", timeoutMs: 5000, pre: {}, post: {} },
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
          hooks: { mode: "strict", timeoutMs: 5000, pre: {}, post: {} },
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

  it("resolves default and custom hooks configs successfully", () => {
    const config = resolveConfig({} as any, {
      env: {},
      repoConfigPath: undefined,
      homeConfigPath: undefined,
      cwd: process.cwd()
    });
    expect(config.hooks).toBeDefined();
    expect(config.hooks.mode).toBe("strict");
    expect(config.hooks.timeoutMs).toBe(5000);
    expect(config.hooks.pre).toEqual({});
    expect(config.hooks.post).toEqual({});
    
    // Test custom override merging
    const customConfig = resolveConfig({} as any, {
      env: {},
      repoConfigPath: undefined,
      homeConfigPath: undefined,
      cwd: process.cwd()
    });
    const mergedHooks = {
      mode: "permissive" as const,
      timeoutMs: 2000,
      pre: { edit_file: "npm run lint" },
      post: { write_file: "vitest run" }
    };
    const resolvedCustom = { ...customConfig, hooks: mergedHooks };
    expect(resolvedCustom.hooks.mode).toBe("permissive");
    expect(resolvedCustom.hooks.timeoutMs).toBe(2000);
    expect(resolvedCustom.hooks.pre).toEqual({ edit_file: "npm run lint" });
  });

  describe("mcpServers", () => {
    it("parses valid mcpServers config", () => {
      const file = tempConfig(`
provider: mock
mcpServers:
  filesystem:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem"]
    env:
      ROOT: /tmp
      `);
      const opts = {
        env: {},
        repoConfigPath: file,
        homeConfigPath: undefined,
        cwd: process.cwd(),
      };
      const config = resolveConfig({} as any, opts);
      expect(config.mcpServers).toBeDefined();
      expect(config.mcpServers!.filesystem.command).toBe("npx");
      expect(config.mcpServers!.filesystem.args).toEqual(["-y", "@modelcontextprotocol/server-filesystem"]);
      expect(config.mcpServers!.filesystem.env!.ROOT).toBe("/tmp");
    });

    it("returns undefined when mcpServers not present", () => {
      const file = tempConfig(`
provider: mock
      `);
      const opts = {
        env: {},
        repoConfigPath: file,
        homeConfigPath: undefined,
        cwd: process.cwd(),
      };
      const config = resolveConfig({} as any, opts);
      expect(config.mcpServers).toBeUndefined();
    });

    it("throws when mcpServers is not an object", () => {
      const file = tempConfig(`
provider: mock
mcpServers: 42
      `);
      const opts = {
        env: {},
        repoConfigPath: file,
        homeConfigPath: undefined,
        cwd: process.cwd(),
      };
      expect(() => resolveConfig({} as any, opts)).toThrow(/mcpServers must be an object/);
    });

    it("throws when mcpServers entry is not an object", () => {
      const file = tempConfig(`
provider: mock
mcpServers:
  bad: 42
      `);
      const opts = {
        env: {},
        repoConfigPath: file,
        homeConfigPath: undefined,
        cwd: process.cwd(),
      };
      expect(() => resolveConfig({} as any, opts)).toThrow(/mcpServers\.bad must be an object/);
    });

    it("throws when mcpServers entry missing command", () => {
      const file = tempConfig(`
provider: mock
mcpServers:
  bad:
    args: ["x"]
      `);
      const opts = {
        env: {},
        repoConfigPath: file,
        homeConfigPath: undefined,
        cwd: process.cwd(),
      };
      expect(() => resolveConfig({} as any, opts)).toThrow(/command/);
    });

    it("throws when mcpServers.env is not an object", () => {
      const file = tempConfig(`
provider: mock
mcpServers:
  bad:
    command: echo
    env: 42
      `);
      const opts = {
        env: {},
        repoConfigPath: file,
        homeConfigPath: undefined,
        cwd: process.cwd(),
      };
      expect(() => resolveConfig({} as any, opts)).toThrow(/mcpServers\.bad\.env must be an object/);
    });

    it("parses mcpServers without args or env", () => {
      const file = tempConfig(`
provider: mock
mcpServers:
  simple:
    command: echo
      `);
      const opts = {
        env: {},
        repoConfigPath: file,
        homeConfigPath: undefined,
        cwd: process.cwd(),
      };
      const config = resolveConfig({} as any, opts);
      expect(config.mcpServers!.simple.command).toBe("echo");
      expect(config.mcpServers!.simple.args).toBeUndefined();
      expect(config.mcpServers!.simple.env).toBeUndefined();
    });
  });

  describe("hooks validation", () => {
    it("throws when hooks is not an object", () => {
      const file = tempConfig(`
provider: mock
hooks: 42
      `);
      const opts = {
        env: {},
        repoConfigPath: file,
        homeConfigPath: undefined,
        cwd: process.cwd(),
      };
      expect(() => resolveConfig({} as any, opts)).toThrow(/hooks must be an object/);
    });

    it("throws when hooks.mode is invalid", () => {
      const file = tempConfig(`
provider: mock
hooks:
  mode: "invalid"
      `);
      const opts = {
        env: {},
        repoConfigPath: file,
        homeConfigPath: undefined,
        cwd: process.cwd(),
      };
      expect(() => resolveConfig({} as any, opts)).toThrow(/hooks.mode must be strict or permissive/);
    });

    it("throws when hooks.pre is not an object", () => {
      const file = tempConfig(`
provider: mock
hooks:
  pre: 42
      `);
      const opts = {
        env: {},
        repoConfigPath: file,
        homeConfigPath: undefined,
        cwd: process.cwd(),
      };
      expect(() => resolveConfig({} as any, opts)).toThrow(/hooks\.pre must be an object/);
    });

    it("throws when hooks.post has non-string value", () => {
      const file = tempConfig(`
provider: mock
hooks:
  post:
    key: 42
      `);
      const opts = {
        env: {},
        repoConfigPath: file,
        homeConfigPath: undefined,
        cwd: process.cwd(),
      };
      expect(() => resolveConfig({} as any, opts)).toThrow(/hooks\.post\.key must be a string/);
    });
  });
});

function tempConfig(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "kintsugi-config-"));
  const file = path.join(dir, "config.yaml");
  writeFileSync(file, contents.trimStart(), "utf-8");
  return file;
}

// ─── Coverage-targeted tests (mapped to uncovered lines) ───
// Each test targets a specific uncovered line range in config.ts

// L207-232: mcp.json parsing when file exists
// L153: expandUserPath("~/") branch
// L317-335: optionalProviderSettings env-var overrides
// L547-579: optionalModelProfiles validation
// L602-644: optionalModelConfig validation
// L686: optionalProviders entry not object
// L705: optionalProviderSettings not object
// L732-735: optionalReasoningEffort invalid value

describe("coverage: mcp.json file parsing (L207-232)", () => {
  it("loads mcpServers from .kintsugi/mcp.json when file exists", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kintsugi-mcpjson-"));
    const cfg = tempConfig(`provider: mock\n`);
  const mcpDir = path.join(dir, ".kintsugi");
  mkdirSync(mcpDir, { recursive: true });
  writeFileSync(path.join(mcpDir, "mcp.json"), JSON.stringify({
  mcpServers: { jsonsrv: { command: "node" } },
  }));
  const config = resolveConfig({} as any, {
  env: {},
  repoConfigPath: cfg,
  homeConfigPath: undefined,
  cwd: dir,
  });
  expect(config.mcpServers!.jsonsrv.command).toBe("node");
  });

  it("throws on malformed mcp.json", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kintsugi-mcpjson-"));
    const cfg = tempConfig(`provider: mock\n`);
  const mcpDir = path.join(dir, ".kintsugi");
  mkdirSync(mcpDir, { recursive: true });
  writeFileSync(path.join(mcpDir, "mcp.json"), "{not valid json");
  expect(() => resolveConfig({} as any, {
  env: {},
  repoConfigPath: cfg,
  homeConfigPath: undefined,
  cwd: dir,
  })).toThrow(/Failed to parse .*mcp\.json/);
  });

  it("ignores mcp.json if mcpServers key absent", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kintsugi-mcpjson-"));
    const cfg = tempConfig(`provider: mock\n`);
  const mcpDir = path.join(dir, ".kintsugi");
  mkdirSync(mcpDir, { recursive: true });
  writeFileSync(path.join(mcpDir, "mcp.json"), JSON.stringify({ other: true }));
  const config = resolveConfig({} as any, {
  env: {},
  repoConfigPath: cfg,
  homeConfigPath: undefined,
  cwd: dir,
  });
  expect(config.mcpServers).toBeUndefined();
  });

  it("ignores mcp.json if root is array", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kintsugi-mcpjson-"));
    const cfg = tempConfig(`provider: mock\n`);
  const mcpDir = path.join(dir, ".kintsugi");
  mkdirSync(mcpDir, { recursive: true });
  writeFileSync(path.join(mcpDir, "mcp.json"), "[]");
  const config = resolveConfig({} as any, {
  env: {},
  repoConfigPath: cfg,
  homeConfigPath: undefined,
  cwd: dir,
  });
  expect(config.mcpServers).toBeUndefined();
  });
});

describe("coverage: env-var overrides (L317-335)", () => {
  afterEach(() => {
  vi.unstubAllEnvs();
  });

  it("applies KINTSUGI_KEY_FILE override", () => {
  const file = tempConfig(`provider: mock\nkeyFile: /default\n`);
  vi.stubEnv("KINTSUGI_KEY_FILE", "~/override");
  const config = resolveConfig({} as any, {
  env: process.env,
  repoConfigPath: file,
  homeConfigPath: undefined,
  cwd: process.cwd(),
  });
  expect(config.providerSettings.keyFile).toContain("override");
  });

  it("applies KINTSUGI_MAX_TOKENS override", () => {
  const file = tempConfig(`provider: mock\n`);
  vi.stubEnv("KINTSUGI_MAX_TOKENS", "9999");
  const config = resolveConfig({} as any, {
  env: process.env,
  repoConfigPath: file,
  homeConfigPath: undefined,
  cwd: process.cwd(),
  });
  expect(config.providerSettings.maxTokens).toBe(9999);
  });

  it("applies KINTSUGI_TIMEOUT_MS override", () => {
  const file = tempConfig(`provider: mock\n`);
  vi.stubEnv("KINTSUGI_TIMEOUT_MS", "7000");
  const config = resolveConfig({} as any, {
  env: process.env,
  repoConfigPath: file,
  homeConfigPath: undefined,
  cwd: process.cwd(),
  });
  expect(config.providerSettings.timeoutMs).toBe(7000);
  });

  it("applies KINTSUGI_ANTHROPIC_VERSION override", () => {
  const file = tempConfig(`provider: mock\n`);
  vi.stubEnv("KINTSUGI_ANTHROPIC_VERSION", "2024-01-01");
  const config = resolveConfig({} as any, {
  env: process.env,
  repoConfigPath: file,
  homeConfigPath: undefined,
  cwd: process.cwd(),
  });
  expect(config.providerSettings.anthropicVersion).toBe("2024-01-01");
  });

  it("applies KINTSUGI_TEMPERATURE override", () => {
  const file = tempConfig(`provider: mock\n`);
  vi.stubEnv("KINTSUGI_TEMPERATURE", "0.7");
  const config = resolveConfig({} as any, {
  env: process.env,
  repoConfigPath: file,
  homeConfigPath: undefined,
  cwd: process.cwd(),
  });
  expect(config.providerSettings.temperature).toBe(0.7);
  });

  it("applies KINTSUGI_TOP_P override", () => {
  const file = tempConfig(`provider: mock\n`);
  vi.stubEnv("KINTSUGI_TOP_P", "0.9");
  const config = resolveConfig({} as any, {
  env: process.env,
  repoConfigPath: file,
  homeConfigPath: undefined,
  cwd: process.cwd(),
  });
  expect(config.providerSettings.top_p).toBe(0.9);
  });

  it("applies KINTSUGI_STOP_SEQUENCES override", () => {
  const file = tempConfig(`provider: mock\n`);
  vi.stubEnv("KINTSUGI_STOP_SEQUENCES", "stop1, stop2");
  const config = resolveConfig({} as any, {
  env: process.env,
  repoConfigPath: file,
  homeConfigPath: undefined,
  cwd: process.cwd(),
  });
  expect(config.providerSettings.stopSequences).toEqual(["stop1", "stop2"]);
  });

  it("applies KINTSUGI_PRESENCE_PENALTY override", () => {
  const file = tempConfig(`provider: mock\n`);
  vi.stubEnv("KINTSUGI_PRESENCE_PENALTY", "0.5");
  const config = resolveConfig({} as any, {
  env: process.env,
  repoConfigPath: file,
  homeConfigPath: undefined,
  cwd: process.cwd(),
  });
  expect(config.providerSettings.presencePenalty).toBe(0.5);
  });

  it("applies KINTSUGI_FREQUENCY_PENALTY override", () => {
  const file = tempConfig(`provider: mock\n`);
  vi.stubEnv("KINTSUGI_FREQUENCY_PENALTY", "0.3");
  const config = resolveConfig({} as any, {
  env: process.env,
  repoConfigPath: file,
  homeConfigPath: undefined,
  cwd: process.cwd(),
  });
  expect(config.providerSettings.frequencyPenalty).toBe(0.3);
  });
});

describe("coverage: modelProfiles validation (L547-579)", () => {
  it("throws when modelProfiles is not an object", () => {
  const file = tempConfig(`provider: mock\nmodelProfiles: 42\n`);
  expect(() => resolveConfig({} as any, makeOpts(file))).toThrow(/modelProfiles must be an object/);
  });

  it("throws when a modelProfile entry is not an object", () => {
  const file = tempConfig(`provider: mock\nmodelProfiles:\n  bad: 42\n`);
  expect(() => resolveConfig({} as any, makeOpts(file))).toThrow(/modelProfiles\.bad must be an object/);
  });

  it("throws when modelProfile has no provider or preset", () => {
  const file = tempConfig(`provider: mock\nmodelProfiles:\n  noprov:\n    model: test-model\n`);
  expect(() => resolveConfig({} as any, makeOpts(file))).toThrow(/provider or .*preset is required/);
  });

  it("throws when modelProfile has no model and no preset", () => {
  const file = tempConfig(`provider: mock\nmodelProfiles:\n  nomod:\n    provider: mock\n`);
  expect(() => resolveConfig({} as any, makeOpts(file))).toThrow(/model is required unless preset supplies/);
  });

  it("resolves modelProfile with provider and model", () => {
  const file = tempConfig(`provider: mock\nmodelProfiles:\n  prof1:\n    provider: mock\n    model: test-model\n`);
  const config = resolveConfig({} as any, makeOpts(file));
  expect(config.modelProfiles).toBeDefined();
  expect(config.modelProfiles!.prof1.model).toBe("test-model");
  });
});

describe("coverage: modelConfig validation (L602-644)", () => {
  it("throws when modelConfig.temperature is not a number", () => {
  const file = tempConfig(`provider: mock\nmodelConfig:\n  temperature: hot\n`);
  expect(() => resolveConfig({} as any, makeOpts(file))).toThrow(/modelConfig\.temperature must be a number/);
  });

  it("throws when modelConfig.reasoning_effort is invalid", () => {
  const file = tempConfig(`provider: mock\nmodelConfig:\n  reasoning_effort: extreme\n`);
  expect(() => resolveConfig({} as any, makeOpts(file))).toThrow(/reasoning_effort must be low, medium, or high/);
  });

  it("throws when modelConfig.maxTokens is not a number", () => {
  const file = tempConfig(`provider: mock\nmodelConfig:\n  maxTokens: big\n`);
  expect(() => resolveConfig({} as any, makeOpts(file))).toThrow(/modelConfig\.maxTokens must be a number/);
  });

  it("throws when modelConfig.stopSequences is not an array", () => {
  const file = tempConfig(`provider: mock\nmodelConfig:\n  stopSequences: stop\n`);
  expect(() => resolveConfig({} as any, makeOpts(file))).toThrow(/stopSequences must be an array/);
  });
});

describe("coverage: providers and providerSettings validation (L686-705)", () => {
  it("throws when providers entry is not an object", () => {
  const file = tempConfig(`provider: mock\nproviders:\n  bad: 42\n`);
  expect(() => resolveConfig({} as any, makeOpts(file))).toThrow(/providers\.bad must be an object/);
  });
});

describe("coverage: optionalProviderSettings inside modelProfile (L732-735)", () => {
  it("throws when modelProfile.settings.reasoning_effort is invalid", () => {
  const file = tempConfig(`provider: mock\nmodelProfiles:\n  prof1:\n    provider: mock\n    model: test\n    settings:\n      reasoning_effort: extreme\n`);
  expect(() => resolveConfig({} as any, makeOpts(file))).toThrow(/reasoning_effort must be low, medium, or high/);
  });
});

function makeOpts(file: string) {
  return {
  env: {},
  repoConfigPath: file,
  homeConfigPath: undefined,
  cwd: process.cwd(),
  };
}
