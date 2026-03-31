import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildWindowsRepairSteps,
  classifyElectrobunViewFailure,
  hasElectrobunViewExport,
  isSupportedBunVersion,
  resolveWorkspacePackageManifestPath,
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

  it("resolves hoisted workspace package manifests", () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "desktop-preflight-"),
    );
    const workspaceDir = path.join(rootDir, "apps", "app", "electrobun");
    const packageRoot = path.join(rootDir, "node_modules", "electrobun");
    const mainEntry = path.join(packageRoot, "dist", "api", "bun", "index.js");

    fs.mkdirSync(path.dirname(mainEntry), { recursive: true });
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(
      path.join(workspaceDir, "package.json"),
      JSON.stringify({ name: "@miladyai/electrobun" }),
    );
    fs.writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        name: "electrobun",
        exports: { ".": "./dist/api/bun/index.js" },
      }),
    );
    fs.writeFileSync(mainEntry, "export {};");

    expect(
      resolveWorkspacePackageManifestPath(workspaceDir, "electrobun"),
    ).toBe(path.join(packageRoot, "package.json"));
  });
});
