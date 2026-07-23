import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { runConfigDoctor, formatConfigShow } from "../src/config/doctor.js";
import { defaultPermissionConfig } from "../src/runtime/permissions.js";
import type { ResolvedConfig, KintsugiConfig } from "../src/config/config.js";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "kintsugi-doctor-"));
}

function tempKeyFile(): string {
  const dir = makeTempDir();
  const file = join(dir, "key");
  writeFileSync(file, "sk-test\n", "utf-8");
  return file;
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    provider: "mock",
    model: "test-model",
    noSubstrate: true,
    providerSettings: {},
    permissions: defaultPermissionConfig,
    sources: [],
    ...overrides,
  };
}

describe("config doctor — substrate & workspace checks", () => {
  it("warns when substrate path does not exist", () => {
    const issues = runConfigDoctor(makeConfig({
      provider: "mock",
      noSubstrate: false,
      substrate: "/tmp/definitely-no-such-substrate-path-xyz",
    }));

    expect(issues).toContainEqual({
      severity: "warning",
      message: 'Substrate path "/tmp/definitely-no-such-substrate-path-xyz" does not exist.',
    });
  });

  it("does not warn on substrate when noSubstrate is true", () => {
    const issues = runConfigDoctor(makeConfig({
      noSubstrate: true,
      substrate: "/tmp/nonexistent",
    }));

    expect(issues).not.toContainEqual(
      expect.objectContaining({ message: expect.stringContaining("Substrate path") })
    );
  });

  it("warns when workspace path does not exist", () => {
    const workspace = "/tmp/definitely-no-such-workspace-xyz";
    const issues = runConfigDoctor(makeConfig({ workspace }));

    expect(issues).toContainEqual({
      severity: "warning",
      message: `Kintsugi workspace "${workspace}" does not exist.`,
    });
  });

  it("does not warn when workspace path exists", () => {
    const workspace = makeTempDir();
    const issues = runConfigDoctor(makeConfig({ workspace }));

    expect(issues).not.toContainEqual(
      expect.objectContaining({ message: expect.stringContaining("Kintsugi workspace") })
    );
  });

  it("warns when workspace root does not exist", () => {
    const root = "/tmp/definitely-no-such-root-xyz";
    const issues = runConfigDoctor(makeConfig({
      workspaceRoots: [root],
    }));

    expect(issues).toContainEqual({
      severity: "warning",
      message: `Workspace root "${root}" does not exist.`,
    });
  });

  it("does not warn when workspace root exists", () => {
    const root = makeTempDir();
    const issues = runConfigDoctor(makeConfig({
      workspaceRoots: [root],
    }));

    expect(issues).not.toContainEqual(
      expect.objectContaining({ message: expect.stringContaining("Workspace root") })
    );
  });
});

describe("config doctor — model & provider checks", () => {
  it("errors when provider requires model but none set", () => {
    vi.stubEnv("KINTSUGI_API_KEY", "sk-test");
    const issues = runConfigDoctor(makeConfig({
      provider: "openai-chat",
      model: undefined,
    }));

    expect(issues).toContainEqual({
      severity: "error",
      message: 'Provider "openai-chat" requires a model.',
    });
  });

  it("does not require model for mock provider", () => {
    const issues = runConfigDoctor(makeConfig({
      provider: "mock",
      model: undefined,
    }));

    expect(issues).not.toContainEqual(
      expect.objectContaining({ message: expect.stringContaining("requires a model") })
    );
  });

  it("errors on unknown provider preset", () => {
    const issues = runConfigDoctor(makeConfig({
      providerPreset: "nonexistent-preset",
    }));

    expect(issues).toContainEqual({
      severity: "error",
      message: "Unknown provider preset: nonexistent-preset",
    });
  });
});

describe("config doctor — key file checks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes when key file exists and is readable", () => {
    vi.stubEnv("KINTSUGI_API_KEY", "");
    const keyFile = tempKeyFile();
    const issues = runConfigDoctor(makeConfig({
      provider: "openai-chat",
      providerSettings: { keyFile },
    }));

    expect(issues).not.toContainEqual(
      expect.objectContaining({ message: expect.stringContaining("keyFile") })
    );
  });

  it.skip("errors when key file is not readable", () => {
    // Skipped: chmod doesn't block root access on macOS
    vi.stubEnv("KINTSUGI_API_KEY", "");
    const dir = makeTempDir();
    const file = join(dir, "key");
    writeFileSync(file, "sk-test\n", "utf-8");
    const fs = require("node:fs");
    fs.chmodSync(file, 0o000);

    const issues = runConfigDoctor(makeConfig({
      provider: "openai-chat",
      providerSettings: { keyFile: file },
    }));

    fs.chmodSync(file, 0o644);

    expect(issues).toContainEqual({
      severity: "error",
      message: expect.stringContaining("is not readable"),
    });
  });
});

describe("config doctor — raw config checks", () => {
  it("errors when modelProfile is not defined in modelProfiles", () => {
    const raw: KintsugiConfig = {
      modelProfile: "nonexistent-profile",
      modelProfiles: {
        "real-profile": { provider: "openai-chat", model: "gpt-4" },
      },
    };

    const issues = runConfigDoctor(makeConfig(), raw);

    expect(issues).toContainEqual({
      severity: "error",
      message: 'modelProfile "nonexistent-profile" is not defined in modelProfiles.',
    });
  });

  it("warns when model profile uses unknown provider type", () => {
    const raw: KintsugiConfig = {
      modelProfile: "test-profile",
      modelProfiles: {
        "test-profile": { provider: "unknown-provider-type" as any, model: "test" },
      },
    };

    const config = makeConfig({
      modelProfile: "test-profile",
    });

    const issues = runConfigDoctor(config, raw);

    expect(issues).toContainEqual({
      severity: "warning",
      message: 'Model profile "test-profile" uses provider "unknown-provider-type" which is not a known provider type.',
    });
  });

  it("passes when modelProfile is defined and valid", () => {
    const raw: KintsugiConfig = {
      modelProfile: "valid-profile",
      modelProfiles: {
        "valid-profile": { provider: "openai-chat", model: "gpt-4" },
      },
    };

    const config = makeConfig({
      modelProfile: "valid-profile",
    });

    const issues = runConfigDoctor(config, raw);

    expect(issues).not.toContainEqual(
      expect.objectContaining({ message: expect.stringContaining("modelProfile") })
    );
  });
});

describe("config doctor — happy path", () => {
  it("returns info message when no issues found", () => {
    const workspace = makeTempDir();
    const issues = runConfigDoctor(makeConfig({ workspace }));

    expect(issues).toContainEqual({
      severity: "info",
      message: "Configuration looks good. No issues found.",
    });
  });
});

describe("formatConfigShow", () => {
  it("formats basic config fields", () => {
    const config = makeConfig({
      provider: "openai-chat",
      providerPreset: "openai",
      model: "gpt-4",
      noSubstrate: true,
      workspace: "/tmp/test-workspace",
      workspaceBudget: 32768,
    });

    const output = formatConfigShow(config);

    expect(output).toContain("provider: openai-chat");
    expect(output).toContain("providerPreset: openai");
    expect(output).toContain("model: gpt-4");
    expect(output).toContain("noSubstrate: true");
    expect(output).toContain("workspace: /tmp/test-workspace");
    expect(output).toContain("workspaceBudget: 32768");
  });

  it("includes modelProfile when set", () => {
    const config = makeConfig({
      modelProfile: "my-profile",
    });

    const output = formatConfigShow(config);

    expect(output).toContain("modelProfile: my-profile");
  });

  it("includes modelConfig when set", () => {
    const config = makeConfig({
      modelConfig: {
        temperature: 0.7,
        maxTokens: 4096,
      },
    });

    const output = formatConfigShow(config);

    expect(output).toContain("modelConfig:");
    expect(output).toContain("temperature: 0.7");
    expect(output).toContain("maxTokens: 4096");
  });

  it("includes workspace roots when set", () => {
    const config = makeConfig({
      workspaceRoots: ["/tmp/root1", "/tmp/root2"],
    });

    const output = formatConfigShow(config);

    expect(output).toContain("workspaceRoots:");
    expect(output).toContain("- /tmp/root1");
    expect(output).toContain("- /tmp/root2");
  });

  it("includes sources", () => {
    const config = makeConfig({
      sources: ["/etc/kintsugi/config.yaml", "~/.config/kintsugi/config.yaml"],
    });

    const output = formatConfigShow(config);

    expect(output).toContain("sources:");
    expect(output).toContain("- /etc/kintsugi/config.yaml");
    expect(output).toContain("- ~/.config/kintsugi/config.yaml");
  });

  it("includes permissions", () => {
    const config = makeConfig({
      permissions: {
        rules: [
          { tool: "bash", decision: "ask" },
          { tool: "read_file", decision: "allow" },
        ],
        default: "ask" as any,
      },
    });

    const output = formatConfigShow(config);

    expect(output).toContain("permissions:");
    expect(output).toContain("bash: ask");
    expect(output).toContain("read_file: allow");
  });

  it("formats array values in modelConfig", () => {
    const config = makeConfig({
      modelConfig: {
        stop: ["END", "STOP"],
      },
    });

    const output = formatConfigShow(config);

    expect(output).toContain("stop: [END, STOP]");
  });

  it("shows defaults when fields are unset", () => {
    const config = makeConfig({
      providerPreset: undefined,
      model: undefined,
      substrate: undefined,
      workspace: undefined,
      workspaceBudget: undefined,
    });

    const output = formatConfigShow(config);

    expect(output).toContain("providerPreset: (none)");
    expect(output).toContain("model: (not set)");
    expect(output).toContain("substrate: (not set)");
    expect(output).toContain("workspace: ~/.config/kintsugi/workspace");
    expect(output).toContain("workspaceBudget: 65536");
  });
});
