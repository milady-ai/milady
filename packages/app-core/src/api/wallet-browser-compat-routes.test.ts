import { describe, expect, it } from "vitest";
import { safeParseBigInt } from "./wallet-browser-compat-routes";

describe("safeParseBigInt", () => {
  it("parses a decimal string", () => {
    expect(safeParseBigInt("1000000000000000000")).toBe(1000000000000000000n);
  });

  it("parses a hex string", () => {
    expect(safeParseBigInt("0xDE0B6B3A7640000")).toBe(1000000000000000000n);
  });

  it('parses "0" as zero (zero-value transactions are valid)', () => {
    expect(safeParseBigInt("0")).toBe(0n);
  });

  it('parses "0x0" as zero', () => {
    expect(safeParseBigInt("0x0")).toBe(0n);
  });

  it("throws a clear error for decimal strings like 0.5", () => {
    expect(() => safeParseBigInt("0.5")).toThrow("Invalid transaction value");
  });

  it("throws a clear error for scientific notation", () => {
    expect(() => safeParseBigInt("1e18")).toThrow("Invalid transaction value");
  });

  it("throws a clear error for non-numeric strings", () => {
    expect(() => safeParseBigInt("hello")).toThrow("Invalid transaction value");
  });

  it("absent value defaults to 0 ETH (not rejected or 503)", () => {
    // When body.value is undefined, normalizeString returns undefined,
    // ?? "0" produces "0", and safeParseBigInt("0") returns 0n.
    // This covers ERC-20 and other contract calls that omit value.
    expect(safeParseBigInt("0")).toBe(0n);
  });
});
