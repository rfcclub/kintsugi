import { describe, expect, it } from "vitest";
import { formatArgs, truncate } from "../../src/ui/components/ToolCallCard.js";

describe("formatArgs", () => {
  it("returns empty string for falsy args", () => {
    expect(formatArgs(undefined)).toBe("");
    expect(formatArgs(null)).toBe("");
    expect(formatArgs("")).toBe("");
  });

  it("returns the string directly when args is a string", () => {
    expect(formatArgs("simple string")).toBe("simple string");
  });

  it("formats object args excluding toolCallId", () => {
    const result = formatArgs({
      path: "src/index.ts",
      content: "hello",
      toolCallId: "tc-1",
    });
    expect(result).toContain("path: src/index.ts");
    expect(result).toContain("content: hello");
    expect(result).not.toContain("toolCallId");
  });

  it("formats nested values as JSON", () => {
    const result = formatArgs({
      patches: [{ old_string: "a", new_string: "b" }],
    });
    expect(result).toContain("patches:");
  });

  it("handles JSON string args", () => {
    // formatArgs returns the string as-is when args is a string
    const result = formatArgs('{"key": "value", "toolCallId": "tc-2"}');
    expect(result).toBe('{"key": "value", "toolCallId": "tc-2"}');
  });

  it("handles invalid JSON gracefully", () => {
    const result = formatArgs("{bad json}");
    expect(result).toBe('{bad json}');
  });
});

describe("truncate", () => {
  it("returns full text when under maxLines", () => {
    const result = truncate("line1\nline2\nline3", 5);
    expect(result).toEqual({ text: "line1\nline2\nline3", truncated: false });
  });

  it("truncates text exceeding maxLines", () => {
    const result = truncate("line1\nline2\nline3\nline4\nline5\nline6", 3);
    expect(result).toEqual({ text: "line1\nline2\nline3", truncated: true });
  });

  it("uses default 8 maxLines", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
    const result = truncate(lines.join("\n"));
    expect(result.text.split("\n")).toHaveLength(8);
    expect(result.truncated).toBe(true);
  });

  it("does not truncate when text equals maxLines", () => {
    const lines = Array.from({ length: 3 }, (_, i) => `line${i + 1}`);
    const result = truncate(lines.join("\n"), 3);
    expect(result).toEqual({ text: lines.join("\n"), truncated: false });
  });

  it("handles single line", () => {
    const result = truncate("single line", 5);
    expect(result).toEqual({ text: "single line", truncated: false });
  });

  it("handles empty string", () => {
    const result = truncate("", 5);
    expect(result).toEqual({ text: "", truncated: false });
  });
});
