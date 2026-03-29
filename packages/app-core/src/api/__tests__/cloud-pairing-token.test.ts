/**
 * Verifies that MiladyClient exposes getCloudCompatPairingToken and that
 * it targets the correct /api/cloud/v1/ endpoint (proxied through the local
 * cloud-compat route handler as a POST request).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(import.meta.dirname, "..", "client.ts"),
  "utf-8",
);

describe("MiladyClient.getCloudCompatPairingToken", () => {
  it("method is defined on MiladyClient", () => {
    expect(source).toContain("getCloudCompatPairingToken");
  });

  it("uses POST method", () => {
    const idx = source.indexOf("getCloudCompatPairingToken");
    const nearby = source.slice(idx, idx + 300);
    expect(nearby).toContain('method: "POST"');
  });

  it("targets the /api/cloud/v1/ prefix so it is forwarded by the compat handler", () => {
    const idx = source.indexOf("getCloudCompatPairingToken");
    const nearby = source.slice(idx, idx + 300);
    expect(nearby).toContain("/api/cloud/v1/");
  });

  it("encodes the agentId in the URL", () => {
    const idx = source.indexOf("getCloudCompatPairingToken");
    const nearby = source.slice(idx, idx + 300);
    expect(nearby).toContain("encodeURIComponent(agentId)");
  });

  it("returns token, redirectUrl, and expiresIn fields", () => {
    const idx = source.indexOf("getCloudCompatPairingToken");
    const nearby = source.slice(idx, idx + 400);
    expect(nearby).toContain("token");
    expect(nearby).toContain("redirectUrl");
    expect(nearby).toContain("expiresIn");
  });
});
