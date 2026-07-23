import { describe, expect, it, vi } from "vitest";
import {
  parseModels,
  resolveModelsUrl,
  scanModels,
  testConnection,
  type ModelInfo,
} from "../src/providers/scanner.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("resolveModelsUrl", () => {
  it("appends /models to a base url", () => {
    expect(resolveModelsUrl("https://api.groq.com/openai/v1")).toBe(
      "https://api.groq.com/openai/v1/models"
    );
  });

  it("strips trailing slashes before appending", () => {
    expect(resolveModelsUrl("https://example.test/v1/")).toBe(
      "https://example.test/v1/models"
    );
    expect(resolveModelsUrl("https://example.test/v1///")).toBe(
      "https://example.test/v1/models"
    );
  });

  it("trims surrounding whitespace", () => {
    expect(resolveModelsUrl("  https://example.test/v1  ")).toBe(
      "https://example.test/v1/models"
    );
  });
});

describe("parseModels", () => {
  it("parses an OpenAI-compatible data array", () => {
    const data = {
      data: [
        { id: "llama3-70b", owned_by: "meta", created: 1234 },
        { id: "mixtral-8x7b", name: "Mixtral" },
      ],
    };
    expect(parseModels(data)).toEqual<ModelInfo[]>([
      { id: "llama3-70b", name: undefined, owned_by: "meta", created: 1234 },
      { id: "mixtral-8x7b", name: "Mixtral", owned_by: undefined, created: undefined },
    ]);
  });

  it("returns empty array for non-object input", () => {
    expect(parseModels(null)).toEqual([]);
    expect(parseModels("hello")).toEqual([]);
    expect(parseModels([1, 2, 3])).toEqual([]);
  });

  it("returns empty array when data field is missing or not an array", () => {
    expect(parseModels({})).toEqual([]);
    expect(parseModels({ data: "nope" })).toEqual([]);
  });

  it("skips entries without a string id", () => {
    const data = { data: [{ id: "ok" }, { id: 42 }, { name: "no-id" }, null] };
    expect(parseModels(data)).toEqual([
      { id: "ok", name: undefined, owned_by: undefined, created: undefined },
    ]);
  });
});

describe("testConnection", () => {
  it("returns ok=true on HTTP 200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const result = await testConnection("https://example.test/v1", "sk-key", { fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.test/v1/models",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("sends a Bearer authorization header when a key is provided", async () => {
    let headers: HeadersInit | undefined;
    const fetchImpl = vi.fn().mockImplementation((_input, init) => {
      headers = init?.headers;
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    await testConnection("https://example.test/v1", "sk-secret", { fetchImpl });
    expect(new Headers(headers).get("authorization")).toBe("Bearer sk-secret");
  });

  it("returns ok=false with the HTTP status on a non-2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "bad" }, 401));
    const result = await testConnection("https://example.test/v1", "bad-key", { fetchImpl });
    expect(result).toEqual({ ok: false, status: 401, error: "Provider responded with HTTP 401" });
  });

  it("reports a network error message when fetch rejects", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await testConnection("https://example.test/v1", "sk-key", { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ECONNREFUSED");
  });
});

describe("scanModels", () => {
  it("returns parsed models on a successful response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] })
    );
    const result = await scanModels("https://example.test/v1", "sk-key", { fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.models.map((m) => m.id)).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });

  it("returns an empty list with an error on a non-2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    const result = await scanModels("https://example.test/v1", "sk-key", { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.models).toEqual([]);
    expect(result.error).toContain("HTTP 500");
  });

  it("returns an empty list gracefully when response is not valid JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("not json", { status: 200 })
    );
    const result = await scanModels("https://example.test/v1", "sk-key", { fetchImpl });
    expect(result.models).toEqual([]);
    expect(result.ok).toBe(false);
  });

  it("reports a timeout error when the request aborts", async () => {
    const fetchImpl = vi.fn().mockImplementation((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new DOMException("aborted", "AbortError");
          reject(error);
        });
      });
    });
    const result = await scanModels("https://example.test/v1", "sk-key", {
      fetchImpl,
      timeoutMs: 10,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("timed out");
  });
});
