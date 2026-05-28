import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import { runConfigDoctor } from "../src/config/doctor.js";
import { defaultPermissionConfig } from "../src/runtime/permissions.js";

describe("provider doctor diagnostics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports missing keys for real providers without leaking secret contents", () => {
    vi.stubEnv("KINTSUGI_API_KEY", "");
    const issues = runConfigDoctor({
      provider: "openai-chat",
      model: "test-model",
      noSubstrate: true,
      providerSettings: {},
      permissions: defaultPermissionConfig,
      sources: [],
    });

    expect(issues).toContainEqual({
      severity: "error",
      message: 'KINTSUGI_API_KEY is not set. Provider "openai-chat" requires an API key.',
    });
    expect(JSON.stringify(issues)).not.toContain("sk-");
  });

  it("reports unreadable or missing key files by path only", () => {
    vi.stubEnv("KINTSUGI_API_KEY", "");
    const issues = runConfigDoctor({
      provider: "openai-chat",
      model: "test-model",
      noSubstrate: true,
      providerSettings: { keyFile: "/tmp/definitely-missing-kintsugi-provider-key" },
      permissions: defaultPermissionConfig,
      sources: [],
    });

    expect(issues).toContainEqual({
      severity: "error",
      message: 'keyFile "/tmp/definitely-missing-kintsugi-provider-key" does not exist.',
    });
  });

  it("warns when baseUrl includes a completion endpoint path", () => {
    const keyFile = tempKeyFile();
    const issues = runConfigDoctor({
      provider: "openai-chat",
      model: "test-model",
      noSubstrate: true,
      providerSettings: { keyFile, baseUrl: "https://example.test/v1/chat/completions" },
      permissions: defaultPermissionConfig,
      sources: [],
    });

    expect(issues).toContainEqual({
      severity: "warning",
      message: 'baseUrl "https://example.test/v1/chat/completions" should be the API root, not a completion endpoint path.',
    });
  });

  it("requires baseUrl for generic openai-compatible preset", () => {
    const issues = runConfigDoctor({
      provider: "openai-chat",
      providerPreset: "openai-compatible",
      model: "test-model",
      noSubstrate: true,
      providerSettings: { keyFile: tempKeyFile() },
      permissions: defaultPermissionConfig,
      sources: [],
    });

    expect(issues).toContainEqual({
      severity: "error",
      message: 'Provider preset "openai-compatible" requires an explicit baseUrl.',
    });
  });
});

function tempKeyFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "kintsugi-provider-doctor-"));
  const file = join(dir, "key");
  writeFileSync(file, "sk-test\n", "utf-8");
  return file;
}
