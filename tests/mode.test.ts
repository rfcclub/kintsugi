import { describe, expect, it } from "vitest";
import {
  isInteractionMode,
  formatMode,
  formatModeList,
  INTERACTION_MODES,
  MODE_DESCRIPTIONS,
} from "../src/runtime/mode.js";

describe("interaction modes", () => {
  describe("isInteractionMode", () => {
    it("accepts valid modes", () => {
      expect(isInteractionMode("auto")).toBe(true);
      expect(isInteractionMode("approve")).toBe(true);
      expect(isInteractionMode("plan")).toBe(true);
    });

    it("rejects invalid modes", () => {
      expect(isInteractionMode("manual")).toBe(false);
      expect(isInteractionMode("")).toBe(false);
      expect(isInteractionMode("AUTO")).toBe(false);
    });
  });

  describe("INTERACTION_MODES", () => {
    it("contains exactly 3 modes", () => {
      expect(INTERACTION_MODES).toHaveLength(3);
      expect(INTERACTION_MODES).toContain("auto");
      expect(INTERACTION_MODES).toContain("approve");
      expect(INTERACTION_MODES).toContain("plan");
    });
  });

  describe("MODE_DESCRIPTIONS", () => {
    it("has a description for every mode", () => {
      for (const mode of INTERACTION_MODES) {
        const desc = MODE_DESCRIPTIONS.find((d) => d.name === mode);
        expect(desc).toBeDefined();
        expect(desc!.label).toBeTruthy();
        expect(desc!.summary).toBeTruthy();
      }
    });

    it("each description has required fields", () => {
      for (const desc of MODE_DESCRIPTIONS) {
        expect(desc.name).toBeTruthy();
        expect(desc.label).toBeTruthy();
        expect(desc.summary).toBeTruthy();
      }
    });
  });

  describe("formatMode", () => {
    it("formats auto mode", () => {
      const result = formatMode("auto");
      expect(result).toContain("Auto");
      expect(result).toContain("without asking");
    });

    it("formats approve mode", () => {
      const result = formatMode("approve");
      expect(result).toContain("Approve");
      expect(result).toContain("approval");
    });

    it("formats plan mode", () => {
      const result = formatMode("plan");
      expect(result).toContain("Plan");
      expect(result).toContain("plan");
    });

    it("returns raw string for unknown mode", () => {
      const result = formatMode("unknown" as any);
      expect(result).toBe("unknown");
    });
  });

  describe("formatModeList", () => {
    it("lists all modes", () => {
      const list = formatModeList();
      expect(list).toContain("auto");
      expect(list).toContain("approve");
      expect(list).toContain("plan");
    });

    it("includes summaries", () => {
      const list = formatModeList();
      expect(list).toContain("without asking");
      expect(list).toContain("approval");
      expect(list).toContain("plan");
    });
  });
});
