import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TokenBucketRateLimiter } from "../utils/rateLimiter";

describe("TokenBucketRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should allow requests within limit", () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 5, refillRate: 1, refillIntervalMs: 1000 });
    for (let i = 0; i < 5; i++) {
      const allowed = limiter.tryConsume();
      expect(allowed).toBe(true);
    }
  });

  it("should reject requests over limit", () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 2, refillRate: 1, refillIntervalMs: 1000 });
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);
  });

  it("should refill tokens over time", () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 2, refillRate: 2, refillIntervalMs: 1000 });
    limiter.tryConsume();
    limiter.tryConsume();
    expect(limiter.tryConsume()).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(limiter.tryConsume()).toBe(true);
  });

  it("should report available tokens", () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 3, refillRate: 1, refillIntervalMs: 1000 });
    expect(limiter.availableTokens).toBe(3);
    limiter.tryConsume();
    expect(limiter.availableTokens).toBe(2);
  });

  it("should not exceed max tokens on refill", () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 2, refillRate: 2, refillIntervalMs: 1000 });
    vi.advanceTimersByTime(5000);
    expect(limiter.availableTokens).toBe(2);
  });
});
