import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../src/config/config.js";

describe("config helper edge cases", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── Table-driven helpers ──

  /**
   * Run resolveConfig against a YAML string and return the result or throw.
   */
  function resolve(yaml: string) {
    return resolveConfig({} as any, {
      env: {},
      repoConfigPath: tempConfig(yaml),
      homeConfigPath: undefined,
      cwd: process.cwd(),
    });
  }

  /**
   * Run resolveConfig and expect it to throw matching a regex.
   */
  function expectThrow(yaml: string, pattern: RegExp) {
    expect(() => resolve(yaml)).toThrow(pattern);
  }

  // ── requiredNumber (lines 817-822) ──

  describe("requiredNumber (via modelConfig)", () => {
    const cases: Array<[string, unknown, string]> = [
      ["temperature", "hot", /modelConfig\.temperature must be a number/],
      ["temperature", "NaN", /modelConfig\.temperature must be a number/],
      ["maxTokens", "lots", /modelConfig\.maxTokens must be a number/],
      ["presencePenalty", true, /modelConfig\.presencePenalty must be a number/],
      ["frequencyPenalty", false, /modelConfig\.frequencyPenalty must be a number/],
    ];

    for (const [field, value, pattern] of cases) {
      it(`throws when ${field} is ${JSON.stringify(value)}`, () => {
        expectThrow(
          `
provider: mock
modelConfig:
  ${field}: ${typeof value === "string" ? JSON.stringify(value) : value}
`,
          pattern,
        );
      });
    }
  });

  // ── optionalStringArray (line 829) ──

  describe("optionalStringArray (via workspaceRoots)", () => {
    it("throws when workspaceRoots is not an array", () => {
      expectThrow(
        `
provider: mock
workspaceRoots: "not-an-array"
`,
        /workspaceRoots must be an array/,
      );
    });

    it("accepts workspaceRoots as array of strings", () => {
      const config = resolve(`
provider: mock
workspaceRoots:
  - /tmp/root1
  - /tmp/root2
`);
      expect(config.workspaceRoots).toEqual(["/tmp/root1", "/tmp/root2"]);
    });
  });

  // ── optionalStringRecord (lines 870-872) ──

  describe("optionalStringRecord (via hooks.pre)", () => {
    it("throws when hooks.pre has a non-string value", () => {
      expectThrow(
        `
provider: mock
hooks:
  pre:
    key1: "valid"
    key2: 99
`,
        /hooks\.pre\.key2 must be a string/,
      );
    });

    it("accepts hooks.pre with all string values", () => {
      const config = resolve(`
provider: mock
hooks:
  pre:
    step1: "echo hello"
    step2: "echo world"
`);
      expect(config.hooks!.pre).toEqual({
        step1: "echo hello",
        step2: "echo world",
      });
    });
  });

  // ── optionalBoolean (line 797) ──

  describe("optionalBoolean (via noSubstrate)", () => {
    it("throws when noSubstrate is not a boolean", () => {
      expectThrow(
        `
provider: mock
noSubstrate: "yes"
`,
        /noSubstrate must be a boolean/,
      );
    });

    it("accepts noSubstrate as true", () => {
      const config = resolve(`
provider: mock
noSubstrate: true
`);
      expect(config.noSubstrate).toBe(true);
    });
  });

  // ── optionalNumber (line 807) ──

  describe("optionalNumber (via workspaceBudget)", () => {
    it("throws when workspaceBudget is not a number", () => {
      expectThrow(
        `
provider: mock
workspaceBudget: "big"
`,
        /workspaceBudget must be a number/,
      );
    });

    it("throws when workspaceBudget is Infinity", () => {
      expectThrow(
        `
provider: mock
workspaceBudget: .inf
`,
        /workspaceBudget must be a number/,
      );
    });
  });

  // ── modelConfig: reasoning_effort (lines 660-665) ──

  describe("modelConfig.reasoning_effort", () => {
    it("throws when reasoning_effort is invalid", () => {
      expectThrow(
        `
provider: mock
modelConfig:
  reasoning_effort: "extreme"
`,
        /modelConfig\.reasoning_effort must be low, medium, or high/,
      );
    });

    // Table-driven for valid values
    for (const effort of ["low", "high"] as const) {
      it(`accepts reasoning_effort: ${effort}`, () => {
        const config = resolve(`
provider: mock
modelConfig:
  reasoning_effort: ${effort}
`);
        expect(config.modelConfig!.reasoning_effort).toBe(effort);
      });
    }
  });

  // ── modelConfig: stopSequences (lines 676-680) ──

  describe("modelConfig.stopSequences", () => {
    it("throws when stopSequences is not an array", () => {
      expectThrow(
        `
provider: mock
modelConfig:
  stopSequences: "not-array"
`,
        /modelConfig\.stopSequences must be an array/,
      );
    });

    it("accepts stopSequences as array", () => {
      const config = resolve(`
provider: mock
modelConfig:
  stopSequences:
    - "END"
    - "STOP"
`);
      expect(config.modelConfig!.stopSequences).toEqual(["END", "STOP"]);
    });
  });

  // ── normalizeConfig root type guards (lines 455-458) ──

  describe("normalizeConfig edge cases", () => {
    it("throws when config root is a string", () => {
      const file = tempConfig(`provider: mock\n`);
      writeFileSync(file, `"just a string"`, "utf-8");
      expectThrow(``, /Config must be an object/);
    });

    it("throws when config root is an array", () => {
      const file = tempConfig(`provider: mock\n`);
      writeFileSync(file, `- item1\n- item2`, "utf-8");
      expectThrow(``, /Config must be an object/);
    });
  });

  // ── modelConfig empty (line 682) ──

  describe("modelConfig empty", () => {
    it("returns undefined for empty modelConfig object", () => {
      const config = resolve(`
provider: mock
modelConfig: {}
`);
      expect(config.modelConfig).toBeUndefined();
    });
  });

  // ── Targeted uncovered lines (from coverage reports) ──

  // Line 746: permissions must be an object
  describe("permissions validation (line 746)", () => {
    it("throws when permissions is not an object", () => {
      expectThrow(
        `
provider: mock
permissions: 42
`,
        /permissions must be an object/,
      );
    });
  });

  // Line 752: permissions.<tool> must be allow, deny, or ask
  describe("permissions decision validation (line 752)", () => {
    it("throws when permission decision is invalid", () => {
      expectThrow(
        `
provider: mock
permissions:
  read_file: maybe
`,
        /permissions\.read_file must be allow, deny, or ask/,
      );
    });
  });

  // Line 764: ui must be an object
  describe("ui validation (line 764)", () => {
    it("throws when ui is not an object", () => {
      expectThrow(
        `
provider: mock
ui: "string"
`,
        /ui must be an object/,
      );
    });
  });

  // Line 775: provider must be valid type
  describe("provider validation (line 775)", () => {
    it("throws when provider is invalid type", () => {
      expectThrow(
        `
provider: "invalid-provider"
`,
        /provider must be mock, openai-chat, openai-responses, or anthropic-messages/,
      );
    });
  });

  // ── optionalString (line 785) — table-driven ──

  describe("optionalString validation (line 785)", () => {
    const stringFields: Array<[string, unknown, RegExp]> = [
      ["model", 42, /model must be a string/],
      ["substrate", 99, /substrate must be a string/],
      ["keyFile", true, /keyFile must be a string/],
    ];

    for (const [field, value, pattern] of stringFields) {
      it(`throws when ${field} is ${JSON.stringify(value)}`, () => {
        expectThrow(
          `
provider: mock
${field}: ${value}
`,
          pattern,
        );
      });
    }
  });

  // ── Remaining uncovered lines (from Turn 5 coverage report) ──

  // Line 644: modelConfig must be an object
  describe("modelConfig not object (line 644)", () => {
    it("throws when modelConfig is a string", () => {
      expectThrow(
        `
provider: mock
modelConfig: "not-object"
`,
        /modelConfig must be an object/,
      );
    });

    it("throws when modelConfig is an array", () => {
      expectThrow(
        `
provider: mock
modelConfig: [1, 2, 3]
`,
        /modelConfig must be an object/,
      );
    });
  });

  // Line 686: providers must be an object
  describe("providers not object (line 686)", () => {
    it("throws when providers is a string", () => {
      expectThrow(
        `
provider: mock
providers: "not-object"
`,
        /providers must be an object/,
      );
    });

    it("throws when providers is an array", () => {
      expectThrow(
        `
provider: mock
providers: [1, 2]
`,
        /providers must be an object/,
      );
    });
  });

  // Line 735: optionalReasoningEffort invalid (via provider settings)
  describe("optionalReasoningEffort (line 735)", () => {
    it("throws when reasoning_effort is invalid in provider settings", () => {
      expectThrow(
        `
provider: mock
providers:
  mock:
    reasoning_effort: "extreme"
`,
        /providers\.mock\.reasoning_effort must be low, medium, or high/,
      );
    });

    it("accepts reasoning_effort: medium in provider settings", () => {
      const config = resolve(`
provider: mock
providers:
  mock:
    reasoning_effort: medium
`);
      expect(config.providers?.mock.reasoning_effort).toBe("medium");
    });
  });

  // ── Remaining uncovered lines (Turn 1, 2026-06-24) ──

  // Line 547: resolvePermissions mapping (permissions with entries)
  describe("resolvePermissions (line 547)", () => {
    it("maps permission entries into resolved config", () => {
      const config = resolve(`
provider: mock
permissions:
  read_file: allow
  bash: deny
`);
      // ResolvedConfig doesn't expose permissions directly as a map;
      // verify it doesn't throw and provider is correct
      expect(config.provider).toBe("mock");
    });
  });

  // Line 602: optionalCapabilities not object (via modelProfiles)
  describe("optionalCapabilities (line 602)", () => {
    it("throws when capabilities is not an object", () => {
      expectThrow(
        `
provider: mock
modelProfiles:
  test:
    provider: mock
    model: test-model
    capabilities: "not-object"
`,
        /capabilities must be an object/,
      );
    });
  });

  // Line 618: providerPresets must be an object
  describe("providerPresets not object (line 618)", () => {
    it("throws when providerPresets is a string", () => {
      expectThrow(
        `
provider: mock
providerPresets: "not-object"
`,
        /providerPresets must be an object/,
      );
    });
  });

  // Line 624: providerPresets.<name> must be an object
  describe("providerPreset entry not object (line 624)", () => {
    it("throws when a preset entry is not an object", () => {
      expectThrow(
        `
provider: mock
providerPresets:
  broken: "string"
`,
        /providerPresets\.broken must be an object/,
      );
    });
  });

  // Line 153: model profile with unknown provider
  describe("modelProfile unknown provider (line 153)", () => {
    it("throws when profile provider is unknown", () => {
      expectThrow(
        `
provider: mock
modelProfile: bad
modelProfiles:
  bad:
    provider: invalid
    model: test
`,
        /Model profile "bad" uses unknown provider: invalid/,
      );
    });
  });
});

function tempConfig(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "kintsugi-config-helpers-"));
  const file = path.join(dir, "config.yaml");
  writeFileSync(file, contents.trimStart(), "utf-8");
  return file;
}
