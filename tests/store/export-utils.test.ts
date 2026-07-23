import { describe, expect, it } from "vitest";
import {
  fenceText,
  escapeFence,
  titleCase,
  formatDate,
} from "../../src/store/export.js";

describe("fenceText", () => {
  it("returns text unchanged when no code fences", () => {
    expect(fenceText("hello world")).toBe("hello world");
  });

  it("wraps text containing triple backticks in a superfence", () => {
    const input = "some ```code``` here";
    const result = fenceText(input);
    expect(result).toContain("````text");
    expect(result).toContain("````");
  });
});

describe("escapeFence", () => {
  it("returns text unchanged when no fences", () => {
    expect(escapeFence("plain text")).toBe("plain text");
  });

  it("escapes triple backticks", () => {
    expect(escapeFence("```")).toBe("\\`\\`\\`");
  });

  it("escapes multiple fence occurrences", () => {
    expect(escapeFence("a ``` b ``` c")).toBe("a \\`\\`\\` b \\`\\`\\` c");
  });
});

describe("titleCase", () => {
  it("capitalizes the first letter", () => {
    expect(titleCase("hello")).toBe("Hello");
  });

  it("handles already capitalized strings", () => {
    expect(titleCase("Hello")).toBe("Hello");
  });

  it("handles single character", () => {
    expect(titleCase("a")).toBe("A");
  });

  it("handles empty string", () => {
    expect(titleCase("")).toBe("");
  });
});

describe("formatDate", () => {
  it("formats a valid ISO date string", () => {
    const result = formatDate("2026-05-20T14:30:52.000Z");
    expect(result).toBe("2026-05-20 14:30:52 UTC");
  });

  it("returns the original string for invalid dates", () => {
    const result = formatDate("not-a-date");
    expect(result).toBe("not-a-date");
  });

  it("handles dates with different milliseconds", () => {
    // Only .000Z is replaced with " UTC"; other millisecond values keep their .xxxZ
    const result = formatDate("2026-06-01T10:00:00.123Z");
    expect(result).toBe("2026-06-01 10:00:00.123Z");
  });
});
