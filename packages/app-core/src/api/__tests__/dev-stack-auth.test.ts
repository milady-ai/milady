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
    const serverPath = path.resolve(
      import.meta.dirname,
      "..",
      "dev-compat-routes.ts",
    );
    const source = fs.readFileSync(serverPath, "utf-8");

    // Find the dev/stack route handler
    const devStackIdx = source.indexOf('"/api/dev/stack"');
    expect(devStackIdx).toBeGreaterThan(-1);

    // Verify auth guard appears within 200 chars after the route match
    const nearbyCode = source.slice(devStackIdx, devStackIdx + 200);
    expect(nearbyCode).toContain("ensureCompatApiAuthorized");
  });

  it("route handler includes a loopback-only socket guard", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const serverPath = path.resolve(
      import.meta.dirname,
      "..",
      "dev-compat-routes.ts",
    );
    const source = fs.readFileSync(serverPath, "utf-8");

    const devStackIdx = source.indexOf('"/api/dev/stack"');
    expect(devStackIdx).toBeGreaterThan(-1);

    const nearbyCode = source.slice(devStackIdx, devStackIdx + 350);
    expect(nearbyCode).toContain("req.socket.remoteAddress");
    expect(nearbyCode).toContain('"loopback only"');
  });

  it("gates /api/dev/* routes behind a production 404", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const serverPath = path.resolve(
      import.meta.dirname,
      "..",
      "dev-compat-routes.ts",
    );
    const source = fs.readFileSync(serverPath, "utf-8");

    const devRouteIdx = source.indexOf('url.pathname.startsWith("/api/dev/")');
    expect(devRouteIdx).toBeGreaterThan(-1);

    const nearbyCode = source.slice(devRouteIdx, devRouteIdx + 220);
    expect(nearbyCode).toContain('process.env.NODE_ENV === "production"');
    expect(nearbyCode).toContain(
      'sendJsonErrorResponse(res, 404, "Not found")',
    );
  });
});
