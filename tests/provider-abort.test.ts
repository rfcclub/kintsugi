import { describe, expect, it } from "vitest";
import { AnthropicMessagesProvider } from "../src/providers/anthropic-messages.js";
import type { RealProviderConfig } from "../src/providers/config.js";
import { OpenAIChatProvider } from "../src/providers/openai-chat.js";
import { OpenAIResponsesProvider } from "../src/providers/openai-responses.js";
import type { Provider } from "../src/providers/provider.js";

describe("provider abort behavior", () => {
  it.each([
    ["openai-chat", (fetchImpl: typeof fetch) => new OpenAIChatProvider(config(fetchImpl))],
    ["openai-responses", (fetchImpl: typeof fetch) => new OpenAIResponsesProvider(config(fetchImpl))],
    ["anthropic-messages", (fetchImpl: typeof fetch) => new AnthropicMessagesProvider(config(fetchImpl))],
  ] satisfies Array<[string, (fetchImpl: typeof fetch) => Provider]>)(
    "links request AbortSignal to %s fetch",
    async (_name, createProvider) => {
      const controller = new AbortController();
      let fetchSignal: AbortSignal | undefined;
      let resolveFetchStarted!: () => void;
      const fetchStarted = new Promise<void>((resolve) => {
        resolveFetchStarted = resolve;
      });
      let resolveFetchAborted!: () => void;
      const fetchAborted = new Promise<void>((resolve) => {
        resolveFetchAborted = resolve;
      });

      const fetchImpl: typeof fetch = async (_input, init) => {
        fetchSignal = init?.signal instanceof AbortSignal ? init.signal : undefined;
        fetchSignal?.addEventListener("abort", resolveFetchAborted, { once: true });
        resolveFetchStarted();
        await fetchAborted;
        throw Object.assign(new Error("Aborted"), { name: "AbortError" });
      };
      const provider = createProvider(fetchImpl);

      const eventsPromise = collect(
        provider.streamTurn({
          messages: [{ role: "user", content: "hello" }],
          signal: controller.signal,
        })
      );

      await fetchStarted;
      expect(fetchSignal).toBeDefined();
      expect(fetchSignal?.aborted).toBe(false);

      controller.abort();

      await fetchAborted;
      expect(fetchSignal?.aborted).toBe(true);
      await expect(eventsPromise).resolves.toEqual([]);
    }
  );
});

function config(fetchImpl: typeof fetch): RealProviderConfig {
  return {
    apiKey: "sk-test",
    baseUrl: "https://example.test/v1",
    model: "test-model",
    maxTokens: 16,
    timeoutMs: 1_000,
    anthropicVersion: "2023-06-01",
    fetchImpl,
  };
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}
