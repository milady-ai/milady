import { describe, expect, it } from "vitest";

describe("patchHttpCreateServerForMiladyCompat upstream listener guard", () => {
  it("wraps the upstream listener in Promise.resolve(...).catch(...)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const serverPath = path.resolve(import.meta.dirname, "server.ts");
    const source = fs.readFileSync(serverPath, "utf-8");

    const listenerIdx = source.indexOf("listener(req, res)");
    expect(listenerIdx).toBeGreaterThan(-1);

    const nearbyCode = source.slice(listenerIdx - 120, listenerIdx + 420);
    expect(nearbyCode).toContain("Promise.resolve(listener(req, res)).catch");
    expect(nearbyCode).toContain('"[milady-compat] upstream listener error"');
    expect(nearbyCode).toContain(
      'JSON.stringify({ error: "Internal server error" })',
    );
  });
});
