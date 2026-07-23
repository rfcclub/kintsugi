import { describe, expect, it } from "vitest";
import { mapHttpError, mapNetworkError, redactApiKey } from "../src/providers/errors.js";

describe("providers/errors", () => {
  describe("mapHttpError", () => {
    it("maps 401 to authentication failed", () => {
      const result = mapHttpError(401, "sk-test");
      expect(result).toEqual({ type: "turn.failed", message: "Authentication failed" });
    });

    it("maps 403 to authentication failed", () => {
      const result = mapHttpError(403, "sk-test");
      expect(result).toEqual({ type: "turn.failed", message: "Authentication failed" });
    });

    it("maps 429 to rate limited", () => {
      const result = mapHttpError(429, "sk-test");
      expect(result).toEqual({ type: "turn.failed", message: "Rate limited" });
    });

    it("maps 500+ to provider error", () => {
      const result = mapHttpError(500, "sk-test");
      expect(result).toEqual({ type: "turn.failed", message: "Provider error: 500" });
    });

    it("maps 503 to provider error", () => {
      const result = mapHttpError(503, "sk-test");
      expect(result).toEqual({ type: "turn.failed", message: "Provider error: 503" });
    });

    it("redacts API key in message for other status codes", () => {
      const result = mapHttpError(400, "sk-secret");
      expect(result.type).toBe("turn.failed");
      expect((result as any).message).toContain("400");
    });

    it("handles empty API key for other status codes", () => {
      const result = mapHttpError(400, "");
      expect(result.type).toBe("turn.failed");
      expect((result as any).message).toContain("400");
    });
  });

  describe("mapNetworkError", () => {
    it("maps AbortError to timed out", () => {
      const error = new DOMException("aborted", "AbortError");
      Object.defineProperty(error, "name", { value: "AbortError" });
      const result = mapNetworkError(error, "sk-test");
      expect(result).toEqual({ type: "turn.failed", message: "Request timed out" });
    });

    it("redacts API key in error message", () => {
      const error = new Error("Connection to sk-secret failed");
      const result = mapNetworkError(error, "sk-secret");
      expect(result.type).toBe("turn.failed");
      expect((result as any).message).toContain("[REDACTED]");
      expect((result as any).message).not.toContain("sk-secret");
    });

    it("handles non-Error values", () => {
      const result = mapNetworkError("string error", "sk-test");
      expect(result.type).toBe("turn.failed");
      expect((result as any).message).toContain("string error");
    });

    it("handles null errors", () => {
      const result = mapNetworkError(null, "sk-test");
      expect(result.type).toBe("turn.failed");
    });
  });

  describe("redactApiKey", () => {
    it("redacts API key in message", () => {
      const result = redactApiKey("Error with sk-abc123 key", "sk-abc123");
      expect(result).toBe("Error with [REDACTED] key");
    });

    it("returns message unchanged with empty key", () => {
      const result = redactApiKey("Error message", "");
      expect(result).toBe("Error message");
    });

    it("handles multiple occurrences", () => {
      const result = redactApiKey("sk-abc and sk-abc again", "sk-abc");
      expect(result).toBe("[REDACTED] and [REDACTED] again");
    });

    it("returns unchanged when key not in message", () => {
      const result = redactApiKey("No key here", "sk-missing");
      expect(result).toBe("No key here");
    });
  });
});
