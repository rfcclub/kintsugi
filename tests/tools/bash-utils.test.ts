import { describe, expect, it } from "vitest";
import { clampTimeout } from "../../src/tools/bash.js";

describe("clampTimeout", () => {
  it("returns default timeout when undefined", () => {
    const result = clampTimeout(undefined);
    expect(result).toBe(30000);
  });

  it("clamps values above the maximum", () => {
    const result = clampTimeout(60000);
    expect(result).toBe(30000);
  });

  it("clamps values below the minimum", () => {
    const result = clampTimeout(0);
    expect(result).toBe(1);
  });

  it("truncates float values", () => {
    const result = clampTimeout(12.7);
    expect(result).toBe(12);
  });

  it("passes through valid values unchanged", () => {
    const result = clampTimeout(5000);
    expect(result).toBe(5000);
  });

  it("handles negative timeout", () => {
    const result = clampTimeout(-100);
    expect(result).toBe(1);
  });

  it("handles exactly 1 millisecond", () => {
    const result = clampTimeout(1);
    expect(result).toBe(1);
  });

  it("handles exactly max timeout", () => {
    const result = clampTimeout(30000);
    expect(result).toBe(30000);
  });
});
