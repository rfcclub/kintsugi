import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProvider } from "../src/providers/registry.js";

describe("provider registry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates mock by default", () => {
    expect(createProvider().id).toBe("mock");
  });

  it("requires an API key for real providers", () => {
    expect(() => createProvider("openai-chat", { apiKey: "" })).toThrow(
      "KINTSUGI_API_KEY is required for provider openai-chat"
    );
  });

  it("creates each real provider with explicit config", () => {
    const options = {
      apiKey: "key",
      baseUrl: "https://example.test/v1",
      model: "model",
      maxTokens: 16,
      timeoutMs: 1000,
    };

    expect(createProvider("openai-chat", options).id).toBe("openai-chat");
    expect(createProvider("openai-responses", options).id).toBe("openai-responses");
    expect(createProvider("anthropic-messages", options).id).toBe(
      "anthropic-messages"
    );
  });

  it("creates real providers with a key file instead of inline API keys", async () => {
    vi.stubEnv("KINTSUGI_API_KEY", "");
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-key-file-"));
    const keyFile = join(dir, "key.txt");
    writeFileSync(keyFile, "sk-from-file\n", "utf-8");
    let authorization: string | null | undefined;

    const provider = createProvider("openai-chat", {
      keyFile,
      baseUrl: "https://example.test/v1",
      model: "model",
      maxTokens: 16,
      timeoutMs: 1000,
      fetchImpl: async (_input, init) => {
        authorization = new Headers(init?.headers).get("authorization");
        return sseResponse([{ choices: [{ delta: {}, finish_reason: "stop", index: 0 }] }, "[DONE]"]);
      },
    });

    await collect(provider.streamTurn({ messages: [{ role: "user", content: "hi" }] }));

    expect(provider.id).toBe("openai-chat");
    expect(authorization).toBe("Bearer sk-from-file");
  });
});

function sseResponse(items: Array<object | string>): Response {
  const text = items
    .map((item) => `data: ${typeof item === "string" ? item : JSON.stringify(item)}\n\n`)
    .join("");
  return new Response(text, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}
