import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ensureLegacyElectrobunCompatDir } from "./run-release-contract-suite.mjs";

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "milady-electrobun-compat-"),
  );
  tempDirs.push(dir);
  return dir;
}

function writeFile(filePath: string, value = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("ensure-legacy-electrobun-compat", () => {
  it("creates the legacy apps/app/electrobun wrapper when only the canonical path exists", () => {
    const repoRoot = makeTempDir();
    const canonicalDir = path.join(
      repoRoot,
      "eliza",
      "packages",
      "app-core",
      "platforms",
      "electrobun",
    );
    const legacyDir = path.join(repoRoot, "apps", "app", "electrobun");

    writeFile(
      path.join(canonicalDir, "package.json"),
      '{"name":"electrobun"}\n',
    );
    writeFile(
      path.join(canonicalDir, "scripts", "stage-macos-release-artifacts.sh"),
      "#!/usr/bin/env bash\n",
    );

    expect(
      ensureLegacyElectrobunCompatDir({
        canonicalDir,
        legacyDir,
        canonicalConfigImportPath:
          "../../../eliza/packages/app-core/platforms/electrobun/electrobun.config.ts",
      }),
    ).toBe(true);

    expect(fs.existsSync(path.join(legacyDir, "package.json"))).toBe(true);
    expect(
      fs.existsSync(
        path.join(legacyDir, "scripts", "stage-macos-release-artifacts.sh"),
      ),
    ).toBe(true);
    expect(
      fs.readFileSync(path.join(legacyDir, "electrobun.config.ts"), "utf8"),
    ).toContain(
      "../../../eliza/packages/app-core/platforms/electrobun/electrobun.config.ts",
    );
  });

  it("skips when the legacy directory already has the wrapper config", () => {
    const repoRoot = makeTempDir();
    const canonicalDir = path.join(
      repoRoot,
      "eliza",
      "packages",
      "app-core",
      "platforms",
      "electrobun",
    );
    const legacyDir = path.join(repoRoot, "apps", "app", "electrobun");

    writeFile(
      path.join(canonicalDir, "package.json"),
      '{"name":"electrobun"}\n',
    );
    writeFile(path.join(legacyDir, "package.json"), '{"name":"electrobun"}\n');
    writeFile(
      path.join(legacyDir, "electrobun.config.ts"),
      "export default {};\n",
    );

    expect(ensureLegacyElectrobunCompatDir({ canonicalDir, legacyDir })).toBe(
      false,
    );
  });

  it("fills in the wrapper when the legacy directory exists but has no config", () => {
    const repoRoot = makeTempDir();
    const canonicalDir = path.join(
      repoRoot,
      "eliza",
      "packages",
      "app-core",
      "platforms",
      "electrobun",
    );
    const legacyDir = path.join(repoRoot, "apps", "app", "electrobun");

    writeFile(
      path.join(canonicalDir, "package.json"),
      '{"name":"electrobun"}\n',
    );
    writeFile(
      path.join(canonicalDir, "scripts", "stage-macos-release-artifacts.sh"),
      "#!/usr/bin/env bash\n",
    );
    writeFile(
      path.join(legacyDir, "scripts", "ensure-whisper-model.sh"),
      "#!/usr/bin/env bash\n",
    );

    expect(
      ensureLegacyElectrobunCompatDir({
        canonicalDir,
        legacyDir,
        canonicalConfigImportPath:
          "../../../eliza/packages/app-core/platforms/electrobun/electrobun.config.ts",
      }),
    ).toBe(true);

    expect(fs.existsSync(path.join(legacyDir, "electrobun.config.ts"))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(legacyDir, "scripts", "ensure-whisper-model.sh")),
    ).toBe(true);
  });
});
