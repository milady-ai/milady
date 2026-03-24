import { describe, expect, it } from "vitest";
import { req } from "../../../../test/helpers/http";

/**
 * Validates that /api/dev/stack requires authentication when a token is set.
 * This is a static contract test — it verifies the auth guard is present
 * by checking the exported route handler source.
 */
describe("/api/dev/stack auth guard", () => {
  it("route handler includes ensureCompatApiAuthorized check", async () => {
    // Read the server source to verify the auth guard is present
    const fs = await import("node:fs");
    const path = await import("node:path");
    const serverPath = path.resolve(import.meta.dirname, "..", "server.ts");
    const source = fs.readFileSync(serverPath, "utf-8");

    // Find the dev/stack route handler
    const devStackIdx = source.indexOf('"/api/dev/stack"');
    expect(devStackIdx).toBeGreaterThan(-1);

    // Verify auth guard appears within 200 chars after the route match
    const nearbyCode = source.slice(devStackIdx, devStackIdx + 200);
    expect(nearbyCode).toContain("ensureCompatApiAuthorized");
  });
});
