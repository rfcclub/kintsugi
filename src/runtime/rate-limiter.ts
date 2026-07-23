/**
 * Sliding-window rate limiter per provider.
 *
 * Inspired by umans-dash's RATE_LIMIT_MAP pattern but uses a proper
 * sliding window instead of a fixed delay between requests.
 */

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

interface WindowEntry {
  timestamps: number[];
}

export class RateLimiter {
  private windows = new Map<string, WindowEntry>();

  constructor(private readonly defaults?: RateLimitConfig) {}

  /**
   * Wait until a request slot is available for the given provider.
   * Returns immediately if no rate limit is configured.
   */
  async acquire(providerId: string, config?: RateLimitConfig): Promise<void> {
    const limit = config ?? this.defaults;
    if (!limit) return;

    const entry = this.getOrCreate(providerId);
    const now = Date.now();
    const windowStart = now - limit.windowMs;

    // Remove expired timestamps
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    if (entry.timestamps.length >= limit.maxRequests) {
      // Wait until the oldest request expires from the window
      const oldest = entry.timestamps[0]!;
      const waitMs = oldest + limit.windowMs - now;
      if (waitMs > 0) {
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }

    // Record this request
    entry.timestamps.push(Date.now());
  }

  /**
   * Check if a request would be allowed without waiting.
   */
  wouldAllow(providerId: string, config?: RateLimitConfig): boolean {
    const limit = config ?? this.defaults;
    if (!limit) return true;

    const entry = this.windows.get(providerId);
    if (!entry) return true;

    const now = Date.now();
    const windowStart = now - limit.windowMs;
    const active = entry.timestamps.filter((t) => t > windowStart);
    return active.length < limit.maxRequests;
  }

  /**
   * Get current usage stats for a provider.
   */
  stats(providerId: string, config?: RateLimitConfig): { used: number; limit: number; resetsInMs: number } {
    const limit = config ?? this.defaults;
    if (!limit) return { used: 0, limit: Infinity, resetsInMs: 0 };

    const entry = this.windows.get(providerId);
    if (!entry) return { used: 0, limit: limit.maxRequests, resetsInMs: 0 };

    const now = Date.now();
    const windowStart = now - limit.windowMs;
    const active = entry.timestamps.filter((t) => t > windowStart);
    const resetsInMs = active.length > 0 ? active[0]! + limit.windowMs - now : 0;

    return { used: active.length, limit: limit.maxRequests, resetsInMs: Math.max(0, resetsInMs) };
  }

  /**
   * Reset rate limit state for a provider (or all providers).
   */
  reset(providerId?: string): void {
    if (providerId) {
      this.windows.delete(providerId);
    } else {
      this.windows.clear();
    }
  }

  private getOrCreate(providerId: string): WindowEntry {
    let entry = this.windows.get(providerId);
    if (!entry) {
      entry = { timestamps: [] };
      this.windows.set(providerId, entry);
    }
    return entry;
  }
}

/** Global singleton — one rate limiter per kintsugi process */
export const globalRateLimiter = new RateLimiter();
