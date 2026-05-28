import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args.js";
import { readConfigFile, resolveConfig } from "../src/config/config.js";

describe("provider presets", () => {
  it("resolves built-in Example preset to OpenAI Chat settings", () => {
    const file = tempConfig(`
modelProfile: example-greg
modelProfiles:
  example-greg:
    preset: example
`);

    const resolved = resolveConfig(parseArgs(["ask", "hi"]), {
      homeConfigPath: file,
      repoConfigPath: join(file, "missing"),
      env: {},
    });

    expect(resolved.providerPreset).toBe("example");
    expect(resolved.provider).toBe("openai-chat");
    expect(resolved.providerSettings.baseUrl).toBe("https://api.example.com/v1");
    expect(resolved.model).toBe("greg");
  });

  it("lets user presets override built-in presets", () => {
    const file = tempConfig(`
providerPresets:
  example:
    adapter: openai-responses
    baseUrl: https://override.example/v1
    defaultModel: override-model
modelProfile: example-custom
modelProfiles:
  example-custom:
    preset: example
`);

    const resolved = resolveConfig(parseArgs(["ask", "hi"]), {
      homeConfigPath: file,
      repoConfigPath: join(file, "missing"),
      env: {},
    });

    expect(resolved.provider).toBe("openai-responses");
    expect(resolved.providerSettings.baseUrl).toBe("https://override.example/v1");
    expect(resolved.model).toBe("override-model");
  });

  it("rejects unknown presets", () => {
    const file = tempConfig(`
modelProfile: missing-preset
modelProfiles:
  missing-preset:
    preset: nope
    model: test-model
`);

    expect(() => resolveConfig(parseArgs(["ask", "hi"]), {
      homeConfigPath: file,
      repoConfigPath: join(file, "missing"),
      env: {},
    })).toThrow("Unknown provider preset: nope");
  });

  it("keeps CLI and env overrides above profile presets", () => {
    const file = tempConfig(`
modelProfile: example-greg
modelProfiles:
  example-greg:
    preset: example
`);

    const resolved = resolveConfig(parseArgs(["ask", "--provider", "openai-responses", "--model", "cli-model", "hi"]), {
      homeConfigPath: file,
      repoConfigPath: join(file, "missing"),
      env: { KINTSUGI_BASE_URL: "https://env.example/v1" },
    });

    expect(resolved.provider).toBe("openai-responses");
    expect(resolved.model).toBe("cli-model");
    expect(resolved.providerSettings.baseUrl).toBe("https://env.example/v1");
  });

  it("parses provider preset config from YAML", () => {
    const config = readConfigFile(tempConfig(`
providerPresets:
  local:
    adapter: openai-chat
    baseUrl: http://localhost:1234/v1
    keyFile: ~/local.key
    defaultModel: local-model
`));

    expect(config.providerPresets?.local).toMatchObject({
      adapter: "openai-chat",
      baseUrl: "http://localhost:1234/v1",
      keyFile: "~/local.key",
      defaultModel: "local-model",
    });
  });
});

function tempConfig(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "kintsugi-provider-presets-"));
  const file = join(dir, "config.yaml");
  writeFileSync(file, contents.trimStart(), "utf-8");
  return file;
}
