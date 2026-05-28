import { describe, expect, it } from "vitest";
import { parseSlashCommand } from "../src/ui/commands/slash.js";

describe("parseSlashCommand", () => {
  it("leaves normal prompts alone", () => {
    expect(parseSlashCommand("hello")).toEqual({ type: "not-command", text: "hello" });
  });

  it("parses known commands and arguments", () => {
    expect(parseSlashCommand("/model fast")).toEqual({
      type: "command",
      name: "model",
      args: ["fast"],
    });
  });

  it("supports literal slash prompts", () => {
    expect(parseSlashCommand("//help")).toEqual({ type: "prompt", text: "/help" });
  });

  it("rejects unknown commands", () => {
    expect(parseSlashCommand("/wat")).toEqual({
      type: "error",
      message: "Unknown command: /wat",
    });
  });

  it("requires resume id", () => {
    expect(parseSlashCommand("/resume")).toEqual({
      type: "error",
      message: "/resume requires an argument.",
    });
  });

  it("normalizes command names", () => {
    expect(parseSlashCommand("  /STOP")).toEqual({
      type: "command",
      name: "stop",
      args: [],
    });
  });
});
