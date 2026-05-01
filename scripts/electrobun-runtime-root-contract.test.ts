import fs from "node:fs";
import { describe, expect, test } from "vitest";

describe("Electrobun release runtime root contract", () => {
  test("release workflow pins Electrobun copy resolution to the wrapper repo", () => {
    const workflow = fs.readFileSync(
      ".github/workflows/release-electrobun.yml",
      "utf8",
    );

    expect(workflow).toMatch(/name: Validate Electrobun runtime copy contract/);
    expect(workflow).toMatch(
      /ELIZA_ELECTROBUN_REPO_ROOT: \$\{\{ github\.workspace \}\}/,
    );
    expect(workflow).toMatch(/expectedRuntimeSource = path\.resolve\("dist"\)/);
    expect(workflow).toMatch(/destination\]\) => destination === "eliza-dist"/);
    expect(workflow).toMatch(
      /runtime export target found: \$runtimeExport -> \$existingTarget/,
    );
    expect(workflow).toMatch(/Resolve-AgentPackageExportTargets/);
    expect(workflow).toMatch(/\.Replace\("\*", \$replacement\)/);
    expect(workflow).not.toMatch(/packages\\agent\\src\\\$runtimeModule/);
    expect(workflow).toMatch(
      /ELIZA_TEST_WINDOWS_ARTIFACTS_DIR: \$\{\{ github\.workspace \}\}\\eliza\\packages\\app-core\\platforms\\electrobun\\artifacts/,
    );
    expect(workflow).toMatch(
      /ELIZA_TEST_WINDOWS_BUILD_DIR: \$\{\{ github\.workspace \}\}\\eliza\\packages\\app-core\\platforms\\electrobun\\build/,
    );
    expect(workflow).toMatch(
      /MILADY_TEST_WINDOWS_INSTALL_DIR: \$\{\{ runner\.temp \}\}\\el/,
    );
    expect(workflow).toMatch(
      /name: Apply Electrobun release compatibility patches/,
    );
    expect(workflow).toMatch(
      /node scripts\/patch-electrobun-release-compat\.mjs/,
    );
    expect(workflow).toMatch(/MILADY_TEST_WINDOWS_APPDATA_PATH/);
    expect(workflow).toMatch(
      /elseif \(\$env:ELIZA_TEST_WINDOWS_APPDATA_PATH\)/,
    );
    expect(workflow.indexOf("ELIZA_TEST_WINDOWS_INSTALL_DIR")).toBeLessThan(
      workflow.indexOf("MILADY_TEST_WINDOWS_INSTALL_DIR"),
    );
  });

  test("Electrobun config exposes wrapper-aware repo root resolution", () => {
    const config = fs.readFileSync(
      "eliza/packages/app-core/platforms/electrobun/electrobun.config.ts",
      "utf8",
    );

    expect(config).toMatch(/ELIZA_ELECTROBUN_REPO_ROOT/);
    expect(config).toMatch(/hasOuterElizaElectrobunCheckout/);
    expect(config).toMatch(/export function resolveElectrobunRepoRoot/);
  });
});
