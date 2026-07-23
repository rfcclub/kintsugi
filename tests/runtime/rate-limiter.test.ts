import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../../src/runtime/rate-limiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("acquire returns immediately when no config", async () => {
    const p = limiter.acquire("openai");
    vi.advanceTimersByTime(0);
    await p;
  });

  it("acquire records timestamp when under limit", async () => {
    const p = limiter.acquire("openai", { maxRequests: 5, windowMs: 1000 });
    vi.advanceTimersByTime(0);
    await p;

    const stats = limiter.stats("openai", { maxRequests: 5, windowMs: 1000 });
    expect(stats.used).toBe(1);
    expect(stats.limit).toBe(5);
  });

  it("acquire waits when limit is reached then resolves", async () => {
    const config = { maxRequests: 2, windowMs: 100 };

    // Use up the window
    const p1 = limiter.acquire("openai", config);
    vi.advanceTimersByTime(0);
    await p1;
    const p2 = limiter.acquire("openai", config);
    vi.advanceTimersByTime(0);
    await p2;

    // Third request should wait ~100ms
    let resolved = false;
    const p3 = limiter.acquire("openai", config).then(() => { resolved = true; });
    vi.advanceTimersByTime(0);
    expect(resolved).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(100);
    await p3;
    expect(resolved).toBe(true);
  });

  it("wouldAllow returns true when under limit", async () => {
    const p = limiter.acquire("openai", { maxRequests: 3, windowMs: 1000 });
    vi.advanceTimersByTime(0);
    await p;
    expect(limiter.wouldAllow("openai", { maxRequests: 3, windowMs: 1000 })).toBe(true);
  });

  it("wouldAllow returns false when at limit", async () => {
    const config = { maxRequests: 2, windowMs: 1000 };
    const p1 = limiter.acquire("openai", config);
    vi.advanceTimersByTime(0);
    await p1;
    const p2 = limiter.acquire("openai", config);
    vi.advanceTimersByTime(0);
    await p2;
    expect(limiter.wouldAllow("openai", config)).toBe(false);
  });

  it("wouldAllow returns true when no config", () => {
    expect(limiter.wouldAllow("openai")).toBe(true);
  });

  it("stats returns zero for unknown provider", () => {
    const stats = limiter.stats("unknown", { maxRequests: 10, windowMs: 1000 });
    expect(stats.used).toBe(0);
    expect(stats.limit).toBe(10);
    expect(stats.resetsInMs).toBe(0);
  });

  it("stats returns Infinity limit when no config", () => {
    const stats = limiter.stats("openai");
    expect(stats.limit).toBe(Infinity);
  });

  it("reset clears specific provider", async () => {
    const config = { maxRequests: 2, windowMs: 1000 };
    const p1 = limiter.acquire("openai", config);
    vi.advanceTimersByTime(0);
    await p1;
    const p2 = limiter.acquire("openai", config);
    vi.advanceTimersByTime(0);
    await p2;
    expect(limiter.wouldAllow("openai", config)).toBe(false);

    limiter.reset("openai");
    expect(limiter.wouldAllow("openai", config)).toBe(true);
  });

  it("reset clears all providers", async () => {
    const config = { maxRequests: 1, windowMs: 1000 };
    const p1 = limiter.acquire("openai", config);
    vi.advanceTimersByTime(0);
    await p1;
    const p2 = limiter.acquire("groq", config);
    vi.advanceTimersByTime(0);
    await p2;

    limiter.reset();
    expect(limiter.wouldAllow("openai", config)).toBe(true);
    expect(limiter.wouldAllow("groq", config)).toBe(true);
  });

  it("different providers have independent windows", async () => {
    const config = { maxRequests: 1, windowMs: 1000 };
    const p = limiter.acquire("openai", config);
    vi.advanceTimersByTime(0);
    await p;
    expect(limiter.wouldAllow("groq", config)).toBe(true);
  });

  it("window slides and frees up slots", async () => {
    const config = { maxRequests: 2, windowMs: 50 };
    const p1 = limiter.acquire("openai", config);
    vi.advanceTimersByTime(0);
    await p1;
    const p2 = limiter.acquire("openai", config);
    vi.advanceTimersByTime(0);
    await p2;
    expect(limiter.wouldAllow("openai", config)).toBe(false);

    // Slide the window
    vi.advanceTimersByTime(60);
    expect(limiter.wouldAllow("openai", config)).toBe(true);
  });

  it("uses default config when none provided per-acquire", async () => {
    const defaults = new RateLimiter({ maxRequests: 1, windowMs: 1000 });
    const p = defaults.acquire("openai");
    vi.advanceTimersByTime(0);
    await p;
    expect(defaults.wouldAllow("openai")).toBe(false);
  });

  it("per-acquire config overrides defaults", async () => {
    const defaults = new RateLimiter({ maxRequests: 1, windowMs: 1000 });
    const p = defaults.acquire("openai", { maxRequests: 5, windowMs: 1000 });
    vi.advanceTimersByTime(0);
    await p;
    // wouldAllow with same per-acquire config should show room
    expect(defaults.wouldAllow("openai", { maxRequests: 5, windowMs: 1000 })).toBe(true);
    // wouldAllow with default config should show at limit
    expect(defaults.wouldAllow("openai")).toBe(false);
  });
});
