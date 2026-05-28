import type { ResolvedConfig } from "../config/config.js";
import type { ModelProfileEntry } from "./config.js";

export interface LiveMatrixProfile {
  name: string;
  profile: ModelProfileEntry;
  tools: "enabled" | "skipped";
}

export interface LiveMatrixPlan {
  enabled: boolean;
  profiles: LiveMatrixProfile[];
  skippedReason?: string;
}

export function planLiveProviderMatrix(
  config: Pick<ResolvedConfig, "modelProfiles">,
  env: NodeJS.ProcessEnv = process.env
): LiveMatrixPlan {
  if (env.KINTSUGI_LIVE_SMOKE !== "1") {
    return { enabled: false, profiles: [], skippedReason: "KINTSUGI_LIVE_SMOKE is not 1" };
  }

  const names = (env.KINTSUGI_LIVE_PROFILES ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0) {
    throw new Error("KINTSUGI_LIVE_PROFILES is required when KINTSUGI_LIVE_SMOKE=1");
  }

  const profiles = names.map((name) => {
    const profile = config.modelProfiles?.[name];
    if (!profile) {
      throw new Error(`Unknown live provider profile: ${name}`);
    }
    return {
      name,
      profile,
      tools: profile.capabilities?.tools === true ? "enabled" : "skipped",
    } satisfies LiveMatrixProfile;
  });

  return { enabled: true, profiles };
}
