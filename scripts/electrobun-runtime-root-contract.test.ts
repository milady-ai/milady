import fs from "node:fs";
import { describe, expect, test } from "vitest";

const electrobunConfigPath =
  "eliza/packages/app-core/platforms/electrobun/electrobun.config.ts";

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
      /Electrobun copy map does not include eliza-dist runtime destination/,
    );
    expect(workflow).toMatch(
      /Electrobun runtime source resolves to \$\{resolvedRuntimeSource\}, expected \$\{expectedRuntimeSource\}/,
    );
    expect(workflow).toMatch(
      /test -f dist\/node_modules\/@elizaos\/agent\/package\.json/,
    );
    expect(workflow).toMatch(
      /eliza-dist @elizaos\/agent package manifest found/,
    );
    expect(workflow).not.toMatch(/packages\\agent\\src\\\$runtimeModule/);
    expect(workflow).toMatch(
      /ELIZA_TEST_WINDOWS_ARTIFACTS_DIR: \$\{\{ github\.workspace \}\}\\eliza\\packages\\app-core\\platforms\\electrobun\\artifacts/,
    );
    expect(workflow).toMatch(
      /ELIZA_TEST_WINDOWS_BUILD_DIR: \$\{\{ github\.workspace \}\}\\eliza\\packages\\app-core\\platforms\\electrobun\\build/,
    );
  });

  test.skipIf(!fs.existsSync(electrobunConfigPath))(
    "Electrobun config exposes wrapper-aware repo root resolution",
    () => {
      const config = fs.readFileSync(electrobunConfigPath, "utf8");

      expect(config).toMatch(/ELIZA_ELECTROBUN_REPO_ROOT/);
      expect(config).toMatch(/hasOuterElizaElectrobunCheckout/);
      expect(config).toMatch(/export function resolveElectrobunRepoRoot/);
    },
  );
});
