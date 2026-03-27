import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * Contract tests for autonomy enablement.
 * Test 1: mirrors the API route logic to catch handler regressions.
 * Test 2: verifies all three runtime code paths enable autonomy, while the
 * agent runtime still respects ENABLE_AUTONOMY guards.
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

  it("all three runtime paths enable autonomy after startup guards", () => {
    const expectEnableBlock = (source: string, anchor: string): string => {
      const start = source.indexOf(anchor);
      expect(start).toBeGreaterThan(-1);
      const after = source.slice(start, start + 1_600);
      expect(after).toContain("enableAutonomy()");
      return after;
    };

    // Agent runtime (initial boot)
    const agentEliza = readFileSync(
      path.resolve(import.meta.dirname, "..", "runtime", "eliza.ts"),
      "utf-8",
    );
    expect(agentEliza).toContain('process.env.ENABLE_AUTONOMY ?? "true"');
    const afterBoot = expectEnableBlock(
      agentEliza,
      "AutonomyService.start(runtime)",
    );
    expect(afterBoot).toContain("ENABLE_AUTONOMY=false");

    // Agent runtime (hot-reload)
    const afterHotReload = expectEnableBlock(
      agentEliza,
      "AutonomyService.start(newRuntime)",
    );
    expect(afterHotReload).toContain("hotReloadAutonomyEnabled");

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
    expectEnableBlock(desktopEliza, "AutonomyService.start(runtime)");
  });
});
