import { describe, expect, it } from "vitest";
import {
  buildWindowsRepairSteps,
  classifyElectrobunViewFailure,
  hasElectrobunViewExport,
  isSupportedBunVersion,
} from "./desktop-preflight.mjs";

describe("desktop-preflight helpers", () => {
  it("flags EACCES electrobun/view errors as actionable", () => {
    const result = classifyElectrobunViewFailure(
      'Cannot read directory "D:/repo/apps/app/electrobun/node_modules/electrobun/view": EACCES',
    );
    expect(result.code).toBe("EACCES_ELECTROBUN_VIEW");
    expect(result.actionable).toBe(true);
  });

  it("detects missing ./view export in electrobun manifest", () => {
    expect(
      hasElectrobunViewExport({ exports: { ".": "./dist/index.js" } }),
    ).toBe(false);
    expect(
      hasElectrobunViewExport({
        exports: { "./view": "./dist/api/browser/index.ts" },
      }),
    ).toBe(true);
  });

  it("accepts stable bun >=1.3 and rejects canary", () => {
    expect(isSupportedBunVersion("1.3.10")).toBe(true);
    expect(isSupportedBunVersion("1.4.0")).toBe(true);
    expect(isSupportedBunVersion("1.3.0-canary.9")).toBe(false);
    expect(isSupportedBunVersion("1.2.22")).toBe(false);
  });

  it("emits deterministic windows repair steps", () => {
    const lines = buildWindowsRepairSteps();
    expect(lines[0]).toContain("Repair steps");
    expect(lines.join("\n")).toContain("apps/app/electrobun/node_modules");
    expect(lines.join("\n")).toContain("node_modules/.bun");
    expect(lines.join("\n")).toContain("bun run start:desktop");
  });
});
