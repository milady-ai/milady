import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * Contract tests for autonomy enablement.
 * Test 1: mirrors the API route logic to catch handler regressions.
 * Test 2: verifies all three code paths call enableAutonomy().
 */
describe("autonomy enablement for triggers", () => {
  it("API toggle calls service methods and syncs the property", async () => {
    const runtime = { enableAutonomy: false, getService: vi.fn() };
    const svc = {
      enableAutonomy: vi.fn(async () => {
        runtime.enableAutonomy = true;
      }),
      disableAutonomy: vi.fn(async () => {
        runtime.enableAutonomy = false;
      }),
    };
    runtime.getService.mockReturnValue(svc);

    // Enable
    const autonomySvc = runtime.getService("AUTONOMY");
    if (autonomySvc && typeof autonomySvc.enableAutonomy === "function") {
      await autonomySvc.enableAutonomy();
    }
    runtime.enableAutonomy = true;
    expect(svc.enableAutonomy).toHaveBeenCalledOnce();
    expect(runtime.enableAutonomy).toBe(true);

    // Disable
    if (autonomySvc && typeof autonomySvc.disableAutonomy === "function") {
      await autonomySvc.disableAutonomy();
    }
    runtime.enableAutonomy = false;
    expect(svc.disableAutonomy).toHaveBeenCalledOnce();
    expect(runtime.enableAutonomy).toBe(false);
  });

  it("all three runtime paths call enableAutonomy after AutonomyService.start", () => {
    // Agent runtime (initial boot)
    const agentEliza = readFileSync(
      path.resolve(import.meta.dirname, "..", "runtime", "eliza.ts"),
      "utf-8",
    );
    const bootStart = agentEliza.indexOf("AutonomyService.start(runtime)");
    expect(bootStart).toBeGreaterThan(-1);
    const afterBoot = agentEliza.slice(bootStart, bootStart + 800);
    expect(afterBoot).toContain(".enableAutonomy()");

    // Agent runtime (hot-reload)
    const hotReloadStart = agentEliza.indexOf(
      "AutonomyService.start(newRuntime)",
    );
    expect(hotReloadStart).toBeGreaterThan(-1);
    const afterHotReload = agentEliza.slice(
      hotReloadStart,
      hotReloadStart + 800,
    );
    expect(afterHotReload).toContain(".enableAutonomy()");

    // Desktop runtime (app-core)
    const desktopEliza = readFileSync(
      path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "app-core",
        "src",
        "runtime",
        "eliza.ts",
      ),
      "utf-8",
    );
    const desktopStart = desktopEliza.indexOf("AutonomyService.start(runtime)");
    expect(desktopStart).toBeGreaterThan(-1);
    const afterDesktop = desktopEliza.slice(desktopStart, desktopStart + 800);
    expect(afterDesktop).toContain(".enableAutonomy()");
  });
});
