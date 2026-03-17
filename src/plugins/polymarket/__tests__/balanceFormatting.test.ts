import { describe, it, expect } from "vitest";
import { formatBalance } from "../utils/balanceFormat";

describe("formatBalance", () => {
  it("formats small balance correctly", () => {
    expect(formatBalance("9.5")).toBe("9.500000");
  });

  it("formats $999.99 correctly (boundary)", () => {
    expect(formatBalance("999.99")).toBe("999.990000");
  });

  it("formats $1000 correctly (boundary - old bug)", () => {
    expect(formatBalance("1000")).toBe("1000.000000");
  });

  it("formats $1000.01 correctly (boundary)", () => {
    expect(formatBalance("1000.01")).toBe("1000.010000");
  });

  it("formats $50000 correctly", () => {
    expect(formatBalance("50000")).toBe("50000.000000");
  });

  it("handles null", () => {
    expect(formatBalance(null)).toBe("0");
  });

  it("handles undefined", () => {
    expect(formatBalance(undefined)).toBe("0");
  });

  it("handles zero", () => {
    expect(formatBalance("0")).toBe("0.000000");
  });

  it("handles non-numeric string", () => {
    expect(formatBalance("not-a-number")).toBe("0");
  });
});
