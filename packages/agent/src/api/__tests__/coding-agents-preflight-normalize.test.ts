/**
 * Regression tests for `normalizePreflightAuth`.
 *
 * The server used to forward the raw adapter `auth` field as
 * `Record<string, unknown>`, which didn't match the client-side
 * `AgentPreflightResult.auth` type. A shape drift in the adapter
 * would silently break the UI's `needsAuth` check and the
 * Authenticate button would never render. This normalizer pins
 * the contract at the HTTP boundary.
 */

import { describe, expect, it } from "vitest";
import { normalizePreflightAuth } from "../coding-agents-preflight-normalize";

describe("normalizePreflightAuth", () => {
  it("returns undefined for null / non-object input", () => {
    expect(normalizePreflightAuth(null)).toBeUndefined();
    expect(normalizePreflightAuth(undefined)).toBeUndefined();
    expect(normalizePreflightAuth("auth")).toBeUndefined();
    expect(normalizePreflightAuth(42)).toBeUndefined();
  });

  it("preserves authenticated / unauthenticated statuses verbatim", () => {
    expect(normalizePreflightAuth({ status: "authenticated" })).toEqual({
      status: "authenticated",
    });
    expect(normalizePreflightAuth({ status: "unauthenticated" })).toEqual({
      status: "unauthenticated",
    });
  });

  it("coerces unknown / missing status into 'unknown'", () => {
    expect(normalizePreflightAuth({})).toEqual({ status: "unknown" });
    expect(normalizePreflightAuth({ status: "garbage" })).toEqual({
      status: "unknown",
    });
    expect(normalizePreflightAuth({ status: 42 })).toEqual({
      status: "unknown",
    });
  });

  it("copies method, detail, loginHint when they are strings", () => {
    const out = normalizePreflightAuth({
      status: "unauthenticated",
      method: "device_code",
      detail: "Paste this code at the sign-in page.",
      loginHint: "ABCD-1234",
    });
    expect(out).toEqual({
      status: "unauthenticated",
      method: "device_code",
      detail: "Paste this code at the sign-in page.",
      loginHint: "ABCD-1234",
    });
  });

  it("drops non-string method / detail / loginHint fields", () => {
    const out = normalizePreflightAuth({
      status: "authenticated",
      method: 42,
      detail: { text: "x" },
      loginHint: null,
    });
    expect(out).toEqual({ status: "authenticated" });
  });

  it("does not forward unknown extra fields", () => {
    // Defense in depth: the adapter could in theory return access
    // tokens or other secrets in unexpected fields. The normalizer
    // only copies the four whitelisted shapes.
    const out = normalizePreflightAuth({
      status: "authenticated",
      accessToken: "sk-ant-oat01-secret",
      refreshToken: "sk-ant-ort01-secret",
    });
    expect(out).toEqual({ status: "authenticated" });
    expect((out as unknown as Record<string, unknown>).accessToken).toBeUndefined();
    expect((out as unknown as Record<string, unknown>).refreshToken).toBeUndefined();
  });
});
