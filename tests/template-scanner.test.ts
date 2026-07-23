import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  mapApiToAdapter,
  parseTemplateFile,
  scanTemplates,
} from "../src/providers/template-scanner.js";

function tmpDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "template-scanner-"));
}

describe("mapApiToAdapter", () => {
  it("maps openai-completions to openai-chat", () => {
    expect(mapApiToAdapter("openai-completions")).toBe("openai-chat");
  });

  it("maps anthropic-messages to anthropic-messages", () => {
    expect(mapApiToAdapter("anthropic-messages")).toBe("anthropic-messages");
  });

  it("returns null for generic (unsupported)", () => {
    expect(mapApiToAdapter("generic")).toBeNull();
  });

  it("returns null for unknown api type", () => {
    expect(mapApiToAdapter("some-custom-api")).toBeNull();
  });
});

describe("parseTemplateFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("parses a valid template", () => {
    const filePath = path.join(dir, "nahcrof.yaml");
    writeFileSync(
      filePath,
      `id: nahcrof
label: "Nahcrof AI"
api: openai-completions
baseUrl: https://crof.ai/v1
apiKey: \${NAHCROF_API_KEY}
models:
  - id: deepseek-v4-pro
  - id: glm-5.2
`
    );

    const template = parseTemplateFile(filePath);
    expect(template).not.toBeNull();
    expect(template!.id).toBe("nahcrof");
    expect(template!.label).toBe("Nahcrof AI");
    expect(template!.api).toBe("openai-completions");
    expect(template!.adapter).toBe("openai-chat");
    expect(template!.baseUrl).toBe("https://crof.ai/v1");
    expect(template!.apiKeyRef).toBe("${NAHCROF_API_KEY}");
    expect(template!.models).toEqual(["deepseek-v4-pro", "glm-5.2"]);
    expect(template!.supported).toBe(true);
  });

  it("marks generic api as unsupported", () => {
    const filePath = path.join(dir, "gemini.yaml");
    writeFileSync(
      filePath,
      `id: gemini
label: Gemini
baseUrl: https://generativelanguage.googleapis.com
api: generic
apiKey: AIzaSyB5YyM7r
models:
  - id: gemini-3.1-flash-lite-preview
`
    );

    const template = parseTemplateFile(filePath);
    expect(template).not.toBeNull();
    expect(template!.adapter).toBeNull();
    expect(template!.supported).toBe(false);
  });

  it("handles empty models array", () => {
    const filePath = path.join(dir, "empty.yaml");
    writeFileSync(
      filePath,
      `id: test
label: Test
api: openai-completions
baseUrl: https://example.com/v1
apiKey: sk-test
`
    );

    const template = parseTemplateFile(filePath);
    expect(template).not.toBeNull();
    expect(template!.models).toEqual([]);
  });

  it("returns null for missing required fields", () => {
    const filePath = path.join(dir, "bad.yaml");
    writeFileSync(filePath, `id: test\nlabel: Test\n`);

    expect(parseTemplateFile(filePath)).toBeNull();
  });

  it("returns null for malformed YAML", () => {
    const filePath = path.join(dir, "malformed.yaml");
    writeFileSync(filePath, "{{{{invalid yaml");

    expect(parseTemplateFile(filePath)).toBeNull();
  });

  it("returns null for non-existent file", () => {
    expect(parseTemplateFile(path.join(dir, "nope.yaml"))).toBeNull();
  });
});

describe("scanTemplates", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("scans multiple yaml files and sorts by label", () => {
    writeFileSync(
      path.join(dir, "b-provider.yaml"),
      `id: bprov
label: "B Provider"
api: openai-completions
baseUrl: https://b.example.com/v1
apiKey: \${B_KEY}
`
    );
    writeFileSync(
      path.join(dir, "a-provider.yaml"),
      `id: aprov
label: "A Provider"
api: anthropic-messages
baseUrl: https://a.example.com/v1
apiKey: \${A_KEY}
`
    );

    const templates = scanTemplates({ providersDir: dir });
    expect(templates).toHaveLength(2);
    expect(templates[0].label).toBe("A Provider");
    expect(templates[1].label).toBe("B Provider");
  });

  it("returns empty array for missing directory", () => {
    expect(scanTemplates({ providersDir: "/no/such/dir" })).toEqual([]);
  });

  it("returns empty array for empty directory", () => {
    expect(scanTemplates({ providersDir: dir })).toEqual([]);
  });

  it("skips non-yaml files", () => {
    writeFileSync(path.join(dir, "readme.txt"), "not yaml");
    writeFileSync(
      path.join(dir, "provider.yaml"),
      `id: test
label: Test
api: openai-completions
baseUrl: https://example.com/v1
apiKey: sk-test
`
    );

    const templates = scanTemplates({ providersDir: dir });
    expect(templates).toHaveLength(1);
  });

  it("skips malformed files silently", () => {
    writeFileSync(path.join(dir, "bad.yaml"), "{{{{bad");
    writeFileSync(
      path.join(dir, "good.yaml"),
      `id: good
label: Good
api: openai-completions
baseUrl: https://example.com/v1
apiKey: sk-good
`
    );

    const templates = scanTemplates({ providersDir: dir });
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe("good");
  });
});
