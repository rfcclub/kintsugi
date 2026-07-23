import { describe, expect, it } from "vitest";
import {
  listCommandInfo,
  getCommandInfo,
  isOverlayCommandName,
  formatAvailability,
  COMMAND_INFO,
  OVERLAY_COMMAND_NAMES,
  type CommandAvailability,
  type OverlayCommandName,
} from "../src/ui/commands/command-info.js";

describe("command-info extended", () => {
  describe("listCommandInfo", () => {
    it("returns all overlay commands", () => {
      const list = listCommandInfo();
      expect(list.length).toBe(OVERLAY_COMMAND_NAMES.length);
    });

    it("each entry has required fields", () => {
      for (const info of listCommandInfo()) {
        expect(info.name).toBeTruthy();
        expect(info.usage).toMatch(/^\//);
        expect(info.title).toBeTruthy();
        expect(info.summary).toBeTruthy();
        expect(info.availability).toBeTruthy();
        expect(info.availabilityText).toBeTruthy();
        expect(info.placeholder).toBeTruthy();
      }
    });
  });

  describe("getCommandInfo", () => {
    it("returns info for known overlay commands", () => {
      for (const name of OVERLAY_COMMAND_NAMES) {
        const info = getCommandInfo(name);
        expect(info).toBeDefined();
        expect(info!.name).toBe(name);
      }
    });

    it("returns undefined for unknown commands", () => {
      expect(getCommandInfo("nonexistent")).toBeUndefined();
      expect(getCommandInfo("")).toBeUndefined();
    });
  });

  describe("isOverlayCommandName", () => {
    it("accepts all overlay command names", () => {
      for (const name of OVERLAY_COMMAND_NAMES) {
        expect(isOverlayCommandName(name)).toBe(true);
      }
    });

    it("rejects non-overlay names", () => {
      expect(isOverlayCommandName("stop")).toBe(false);
      expect(isOverlayCommandName("approve")).toBe(false);
      expect(isOverlayCommandName("new")).toBe(false);
    });
  });

  describe("formatAvailability", () => {
    it("formats all availability states", () => {
      expect(formatAvailability("available")).toBe("available");
      expect(formatAvailability("contextual")).toBe("contextual");
      expect(formatAvailability("planned")).toBe("planned");
    });
  });

  describe("new commands", () => {
    it("status command has correct info", () => {
      const info = getCommandInfo("status");
      expect(info).toBeDefined();
      expect(info!.usage).toBe("/status");
      expect(info!.availability).toBe("available");
    });

    it("version command has correct info", () => {
      const info = getCommandInfo("version");
      expect(info).toBeDefined();
      expect(info!.usage).toBe("/version");
      expect(info!.availability).toBe("available");
    });

    it("export command has correct info", () => {
      const info = getCommandInfo("export");
      expect(info).toBeDefined();
      expect(info!.usage).toBe("/export");
      expect(info!.availability).toBe("contextual");
    });
  });
});
