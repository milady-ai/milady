/**
 * Regression tests for the `POST /api/coding-agents/auth/:agent`
 * response sanitizer. Guards the security properties the PR #1757
 * review called out:
 *
 *   - Only whitelisted fields (`launched`, `url`, `deviceCode`,
 *     `instructions`) reach the browser. `accessToken` and any
 *     other surprise field must be dropped.
 *   - URL values must be `http:` / `https:` — reject `javascript:`,
 *     `data:`, `file:`, and malformed URLs.
 *
 * The route handler also has a 15s server-side timeout path and a
 * 4xx branch for unknown adapters. Those are exercised through the
 * full HTTP stack, so this file pins the pure-function sanitizer
 * that sits at the bottom of that handler.
 */

import { describe, expect, it } from "vitest";
import { sanitizeAuthResult } from "../coding-agents-auth-sanitize";

describe("sanitizeAuthResult", () => {
  it("whitelists only the four expected fields", () => {
    const out = sanitizeAuthResult({
      launched: true,
      url: "https://example.com/login",
      deviceCode: "ABCD-1234",
      instructions: "Paste the code at the sign-in page.",
      // Fields that must NOT be forwarded:
      accessToken: "sk-ant-oat01-secret",
      refreshToken: "sk-ant-ort01-secret",
      apiKey: "sk-hidden",
      internalId: "adapter-42",
    });
    expect(out).toEqual({
      launched: true,
      url: "https://example.com/login",
      deviceCode: "ABCD-1234",
      instructions: "Paste the code at the sign-in page.",
    });
    expect((out as Record<string, unknown>).accessToken).toBeUndefined();
    expect((out as Record<string, unknown>).refreshToken).toBeUndefined();
    expect((out as Record<string, unknown>).apiKey).toBeUndefined();
  });

  it("accepts http:// and https:// URLs", () => {
    expect(sanitizeAuthResult({ url: "https://example.com" }).url).toBe(
      "https://example.com",
    );
    expect(sanitizeAuthResult({ url: "http://localhost:8080/cb" }).url).toBe(
      "http://localhost:8080/cb",
    );
  });

  it("rejects javascript:, data:, and file: URLs", () => {
    // React's built-in URL sanitizer blocks javascript: in hrefs as a
    // last line of defense, but the server should never have let them
    // through in the first place.
    expect(
      sanitizeAuthResult({ url: "javascript:alert(1)" }).url,
    ).toBeUndefined();
    expect(
      sanitizeAuthResult({ url: "data:text/html,<script>alert(1)</script>" })
        .url,
    ).toBeUndefined();
    expect(
      sanitizeAuthResult({ url: "file:///etc/passwd" }).url,
    ).toBeUndefined();
  });

  it("rejects malformed URLs", () => {
    expect(sanitizeAuthResult({ url: "not a url" }).url).toBeUndefined();
    expect(sanitizeAuthResult({ url: "" }).url).toBeUndefined();
  });

  it("drops non-string url, deviceCode, and instructions fields", () => {
    const out = sanitizeAuthResult({
      url: 42,
      deviceCode: { code: "X" },
      instructions: ["step 1"],
      launched: "yes",
    });
    expect(out).toEqual({});
  });

  it("returns an empty object for null / non-object inputs", () => {
    expect(sanitizeAuthResult(null)).toEqual({});
    expect(sanitizeAuthResult(undefined)).toEqual({});
    expect(sanitizeAuthResult("string")).toEqual({});
    expect(sanitizeAuthResult(42)).toEqual({});
  });
});
