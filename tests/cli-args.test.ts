import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args.js";

describe("cli/args", () => {
  it("defaults to tui command", () => {
    const result = parseArgs([]);
    expect(result.command).toBe("tui");
    expect(result.provider).toBe("mock");
    expect(result.noSubstrate).toBe(false);
    expect(result.print).toBe(false);
    expect(result.summary).toBe(false);
  });

  it("parses ask command with prompt", () => {
    const result = parseArgs(["ask", "hello", "world"]);
    expect(result.command).toBe("ask");
    expect(result.prompt).toBe("hello world");
  });

  it("parses tui command", () => {
    expect(parseArgs(["tui"]).command).toBe("tui");
  });

  it("parses threads command", () => {
    expect(parseArgs(["threads"]).command).toBe("threads");
  });

  it("parses echo command", () => {
    const result = parseArgs(["echo"]);
    expect(result.command).toBe("echo");
  });

  it("parses boot command", () => {
    expect(parseArgs(["boot"]).command).toBe("boot");
  });

  it("parses config init command", () => {
    const result = parseArgs(["config", "init"]);
    expect(result.command).toBe("config");
    expect(result.initConfig).toBe(true);
  });

  it("parses help variants", () => {
    expect(parseArgs(["help"]).command).toBe("help");
    expect(parseArgs(["--help"]).command).toBe("help");
    expect(parseArgs(["-h"]).command).toBe("help");
  });

  it("bare text without command becomes ask", () => {
    const result = parseArgs(["hello"]);
    expect(result.command).toBe("ask");
    expect(result.prompt).toBe("hello");
  });

  it("parses --no-substrate", () => {
    expect(parseArgs(["--no-substrate"]).noSubstrate).toBe(true);
  });

  it("parses --substrate with path", () => {
    const result = parseArgs(["--substrate", "/tmp/echo"]);
    expect(result.substrate).toBe("/tmp/echo");
  });

  it("throws when --substrate has no value", () => {
    expect(() => parseArgs(["--substrate"])).toThrow("--substrate requires a path");
  });

  it("parses --provider", () => {
    const parsed = parseArgs(["ask", "--provider", "openai-chat", "hello"]);
    expect(parsed.provider).toBe(
      "openai-chat"
    );
    expect(parsed.providerExplicit).toBe(true);
    expect(parseArgs(["ask", "--provider", "openai-responses", "hello"]).provider).toBe(
      "openai-responses"
    );
    expect(parseArgs(["ask", "--provider", "anthropic-messages", "hello"]).provider).toBe(
      "anthropic-messages"
    );
  });

  it("throws when --provider is missing or unknown", () => {
    expect(() => parseArgs(["--provider"])).toThrow("--provider requires a value");
    expect(() => parseArgs(["--provider", "nope"])).toThrow("Unknown provider: nope");
  });

  it("parses --model", () => {
    expect(parseArgs(["ask", "--model", "gpt-test", "hello"]).model).toBe("gpt-test");
  });

  it("throws when --model has no value", () => {
    expect(() => parseArgs(["--model"])).toThrow("--model requires a value");
  });

  it("parses --resume", () => {
    expect(parseArgs(["tui", "--resume", "kng-20260520t120000-abcd"]).resume).toBe(
      "kng-20260520t120000-abcd"
    );
  });

  it("parses --export as threads command", () => {
    const result = parseArgs(["--export", "kng-20260520t120000-abcd"]);
    expect(result.command).toBe("threads");
    expect(result.export).toBe("kng-20260520t120000-abcd");
  });

  it("parses --print", () => {
    expect(parseArgs(["echo", "--print"]).print).toBe(true);
  });

  it("parses --summary for echo", () => {
    expect(parseArgs(["echo", "--summary"]).summary).toBe(true);
  });

  it("requires config subcommand", () => {
    expect(() => parseArgs(["config"])).toThrow("config command requires: init");
  });

  it("rejects --summary outside echo", () => {
    expect(() => parseArgs(["ask", "--summary", "hello"])).toThrow(
      "--summary is only valid with echo"
    );
  });

  it("combines flags and prompt", () => {
    const result = parseArgs(["ask", "--no-substrate", "test prompt"]);
    expect(result.command).toBe("ask");
    expect(result.noSubstrate).toBe(true);
    expect(result.prompt).toBe("test prompt");
  });
});
