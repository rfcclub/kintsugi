import { describe, expect, it } from "vitest";
import { parseSlashCommand, isSlashCommandName } from "../src/ui/commands/slash.js";

describe("slash commands extended", () => {
  describe("new commands", () => {
    it("parses /clear", () => {
      const result = parseSlashCommand("/clear");
      expect(result).toEqual({ type: "command", name: "clear", args: [] });
    });

    it("parses /export with id", () => {
      const result = parseSlashCommand("/export abc123");
      expect(result).toEqual({ type: "command", name: "export", args: ["abc123"] });
    });

    it("errors on /export without id", () => {
      const result = parseSlashCommand("/export");
      expect(result.type).toBe("error");
      expect((result as any).message).toContain("requires an argument");
    });

    it("parses /rename with title", () => {
      const result = parseSlashCommand("/rename my session");
      expect(result).toEqual({ type: "command", name: "rename", args: ["my", "session"] });
    });

    it("errors on /rename without title", () => {
      const result = parseSlashCommand("/rename");
      expect(result.type).toBe("error");
    });

    it("parses /status", () => {
      const result = parseSlashCommand("/status");
      expect(result).toEqual({ type: "command", name: "status", args: [] });
    });

    it("parses /version", () => {
      const result = parseSlashCommand("/version");
      expect(result).toEqual({ type: "command", name: "version", args: [] });
    });

    it("parses /provider with no args (status)", () => {
      const result = parseSlashCommand("/provider");
      expect(result).toEqual({ type: "command", name: "provider", args: [] });
    });

    it("parses /provider add", () => {
      const result = parseSlashCommand("/provider add");
      expect(result).toEqual({ type: "command", name: "provider", args: ["add"] });
    });

    it("parses /model list and /model use", () => {
      expect(parseSlashCommand("/model list")).toEqual({ type: "command", name: "model", args: ["list"] });
      expect(parseSlashCommand("/model use gpt-4o")).toEqual({ type: "command", name: "model", args: ["use", "gpt-4o"] });
    });

    it("new commands are recognized by isSlashCommandName", () => {
      expect(isSlashCommandName("clear")).toBe(true);
      expect(isSlashCommandName("export")).toBe(true);
      expect(isSlashCommandName("rename")).toBe(true);
      expect(isSlashCommandName("status")).toBe(true);
      expect(isSlashCommandName("version")).toBe(true);
      expect(isSlashCommandName("provider")).toBe(true);
    });
  });

  describe("all existing commands still work", () => {
    it("parses /help", () => {
      expect(parseSlashCommand("/help")).toEqual({ type: "command", name: "help", args: [] });
    });

    it("parses /stop", () => {
      expect(parseSlashCommand("/stop")).toEqual({ type: "command", name: "stop", args: [] });
    });

    it("parses /model with profile", () => {
      expect(parseSlashCommand("/model fast")).toEqual({ type: "command", name: "model", args: ["fast"] });
    });

    it("parses //escape", () => {
      expect(parseSlashCommand("//literal")).toEqual({ type: "prompt", text: "/literal" });
    });

    it("rejects unknown commands", () => {
      const result = parseSlashCommand("/foobar");
      expect(result.type).toBe("error");
    });

    it("rejects empty slash", () => {
      const result = parseSlashCommand("/");
      expect(result.type).toBe("error");
    });
  });
});
