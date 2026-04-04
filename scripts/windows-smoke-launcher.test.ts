import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const PACKAGE_JSON_PATH = path.join(ROOT, "package.json");
const LAUNCHER_PATH = path.join(ROOT, "scripts/run-windows-smoke-launcher.ps1");
const SMOKE_SCRIPT_PATH = path.join(
  ROOT,
  "apps/app/electrobun/scripts/smoke-test-windows.ps1",
);

describe("windows packaged smoke launcher", () => {
  it("routes the package script through the launcher shim", () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.["test:desktop:packaged:windows"]).toBe(
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-windows-smoke-launcher.ps1 apps/app/electrobun/scripts/smoke-test-windows.ps1",
    );
  });

  it("resolves a PowerShell 7 host before invoking the smoke script", () => {
    const launcher = fs.readFileSync(LAUNCHER_PATH, "utf8");

    expect(launcher).toContain("[string]$ScriptPath");
    expect(launcher).toContain('"pwsh.exe"');
    expect(launcher).toContain("PowerShell\\7\\pwsh.exe");
    expect(launcher).toContain(
      "& $pwsh -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @ScriptArgs",
    );
  });

  it("uses the resolved temp root for local smoke-script scratch paths", () => {
    const smokeScript = fs.readFileSync(SMOKE_SCRIPT_PATH, "utf8");

    expect(smokeScript).toContain("$tempExtractDir = Join-Path $tempRoot");
    expect(smokeScript).toContain("$startupStateFile = Join-Path $tempRoot");
    expect(smokeScript).toContain("$startupEventsFile = Join-Path $tempRoot");
    expect(smokeScript).toContain(
      'Join-Path $tempRoot "milady-windows-ui-launcher"',
    );
    expect(smokeScript).toContain(
      'Join-Path $tempRoot ("milady-archive-asset-check-"',
    );
    expect(smokeScript).toContain(
      'Join-Path $tempRoot ("milady-windows-installed-"',
    );
  });
});
