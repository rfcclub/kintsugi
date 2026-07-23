import { describe, expect, it } from "vitest";
import {
  toolCallIdFrom,
  stringArg,
  optionalStringArg,
  optionalNumberArg,
  ok,
  fail,
  requireAllowed,
  truncateOutput,
  OUTPUT_TRUNCATION_BYTES,
} from "../../src/tools/utils.js";

describe("toolCallIdFrom", () => {
  it("returns the toolCallId when present", () => {
    expect(toolCallIdFrom({ toolCallId: "tc-1" })).toBe("tc-1");
  });

  it("returns empty string when toolCallId is not a string", () => {
    expect(toolCallIdFrom({})).toBe("");
    expect(toolCallIdFrom({ toolCallId: 42 })).toBe("");
    expect(toolCallIdFrom({ toolCallId: null })).toBe("");
  });
});

describe("stringArg", () => {
  it("returns the string value", () => {
    expect(stringArg({ path: "hello" }, "path")).toBe("hello");
  });

  it("throws for non-string values", () => {
    expect(() => stringArg({ path: 42 }, "path")).toThrow("path must be a string");
    expect(() => stringArg({ path: null }, "path")).toThrow("path must be a string");
    expect(() => stringArg({ path: undefined }, "path")).toThrow("path must be a string");
  });

  it("throws for missing keys", () => {
    expect(() => stringArg({}, "missing")).toThrow("missing must be a string");
  });
});

describe("optionalStringArg", () => {
  it("returns undefined when key is missing", () => {
    expect(optionalStringArg({}, "optional")).toBeUndefined();
  });

  it("returns the string value when present", () => {
    expect(optionalStringArg({ name: "test" }, "name")).toBe("test");
  });

  it("throws for non-string values", () => {
    expect(() => optionalStringArg({ name: 42 }, "name")).toThrow("name must be a string");
    expect(() => optionalStringArg({ name: true }, "name")).toThrow("name must be a string");
  });
});

describe("optionalNumberArg", () => {
  it("returns undefined when key is missing", () => {
    expect(optionalNumberArg({}, "optional")).toBeUndefined();
  });

  it("returns the number value when present", () => {
    expect(optionalNumberArg({ limit: 10 }, "limit")).toBe(10);
  });

  it("throws for non-number values", () => {
    expect(() => optionalNumberArg({ limit: "10" }, "limit")).toThrow("limit must be a number");
    expect(() => optionalNumberArg({ limit: NaN }, "limit")).toThrow("limit must be a number");
    expect(() => optionalNumberArg({ limit: Infinity }, "limit")).toThrow("limit must be a number");
  });
});

describe("ok", () => {
  it("returns a non-error result", () => {
    const result = ok("tc-1", "done");
    expect(result).toEqual({ toolCallId: "tc-1", output: "done", isError: false });
  });
});

describe("fail", () => {
  it("creates an error result from an Error", () => {
    const result = fail("tc-1", new Error("boom"));
    expect(result).toEqual({ toolCallId: "tc-1", output: "boom", isError: true });
  });

  it("creates an error result from a string", () => {
    const result = fail("tc-1", "unexpected");
    expect(result).toEqual({ toolCallId: "tc-1", output: "unexpected", isError: true });
  });
});

describe("requireAllowed", () => {
  it("passes when permission is allow", () => {
    expect(() => requireAllowed("allow")).not.toThrow();
  });

  it("throws when permission is not allow", () => {
    expect(() => requireAllowed("deny")).toThrow("Permission denied");
    expect(() => requireAllowed("ask")).toThrow("Permission denied");
  });
});

describe("truncateOutput", () => {
  it("returns output unchanged when under limit", () => {
    const short = "hello world";
    expect(truncateOutput(short)).toBe(short);
  });

  it("truncates output exceeding the limit", () => {
    const large = "x".repeat(OUTPUT_TRUNCATION_BYTES + 100);
    const result = truncateOutput(large);
    expect(result).toContain("[output truncated at 10 KB]");
    expect(Buffer.byteLength(result, "utf8")).toBeLessThan(OUTPUT_TRUNCATION_BYTES + 50);
  });

  it("preserves output exactly at the boundary", () => {
    const exact = "x".repeat(OUTPUT_TRUNCATION_BYTES);
    const result = truncateOutput(exact);
    expect(result).not.toContain("[output truncated at 10 KB]");
  });
});
