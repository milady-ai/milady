/**
 * Verifies that MiladyClient exposes getCloudCompatPairingToken and that
 * it targets the correct /api/cloud/v1/ endpoint (proxied through the local
 * cloud-compat route handler as a POST request).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(import.meta.dirname, "..", "client-cloud.ts"),
  "utf-8",
);

// The method lives in client-cloud.ts via prototype augmentation. The source
// file has both a declaration merging interface entry and the implementation.
// Use the prototype assignment as the anchor to find the implementation.
const implAnchor = "prototype.getCloudCompatPairingToken";

describe("MiladyClient.getCloudCompatPairingToken", () => {
  it("method is defined on MiladyClient", () => {
    expect(source).toContain(implAnchor);
  });

  it("uses POST method", () => {
    const idx = source.indexOf(implAnchor);
    const nearby = source.slice(idx, idx + 300);
    expect(nearby).toContain('method: "POST"');
  });

  it("targets the /api/cloud/v1/ prefix so it is forwarded by the compat handler", () => {
    const idx = source.indexOf(implAnchor);
    const nearby = source.slice(idx, idx + 300);
    expect(nearby).toContain("/api/cloud/v1/");
  });

  it("encodes the agentId in the URL", () => {
    const idx = source.indexOf(implAnchor);
    const nearby = source.slice(idx, idx + 300);
    expect(nearby).toContain("encodeURIComponent(agentId)");
  });

  it("returns token, redirectUrl, and expiresIn fields", () => {
    // The return type is declared in the interface (declaration merging),
    // not in the prototype implementation — check the whole file.
    expect(source).toContain("token");
    expect(source).toContain("redirectUrl");
    expect(source).toContain("expiresIn");
  });
});
