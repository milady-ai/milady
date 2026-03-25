import { describe, expect, it } from "vitest";
import {
  formatUncaughtError,
  shouldIgnoreUnhandledRejection,
} from "./error-handlers";

describe("formatUncaughtError", () => {
  it("returns stack trace for Error with stack", () => {
    const err = new Error("boom");
    expect(formatUncaughtError(err)).toBe(err.stack);
  });

  it("returns message for Error without stack", () => {
    const err = new Error("boom");
    err.stack = undefined;
    expect(formatUncaughtError(err)).toBe("boom");
  });

  it("stringifies non-Error values", () => {
    expect(formatUncaughtError("oops")).toBe("oops");
    expect(formatUncaughtError(42)).toBe("42");
    expect(formatUncaughtError(null)).toBe("null");
  });
});

describe("shouldIgnoreUnhandledRejection", () => {
  it("returns false for generic errors", () => {
    expect(shouldIgnoreUnhandledRejection(new Error("generic"))).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(shouldIgnoreUnhandledRejection(null)).toBe(false);
    expect(shouldIgnoreUnhandledRejection(undefined)).toBe(false);
  });

  it("returns false for AI error without credit signal", () => {
    const err = new Error("AI_APICallError: network timeout");
    expect(shouldIgnoreUnhandledRejection(err)).toBe(false);
  });

  it("returns true for AI error with insufficient credits in message", () => {
    const err = new Error("AI_APICallError: insufficient credits");
    expect(shouldIgnoreUnhandledRejection(err)).toBe(true);
  });

  it("returns true for AI error with 'out of credits' in message", () => {
    const err = new Error("AI_NoOutputGeneratedError: out of credits");
    expect(shouldIgnoreUnhandledRejection(err)).toBe(true);
  });

  it("returns true for AI error with 'payment required' in message", () => {
    const err = new Error("AI_APICallError: payment required");
    expect(shouldIgnoreUnhandledRejection(err)).toBe(true);
  });

  it("returns true for AI error with statusCode 402", () => {
    const err = Object.assign(new Error("AI_APICallError: failed"), {
      statusCode: 402,
    });
    expect(shouldIgnoreUnhandledRejection(err)).toBe(true);
  });

  it("returns true for AI error with credit signal in responseBody", () => {
    const err = Object.assign(
      new Error("AI_NoOutputGeneratedError: no output"),
      { responseBody: "insufficient_quota reached" },
    );
    expect(shouldIgnoreUnhandledRejection(err)).toBe(true);
  });

  it("returns true for non-Error with AI pattern in stringified form", () => {
    // shouldIgnoreUnhandledRejection uses formatUncaughtError which calls
    // String() on non-Error values, so AI patterns can match stringified objects
    const reason = { toString: () => "AI_APICallError: out of credits" };
    expect(shouldIgnoreUnhandledRejection(reason)).toBe(true);
  });
});
