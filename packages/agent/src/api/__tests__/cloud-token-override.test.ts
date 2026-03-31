/**
 * Verifies that cloud-provisioned containers override the disableAutoApiToken
 * flag and always generate an inbound API token, preventing auth dead-locks
 * where isAuthorized() rejects every request (no token + cloud flag = 401).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const serverSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "server.ts"),
  "utf-8",
);

describe("cloud container token override (ensureApiTokenForBindHost)", () => {
  it("overrides disableAutoApiToken when cloud-provisioned", () => {
    // The guard must check cloudProvisioned before honoring disableAutoApiToken
    const fnStart = serverSource.indexOf("export function ensureApiTokenForBindHost");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = serverSource.slice(fnStart, fnStart + 1200);

    // The disable flag must be checked together with !cloudProvisioned
    expect(fnBody).toContain("disableAutoApiToken && !cloudProvisioned");
  });

  it("reads cloudProvisioned before the disableAutoApiToken early-return", () => {
    const fnStart = serverSource.indexOf("export function ensureApiTokenForBindHost");
    const fnBody = serverSource.slice(fnStart, fnStart + 1200);

    const cloudProvisionedIdx = fnBody.indexOf("isCloudProvisionedContainer()");
    const disableReturnIdx = fnBody.indexOf("disableAutoApiToken && !cloudProvisioned");

    // cloudProvisioned must be assigned before it's used in the disable check
    expect(cloudProvisionedIdx).toBeGreaterThan(-1);
    expect(disableReturnIdx).toBeGreaterThan(-1);
    expect(cloudProvisionedIdx).toBeLessThan(disableReturnIdx);
  });

  it("still respects disableAutoApiToken for non-cloud loopback hosts", () => {
    const fnStart = serverSource.indexOf("export function ensureApiTokenForBindHost");
    const fnBody = serverSource.slice(fnStart, fnStart + 1200);

    // When not cloud-provisioned, disableAutoApiToken causes early return
    expect(fnBody).toContain("if (disableAutoApiToken && !cloudProvisioned)");
    // The early-return is followed by a plain return statement
    const guardIdx = fnBody.indexOf("if (disableAutoApiToken && !cloudProvisioned)");
    const afterGuard = fnBody.slice(guardIdx, guardIdx + 60);
    expect(afterGuard).toContain("return");
  });

  it("generates a token for cloud containers even when disableAutoApiToken would fire", () => {
    // Confirm that the code path continues past the disable-flag check for cloud
    // containers and reaches the token generation (randomBytes + setApiToken).
    const fnStart = serverSource.indexOf("export function ensureApiTokenForBindHost");
    const fnEnd = serverSource.indexOf("\n}", fnStart);
    const fnBody = serverSource.slice(fnStart, fnEnd);

    expect(fnBody).toContain("crypto.randomBytes");
    expect(fnBody).toContain("setApiToken");
  });
});
