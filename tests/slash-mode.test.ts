import { describe, expect, it } from "vitest";
import { parseSlashCommand, isSlashCommandName } from "../src/ui/commands/slash.js";

describe("/mode slash command", () => {
  it("parses /mode with no args", () => {
    const result = parseSlashCommand("/mode");
    expect(result).toEqual({ type: "command", name: "mode", args: [] });
  });

  it("parses /mode auto", () => {
    const result = parseSlashCommand("/mode auto");
    expect(result).toEqual({ type: "command", name: "mode", args: ["auto"] });
  });

  it("parses /mode approve", () => {
    const result = parseSlashCommand("/mode approve");
    expect(result).toEqual({ type: "command", name: "mode", args: ["approve"] });
  });

  it("parses /mode plan", () => {
    const result = parseSlashCommand("/mode plan");
    expect(result).toEqual({ type: "command", name: "mode", args: ["plan"] });
  });

  it("isSlashCommandName recognizes mode", () => {
    expect(isSlashCommandName("mode")).toBe(true);
  });

  it("all existing commands still work", () => {
    expect(parseSlashCommand("/help")).toEqual({ type: "command", name: "help", args: [] });
    expect(parseSlashCommand("/stop")).toEqual({ type: "command", name: "stop", args: [] });
    expect(parseSlashCommand("/model fast")).toEqual({ type: "command", name: "model", args: ["fast"] });
    expect(parseSlashCommand("/clear")).toEqual({ type: "command", name: "clear", args: [] });
    expect(parseSlashCommand("/status")).toEqual({ type: "command", name: "status", args: [] });
    expect(parseSlashCommand("/version")).toEqual({ type: "command", name: "version", args: [] });
  });
});
