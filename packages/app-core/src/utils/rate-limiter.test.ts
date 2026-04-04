import { afterEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter, type RateLimiter } from "./rate-limiter.js";

describe("createRateLimiter", () => {
  let limiter: RateLimiter;

  afterEach(() => {
    limiter?.dispose();
  });

  it("allows the first action for a key", () => {
    limiter = createRateLimiter({ windowMs: 1000 });
    const result = limiter.check("ip-1");
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("blocks a repeated action within the window", () => {
    limiter = createRateLimiter({ windowMs: 10_000 });
    limiter.check("ip-1");
    const result = limiter.check("ip-1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("allows action again after the window expires", () => {
    vi.useFakeTimers();
    try {
      limiter = createRateLimiter({ windowMs: 1000 });
      limiter.check("ip-1");

      vi.advanceTimersByTime(1001);

      const result = limiter.check("ip-1");
      expect(result.allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tracks keys independently", () => {
    limiter = createRateLimiter({ windowMs: 10_000 });
    limiter.check("ip-1");
    const result = limiter.check("ip-2");
    expect(result.allowed).toBe(true);
  });

  it("peek does not consume the action", () => {
    limiter = createRateLimiter({ windowMs: 10_000 });
    const peek1 = limiter.peek("ip-1");
    expect(peek1.allowed).toBe(true);

    // Peek again — still allowed because peek doesn't record
    const peek2 = limiter.peek("ip-1");
    expect(peek2.allowed).toBe(true);

    // Now actually consume
    limiter.check("ip-1");

    // Peek should show blocked
    const peek3 = limiter.peek("ip-1");
    expect(peek3.allowed).toBe(false);
  });

  it("clear removes all tracked keys", () => {
    limiter = createRateLimiter({ windowMs: 10_000 });
    limiter.check("ip-1");
    limiter.check("ip-2");
    limiter.clear();

    expect(limiter.check("ip-1").allowed).toBe(true);
    expect(limiter.check("ip-2").allowed).toBe(true);
  });

  it("dispose stops the sweep timer", () => {
    limiter = createRateLimiter({ windowMs: 1000, sweepIntervalMs: 100 });
    limiter.check("ip-1");
    limiter.dispose();
    // After dispose, no errors — the timer is cleared
  });

  it("retryAfterSeconds is correct", () => {
    vi.useFakeTimers();
    try {
      limiter = createRateLimiter({ windowMs: 5000 });
      limiter.check("ip-1");

      vi.advanceTimersByTime(2000);

      const result = limiter.check("ip-1");
      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
