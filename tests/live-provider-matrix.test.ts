import { describe, expect, it } from "vitest";
import { planLiveProviderMatrix } from "../src/providers/live-matrix.js";

describe("live provider matrix planning", () => {
  it("skips live conformance by default", () => {
    expect(planLiveProviderMatrix({}, {})).toEqual({
      enabled: false,
      profiles: [],
      skippedReason: "KINTSUGI_LIVE_SMOKE is not 1",
    });
  });

  it("requires selected profiles when live smoke is enabled", () => {
    expect(() => planLiveProviderMatrix({}, { KINTSUGI_LIVE_SMOKE: "1" })).toThrow(
      "KINTSUGI_LIVE_PROFILES is required"
    );
  });

  it("selects only named profiles and rejects unknown names", () => {
    const config = {
      modelProfiles: {
        example: { preset: "example", model: "greg", capabilities: { tools: true } },
        text: { provider: "openai-chat", model: "text" },
      },
    };

    expect(planLiveProviderMatrix(config, {
      KINTSUGI_LIVE_SMOKE: "1",
      KINTSUGI_LIVE_PROFILES: "example,text",
    })).toMatchObject({
      enabled: true,
      profiles: [
        { name: "example", tools: "enabled" },
        { name: "text", tools: "skipped" },
      ],
    });
    expect(() => planLiveProviderMatrix(config, {
      KINTSUGI_LIVE_SMOKE: "1",
      KINTSUGI_LIVE_PROFILES: "missing",
    })).toThrow("Unknown live provider profile: missing");
  });
});
