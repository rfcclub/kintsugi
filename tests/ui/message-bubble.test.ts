import { describe, expect, it } from "vitest";
import { parseMessageLine } from "../../src/ui/components/MessageBubble.js";

describe("parseMessageLine", () => {
  it("parses user messages", () => {
    const result = parseMessageLine("you: hello world");
    expect(result).toEqual({ role: "user", text: "hello world" });
  });

  it("parses error messages", () => {
    const result = parseMessageLine("error: something went wrong");
    expect(result).toEqual({ role: "error", text: "something went wrong" });
  });

  it("parses cancelled messages", () => {
    const result = parseMessageLine("cancelled: user aborted");
    expect(result).toEqual({ role: "error", text: "user aborted" });
  });

  it("parses tool messages", () => {
    const result = parseMessageLine("tool: read_file completed");
    expect(result).toEqual({ role: "tool", text: "read_file completed" });
  });

  it("parses thinking messages", () => {
    const result = parseMessageLine("thinking: processing...");
    expect(result).toEqual({ role: "thinking", text: "processing..." });
  });

  it("defaults unknown prefixes to assistant", () => {
    const result = parseMessageLine("custom message");
    expect(result).toEqual({ role: "assistant", text: "custom message" });
  });

  it("parses empty text as assistant", () => {
    const result = parseMessageLine("");
    expect(result).toEqual({ role: "assistant", text: "" });
  });

  it("parses text that looks like a prefix but isn't one", () => {
    const result = parseMessageLine("youtube: video link");
    expect(result).toEqual({ role: "assistant", text: "youtube: video link" });
  });
});
