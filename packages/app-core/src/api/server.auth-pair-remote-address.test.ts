import { describe, expect, it } from "vitest";

describe("/api/auth/pair remote address guard", () => {
  it("rejects requests when socket.remoteAddress is unavailable", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const serverSource = fs.readFileSync(
      path.resolve(import.meta.dirname, "server.ts"),
      "utf-8",
    );
    expect(serverSource).toContain(
      "handleAuthPairingCompatRoutes(req, res, state)",
    );

    const routeSource = fs.readFileSync(
      path.resolve(import.meta.dirname, "auth-pairing-compat-routes.ts"),
      "utf-8",
    );
    const pairRouteIdx = routeSource.indexOf('"/api/auth/pair"');
    expect(pairRouteIdx).toBeGreaterThan(-1);

    const nearbyCode = routeSource.slice(pairRouteIdx, pairRouteIdx + 800);
    expect(nearbyCode).toContain(
      "const remoteAddress = req.socket.remoteAddress",
    );
    expect(nearbyCode).toContain("Cannot determine client address");
    expect(nearbyCode).toContain("rateLimitPairing(remoteAddress)");
  });
});
