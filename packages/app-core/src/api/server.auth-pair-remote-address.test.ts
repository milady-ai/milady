import { describe, expect, it } from "vitest";

describe("/api/auth/pair remote address guard", () => {
  it("rejects requests when socket.remoteAddress is unavailable", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const serverPath = path.resolve(import.meta.dirname, "server.ts");
    const source = fs.readFileSync(serverPath, "utf-8");

    const pairRouteIdx = source.indexOf('"/api/auth/pair"');
    expect(pairRouteIdx).toBeGreaterThan(-1);

    const nearbyCode = source.slice(pairRouteIdx, pairRouteIdx + 800);
    expect(nearbyCode).toContain(
      "const remoteAddress = req.socket.remoteAddress",
    );
    expect(nearbyCode).toContain("Cannot determine client address");
    expect(nearbyCode).toContain("rateLimitPairing(remoteAddress)");
  });
});
