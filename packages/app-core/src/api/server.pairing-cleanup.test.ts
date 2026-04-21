import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("pairing rate limiter cleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sweeps expired entries from the map", () => {
    const PAIRING_WINDOW_MS = 10 * 60 * 1000;
    const map = new Map<string, { count: number; resetAt: number }>();

    function sweepPairingAttempts(): void {
      const now = Date.now();
      for (const [key, entry] of map) {
        if (now > entry.resetAt) {
          map.delete(key);
        }
      }
    }

    const now = Date.now();
    map.set("1.2.3.4", { count: 3, resetAt: now - 1000 });
    map.set("5.6.7.8", { count: 1, resetAt: now + PAIRING_WINDOW_MS });

    expect(map.size).toBe(2);
    sweepPairingAttempts();
    expect(map.size).toBe(1);
    expect(map.has("1.2.3.4")).toBe(false);
    expect(map.has("5.6.7.8")).toBe(true);
  });
});
