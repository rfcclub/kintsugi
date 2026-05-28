import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config/config.js";
import { parseArgs } from "../src/cli/args.js";
import { createProvider } from "../src/providers/registry.js";

const liveEnabled = process.env.KINTSUGI_LIVE_SMOKE === "1";
const keyFileSecret = liveEnabled && process.env.KINTSUGI_KEY_FILE && existsSync(process.env.KINTSUGI_KEY_FILE)
  ? readFileSync(process.env.KINTSUGI_KEY_FILE, "utf-8").trim()
  : undefined;
const liveSecrets = [
  process.env.KINTSUGI_API_KEY,
  keyFileSecret,
].filter((value): value is string => Boolean(value && value.length > 8));

const runLive = liveEnabled && liveSecrets.length > 0;
const describeLive = runLive ? describe : describe.skip;

describeLive("live provider smoke", () => {
  it("receives non-empty provider output without leaking keys", async () => {
    const args = parseArgs(["ask", "Say OK in one short sentence."]);
    const config = resolveConfig(args);
    const provider = createProvider(config.provider, {
      ...config.providerSettings,
      ...config.modelConfig,
      model: config.model,
    });

    const controller = new AbortController();
    const events = [];
    for await (const event of provider.streamTurn({
      messages: [{ role: "user", content: "Say OK in one short sentence." }],
      modelConfig: { ...config.modelConfig, maxTokens: 128 },
      signal: controller.signal,
    })) {
      events.push(event);
      if (
        (event.type === "assistant.delta" || event.type === "thinking.delta" || event.type === "assistant.completed") &&
        "text" in event &&
        event.text.trim().length > 0
      ) {
        controller.abort();
        break;
      }
    }

    const outputEvent = events.find((event) =>
      (event.type === "assistant.delta" || event.type === "thinking.delta" || event.type === "assistant.completed") &&
      "text" in event &&
      event.text.trim().length > 0
    );
    const failed = events.find((event) => event.type === "turn.failed");
    const serialized = JSON.stringify(events);
    expect(failed, failed && "message" in failed ? failed.message : undefined).toBeUndefined();
    expect(outputEvent).toBeTruthy();
    for (const secret of liveSecrets) {
      expect(serialized).not.toContain(secret);
    }
  }, 60_000);
});
