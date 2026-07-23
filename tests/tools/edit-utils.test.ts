import { describe, expect, it } from "vitest";
import { countMatches } from "../../src/tools/edit.js";

describe("countMatches", () => {
  it("returns 0 when search text not found", () => {
    expect(countMatches("hello world", "xyz")).toBe(0);
  });

  it("finds a single match", () => {
    expect(countMatches("hello world", "world")).toBe(1);
  });

  it("counts multiple non-overlapping matches", () => {
    // "aa" in "aaaaa": indexOf finds at 0, then from 2 -> finds at 2, then from 4 -> no more
    expect(countMatches("aaaaa", "aa")).toBe(2);
  });

  it("handles single character search", () => {
    expect(countMatches("hello", "l")).toBe(2);
  });

  it("matches at the start of string", () => {
    expect(countMatches("abcabc", "abc")).toBe(2);
  });

  it("handles empty contents", () => {
    expect(countMatches("", "abc")).toBe(0);
  });

  it("handles strings with special regex characters", () => {
    // countMatches uses indexOf not regex, so special chars are fine
    expect(countMatches("costs $100.00", "$100")).toBe(1);
  });
});
