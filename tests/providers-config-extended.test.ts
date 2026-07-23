import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  isProviderType,
  resolveRealProviderConfig,
  validateReasoningEffort,
} from "../src/providers/config.js";
import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

describe("providers/config extended", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("isProviderType", () => {
    it("accepts all valid provider types", () => {
      expect(isProviderType("mock")).toBe(true);
      expect(isProviderType("openai-chat")).toBe(true);
      expect(isProviderType("openai-responses")).toBe(true);
      expect(isProviderType("anthropic-messages")).toBe(true);
    });

    it("rejects invalid provider types", () => {
      expect(isProviderType("unknown")).toBe(false);
      expect(isProviderType("")).toBe(false);
      expect(isProviderType("OPENAI")).toBe(false);
    });
  });

  describe("resolveRealProviderConfig", () => {
    it("throws when no API key is available", () => {
      delete process.env.KINTSUGI_API_KEY;
      delete process.env.KINTSUGI_KEY_FILE;
      expect(() => resolveRealProviderConfig("openai-chat")).toThrow("KINTSUGI_API_KEY is required");
    });

    it("uses KINTSUGI_API_KEY env var", () => {
      process.env.KINTSUGI_API_KEY = "test-key-123";
      const config = resolveRealProviderConfig("openai-chat");
      expect(config.apiKey).toBe("test-key-123");
    });

    it("uses input apiKey over env var", () => {
      process.env.KINTSUGI_API_KEY = "env-key";
      const config = resolveRealProviderConfig("openai-chat", { apiKey: "input-key" });
      expect(config.apiKey).toBe("input-key");
    });

    it("reads API key from key file", () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "kintsugi-key-"));
      const keyPath = path.join(tmpDir, "test.key");
      writeFileSync(keyPath, "file-key-secret\n");
      delete process.env.KINTSUGI_API_KEY;
      process.env.KINTSUGI_KEY_FILE = keyPath;
      const config = resolveRealProviderConfig("openai-chat");
      expect(config.apiKey).toBe("file-key-secret");
      rmSync(tmpDir, { recursive: true });
    });

    it("uses input keyFile over env keyFile", () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "kintsugi-key-"));
      const keyPath = path.join(tmpDir, "input.key");
      writeFileSync(keyPath, "input-file-key\n");
      delete process.env.KINTSUGI_API_KEY;
      const config = resolveRealProviderConfig("openai-chat", { keyFile: keyPath });
      expect(config.apiKey).toBe("input-file-key");
      rmSync(tmpDir, { recursive: true });
    });

    it("returns default baseUrl for openai-chat", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      const config = resolveRealProviderConfig("openai-chat");
      expect(config.baseUrl).toBe("https://api.openai.com/v1");
    });

    it("returns default baseUrl for anthropic-messages", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      const config = resolveRealProviderConfig("anthropic-messages");
      expect(config.baseUrl).toBe("https://api.anthropic.com/v1");
    });

    it("uses KINTSUGI_BASE_URL env var", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      process.env.KINTSUGI_BASE_URL = "https://custom.api/v1";
      const config = resolveRealProviderConfig("openai-chat");
      expect(config.baseUrl).toBe("https://custom.api/v1");
    });

    it("uses input baseUrl over env", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      process.env.KINTSUGI_BASE_URL = "https://env.api/v1";
      const config = resolveRealProviderConfig("openai-chat", { baseUrl: "https://input.api/v1" });
      expect(config.baseUrl).toBe("https://input.api/v1");
    });

    it("returns default model for openai-chat", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      const config = resolveRealProviderConfig("openai-chat");
      expect(config.model).toBe("gpt-4o-mini");
    });

    it("returns default model for anthropic-messages", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      const config = resolveRealProviderConfig("anthropic-messages");
      expect(config.model).toBe("claude-sonnet-4-5");
    });

    it("uses KINTSUGI_MODEL env var", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      process.env.KINTSUGI_MODEL = "gpt-4.1";
      const config = resolveRealProviderConfig("openai-chat");
      expect(config.model).toBe("gpt-4.1");
    });

    it("reads KINTSUGI_MAX_TOKENS", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      process.env.KINTSUGI_MAX_TOKENS = "8192";
      const config = resolveRealProviderConfig("openai-chat");
      expect(config.maxTokens).toBe(8192);
    });

    it("falls back to default maxTokens for invalid env", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      process.env.KINTSUGI_MAX_TOKENS = "not-a-number";
      const config = resolveRealProviderConfig("openai-chat");
      expect(config.maxTokens).toBe(4096);
    });

    it("falls back for negative maxTokens", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      process.env.KINTSUGI_MAX_TOKENS = "-100";
      const config = resolveRealProviderConfig("openai-chat");
      expect(config.maxTokens).toBe(4096);
    });

    it("reads KINTSUGI_TIMEOUT_MS", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      process.env.KINTSUGI_TIMEOUT_MS = "60000";
      const config = resolveRealProviderConfig("openai-chat");
      expect(config.timeoutMs).toBe(60000);
    });

    it("reads KINTSUGI_TEMPERATURE", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      process.env.KINTSUGI_TEMPERATURE = "0.5";
      const config = resolveRealProviderConfig("openai-chat");
      expect(config.temperature).toBe(0.5);
    });

    it("returns undefined temperature when not set", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      delete process.env.KINTSUGI_TEMPERATURE;
      const config = resolveRealProviderConfig("openai-chat");
      expect(config.temperature).toBeUndefined();
    });

    it("reads KINTSUGI_TOP_P", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      process.env.KINTSUGI_TOP_P = "0.9";
      const config = resolveRealProviderConfig("openai-chat");
      expect(config.top_p).toBe(0.9);
    });

    it("reads KINTSUGI_REASONING_EFFORT", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      process.env.KINTSUGI_REASONING_EFFORT = "high";
      const config = resolveRealProviderConfig("openai-chat");
      expect(config.reasoning_effort).toBe("high");
    });

    it("reads KINTSUGI_STOP_SEQUENCES", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      process.env.KINTSUGI_STOP_SEQUENCES = "END, STOP, DONE";
      const config = resolveRealProviderConfig("openai-chat");
      expect(config.stopSequences).toEqual(["END", "STOP", "DONE"]);
    });

    it("reads KINTSUGI_PRESENCE_PENALTY and KINTSUGI_FREQUENCY_PENALTY", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      process.env.KINTSUGI_PRESENCE_PENALTY = "0.5";
      process.env.KINTSUGI_FREQUENCY_PENALTY = "0.3";
      const config = resolveRealProviderConfig("openai-chat");
      expect(config.presencePenalty).toBe(0.5);
      expect(config.frequencyPenalty).toBe(0.3);
    });

    it("uses input values over env values", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      process.env.KINTSUGI_MAX_TOKENS = "2048";
      const config = resolveRealProviderConfig("openai-chat", { maxTokens: 1024 });
      expect(config.maxTokens).toBe(1024);
    });

    it("returns default anthropicVersion", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      const config = resolveRealProviderConfig("anthropic-messages");
      expect(config.anthropicVersion).toBe("2023-06-01");
    });

    it("reads KINTSUGI_ANTHROPIC_VERSION env var", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      process.env.KINTSUGI_ANTHROPIC_VERSION = "2024-01-01";
      const config = resolveRealProviderConfig("anthropic-messages");
      expect(config.anthropicVersion).toBe("2024-01-01");
    });

    it("uses input anthropicVersion over env", () => {
      process.env.KINTSUGI_API_KEY = "test-key";
      process.env.KINTSUGI_ANTHROPIC_VERSION = "2024-01-01";
      const config = resolveRealProviderConfig("anthropic-messages", { anthropicVersion: "2025-01-01" });
      expect(config.anthropicVersion).toBe("2025-01-01");
    });

    it("handles empty key file gracefully", () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "kintsugi-key-"));
      const keyPath = path.join(tmpDir, "empty.key");
      writeFileSync(keyPath, "   \n");
      delete process.env.KINTSUGI_API_KEY;
      process.env.KINTSUGI_KEY_FILE = keyPath;
      expect(() => resolveRealProviderConfig("openai-chat")).toThrow("KINTSUGI_API_KEY is required");
      rmSync(tmpDir, { recursive: true });
    });

    it("handles nonexistent key file", () => {
      delete process.env.KINTSUGI_API_KEY;
      process.env.KINTSUGI_KEY_FILE = "/nonexistent/path/key.txt";
      expect(() => resolveRealProviderConfig("openai-chat")).toThrow("KINTSUGI_API_KEY is required");
    });
  });

  describe("validateReasoningEffort", () => {
    it("accepts valid values", () => {
      expect(validateReasoningEffort("low")).toBe(true);
      expect(validateReasoningEffort("medium")).toBe(true);
      expect(validateReasoningEffort("high")).toBe(true);
    });

    it("rejects invalid values", () => {
      expect(validateReasoningEffort("extreme")).toBe(false);
      expect(validateReasoningEffort(undefined)).toBe(false);
      expect(validateReasoningEffort("")).toBe(false);
    });
  });
});
