import { describe, expect, it } from "vitest";
import { parseSseEvent } from "../src/providers/sse.js";

describe("SSE helpers", () => {
  it("parses named SSE JSON events", () => {
    expect(
      parseSseEvent('event: response.created\ndata: {"type":"response.created"}')
    ).toEqual({
      event: "response.created",
      data: { type: "response.created" },
    });
  });

  it("skips malformed JSON data", () => {
    expect(parseSseEvent("data: not-json")).toBeUndefined();
  });

  it("preserves DONE sentinel", () => {
    expect(parseSseEvent("data: [DONE]")).toEqual({ data: "[DONE]" });
  });
});
