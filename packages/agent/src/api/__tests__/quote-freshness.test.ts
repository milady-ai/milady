import { describe, expect, it } from "vitest";
import { assertQuoteFresh, QUOTE_MAX_AGE_MS } from "../trade-safety";

describe("assertQuoteFresh", () => {
  const NOW = 1_700_000_000_000;

  it("passes when quote is within TTL", () => {
    expect(() => assertQuoteFresh(NOW - 30_000, NOW)).not.toThrow();
  });

  it("passes at exactly the TTL boundary", () => {
    expect(() => assertQuoteFresh(NOW - QUOTE_MAX_AGE_MS, NOW)).not.toThrow();
  });

  it("throws when quote is older than TTL", () => {
    expect(() => assertQuoteFresh(NOW - QUOTE_MAX_AGE_MS - 1, NOW)).toThrow(
      "Quote expired — please request a fresh quote",
    );
  });

  it("throws for a very stale quote (5 minutes old)", () => {
    expect(() => assertQuoteFresh(NOW - 5 * 60_000, NOW)).toThrow(/expired/);
  });

  it("passes when quotedAt is undefined (backwards compatibility)", () => {
    expect(() => assertQuoteFresh(undefined, NOW)).not.toThrow();
  });

  it("passes when quotedAt is 0 (falsy — treated as missing)", () => {
    expect(() => assertQuoteFresh(0, NOW)).not.toThrow();
  });

  it("passes for a freshly created quote (quotedAt === now)", () => {
    expect(() => assertQuoteFresh(NOW, NOW)).not.toThrow();
  });

  it("uses Date.now() as default when now is not provided", () => {
    expect(() => assertQuoteFresh(Date.now() - 1000)).not.toThrow();
  });

  it("QUOTE_MAX_AGE_MS is 60 seconds", () => {
    expect(QUOTE_MAX_AGE_MS).toBe(60_000);
  });
});
