import { describe, expect, it } from "vitest";
import {
  getCommandInfo,
  isOverlayCommandName,
  listCommandInfo,
} from "../src/ui/commands/command-info.js";

describe("command-info", () => {
  it("lists Phase 8 overlay commands with help availability metadata", () => {
    expect(listCommandInfo().map((command) => [command.name, command.availability])).toEqual([
      ["help", "available"],
      ["model", "available"],
      ["config", "contextual"],
      ["doctor", "contextual"],
      ["memory", "contextual"],
      ["threads", "contextual"],
    ]);
  });

  it("looks up overlay command metadata by name", () => {
    expect(getCommandInfo("doctor")?.usage).toBe("/doctor");
    expect(getCommandInfo("wat")).toBeUndefined();
  });

  it("narrows overlay command names", () => {
    expect(isOverlayCommandName("memory")).toBe(true);
    expect(isOverlayCommandName("resume")).toBe(false);
  });
});
