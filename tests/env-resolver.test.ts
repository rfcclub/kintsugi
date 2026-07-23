import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  parseAnimaEnv,
  parseZshrc,
  resolveEnvVar,
  resolveApiKeyRef,
} from "../src/providers/env-resolver.js";

function tmpDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "env-resolver-"));
}

describe("parseAnimaEnv", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("parses standard KEY=VALUE pairs", () => {
    const filePath = path.join(dir, "anima.env");
    writeFileSync(filePath, "GEMINI_API_KEY=AIzaSyTest\nDEEPSEEK_API_KEY=sk-test\n");

    const result = parseAnimaEnv(filePath);
    expect(result.get("GEMINI_API_KEY")).toBe("AIzaSyTest");
    expect(result.get("DEEPSEEK_API_KEY")).toBe("sk-test");
  });

  it("handles values with special characters", () => {
    const filePath = path.join(dir, "anima.env");
    writeFileSync(filePath, "KEY_WITH_EQUALS=val=ue\nKEY_WITH_SPACES=hello world\n");

    const result = parseAnimaEnv(filePath);
    expect(result.get("KEY_WITH_EQUALS")).toBe("val=ue");
    expect(result.get("KEY_WITH_SPACES")).toBe("hello world");
  });

  it("skips comment lines", () => {
    const filePath = path.join(dir, "anima.env");
    writeFileSync(filePath, "# comment\nREAL_KEY=real\n# another comment\n");

    const result = parseAnimaEnv(filePath);
    expect(result.size).toBe(1);
    expect(result.has("REAL_KEY")).toBe(true);
  });

  it("skips empty lines", () => {
    const filePath = path.join(dir, "anima.env");
    writeFileSync(filePath, "\n\nREAL_KEY=real\n\n");

    const result = parseAnimaEnv(filePath);
    expect(result.size).toBe(1);
  });

  it("handles quoted values", () => {
    const filePath = path.join(dir, "anima.env");
    writeFileSync(filePath, 'DOUBLE_QUOTED="double val"\nSINGLE_QUOTED=\'single val\'\n');

    const result = parseAnimaEnv(filePath);
    expect(result.get("DOUBLE_QUOTED")).toBe("double val");
    expect(result.get("SINGLE_QUOTED")).toBe("single val");
  });

  it("returns empty map for missing file", () => {
    const result = parseAnimaEnv(path.join(dir, "nope.env"));
    expect(result.size).toBe(0);
  });
});

describe("parseZshrc", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("parses export KEY=value", () => {
    const filePath = path.join(dir, ".zshrc");
    writeFileSync(filePath, "export OPENAI_API_KEY=sk-abc123\n");

    const result = parseZshrc(filePath);
    expect(result.get("OPENAI_API_KEY")).toBe("sk-abc123");
  });

  it("handles double-quoted values", () => {
    const filePath = path.join(dir, ".zshrc");
    writeFileSync(filePath, 'export KEY="quoted value"\n');

    const result = parseZshrc(filePath);
    expect(result.get("KEY")).toBe("quoted value");
  });

  it("handles single-quoted values", () => {
    const filePath = path.join(dir, ".zshrc");
    writeFileSync(filePath, "export KEY='single quoted'\n");

    const result = parseZshrc(filePath);
    expect(result.get("KEY")).toBe("single quoted");
  });

  it("strips inline comments from unquoted values", () => {
    const filePath = path.join(dir, ".zshrc");
    writeFileSync(filePath, "export KEY=value # comment\n");

    const result = parseZshrc(filePath);
    expect(result.get("KEY")).toBe("value");
  });

  it("skips non-export lines", () => {
    const filePath = path.join(dir, ".zshrc");
    writeFileSync(filePath, "alias ll='ls -la'\n# comment\nexport REAL=1\nfunction foo() {}\n");

    const result = parseZshrc(filePath);
    expect(result.size).toBe(1);
    expect(result.has("REAL")).toBe(true);
  });

  it("returns empty map for missing file", () => {
    const result = parseZshrc(path.join(dir, "nope"));
    expect(result.size).toBe(0);
  });
});

describe("resolveEnvVar", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves from process.env first", () => {
    const result = resolveEnvVar("PATH", { env: process.env });
    expect(result).not.toBeNull();
    expect(result!.source).toBe("env");
  });

  it("resolves from anima.env when not in process.env", () => {
    const animaEnv = path.join(dir, "anima.env");
    writeFileSync(animaEnv, "TEST_KEY=from-anima\n");

    const result = resolveEnvVar("TEST_KEY", {
      animaEnvPath: animaEnv,
      env: {},
    });
    expect(result).not.toBeNull();
    expect(result!.value).toBe("from-anima");
    expect(result!.source).toBe("anima-env");
  });

  it("resolves from .zshrc when not in other sources", () => {
    const zshrc = path.join(dir, ".zshrc");
    writeFileSync(zshrc, "export ZSH_KEY=from-zshrc\n");

    const result = resolveEnvVar("ZSH_KEY", {
      zshrcPath: zshrc,
      env: {},
    });
    expect(result).not.toBeNull();
    expect(result!.value).toBe("from-zshrc");
    expect(result!.source).toBe("zshrc");
  });

  it("prefers process.env over anima.env", () => {
    const animaEnv = path.join(dir, "anima.env");
    writeFileSync(animaEnv, "PRIORITY_KEY=from-anima\n");

    const result = resolveEnvVar("PRIORITY_KEY", {
      animaEnvPath: animaEnv,
      env: { PRIORITY_KEY: "from-env" },
    });
    expect(result!.value).toBe("from-env");
    expect(result!.source).toBe("env");
  });

  it("returns null when not found anywhere", () => {
    const result = resolveEnvVar("MISSING_KEY", {
      animaEnvPath: path.join(dir, "nope"),
      zshrcPath: path.join(dir, "nope"),
      env: {},
    });
    expect(result).toBeNull();
  });

  it("treats empty string as not found", () => {
    const result = resolveEnvVar("EMPTY_KEY", {
      env: { EMPTY_KEY: "" },
    });
    expect(result).toBeNull();
  });
});

describe("resolveApiKeyRef", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves literal key", () => {
    const result = resolveApiKeyRef("sk-abc123");
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("sk-abc123");
    expect(result.source).toBe("literal");
    expect(result.isOAuth).toBe(false);
  });

  it("resolves ${ENV_VAR} from env", () => {
    const result = resolveApiKeyRef("${MY_KEY}", {
      env: { MY_KEY: "resolved-value" },
    });
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("resolved-value");
    expect(result.source).toBe("env");
  });

  it("resolves ${ENV_VAR:-default} with default", () => {
    const result = resolveApiKeyRef("${MISSING:-fallback}", {
      env: {},
    });
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("fallback");
    expect(result.source).toBe("default");
  });

  it("resolves ${ENV_VAR:-default} without using default when found", () => {
    const result = resolveApiKeyRef("${FOUND:-fallback}", {
      env: { FOUND: "real-value" },
    });
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("real-value");
    expect(result.source).toBe("env");
  });

  it("detects ${OAUTH:provider}", () => {
    const result = resolveApiKeyRef("${OAUTH:openai}");
    expect(result.resolved).toBe(false);
    expect(result.isOAuth).toBe(true);
    expect(result.oauthProvider).toBe("openai");
  });

  it("returns unresolved for missing ${ENV_VAR}", () => {
    const result = resolveApiKeyRef("${NOT_FOUND}", { env: {} });
    expect(result.resolved).toBe(false);
    expect(result.source).toBeNull();
  });

  it("returns unresolved for empty ref", () => {
    const result = resolveApiKeyRef("");
    expect(result.resolved).toBe(false);
  });

  it("resolves from anima.env when not in process.env", () => {
    const animaEnv = path.join(dir, "anima.env");
    writeFileSync(animaEnv, "ANIMA_KEY=from-anima\n");

    const result = resolveApiKeyRef("${ANIMA_KEY}", {
      animaEnvPath: animaEnv,
      env: {},
    });
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("from-anima");
    expect(result.source).toBe("anima-env");
  });
});
