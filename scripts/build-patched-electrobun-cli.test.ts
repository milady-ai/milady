import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { patchCliSourceText } from "./build-patched-electrobun-cli.mjs";

const SCRIPT_PATH = path.resolve(
  import.meta.dirname,
  "build-patched-electrobun-cli.mjs",
);

describe("build-patched-electrobun-cli", () => {
  const makeCliSource = (eol = "\n") =>
    [
      'import * as readline from "readline";',
      "// @ts-expect-error - reserved for future use",
      "const _MAX_CHUNK_SIZE = 1024 * 2;",
      "",
      "async function embedLauncherIcon() {",
      '  const rcedit = (await import("rcedit")).default;',
      "}",
      "",
      "async function embedBunIcon() {",
      '  const rcedit = (await import("rcedit")).default;',
      "}",
      "",
      "async function embedInstallerIcon() {",
      '  const rcedit = (await import("rcedit")).default;',
      "}",
      "",
    ].join(eol);

  it("builds a patched upstream Windows CLI that resolves rcedit from the workspace install", () => {
    const script = fs.readFileSync(SCRIPT_PATH, "utf8");

    expect(script).toContain("https://github.com/blackboardsh/electrobun.git");
    expect(script).toContain('"sparse-checkout", "set", "package"');
    expect(script).toContain("ELECTROBUN_RCEDIT_PACKAGE_JSON");
    expect(script).toContain('"templates"');
    expect(script).toContain('"embedded.ts"');
    expect(script).toContain("async function importRcedit()");
    expect(script).toContain('overrideRequire.resolve("rcedit")');
    expect(script).toContain("--target=bun-windows-x64-baseline");
    expect(script).toContain("const installedBinPath = path.join(");
    expect(script).toContain("  installedElectrobunDir,");
    expect(script).toContain('  "bin",');
    expect(script).toContain('  "electrobun.exe",');
    expect(script).toContain("const installedCachePath = path.join(");
    expect(script).toContain("  installedElectrobunDir,");
    expect(script).toContain('  ".cache",');
    expect(script).toContain('  "electrobun.exe",');
  });

  it("patches LF-delimited Electrobun source with the importRcedit helper", () => {
    const patched = patchCliSourceText(makeCliSource());

    expect(patched).toContain('import { createRequire } from "module";');
    expect(patched).toContain('import { pathToFileURL } from "url";');
    expect(patched).toContain("async function importRcedit()");
    expect(patched).not.toContain(
      'const rcedit = (await import("rcedit")).default;',
    );
    expect(
      patched.match(/const rcedit = await importRcedit\(\);/g),
    ).toHaveLength(3);
  });

  it("patches CRLF-delimited Electrobun source with the importRcedit helper", () => {
    const patched = patchCliSourceText(makeCliSource("\r\n"));

    expect(patched).toContain(
      '\r\nimport { createRequire } from "module";\r\nimport { pathToFileURL } from "url";',
    );
    expect(patched).toContain("\r\n\r\nasync function importRcedit()");
    expect(patched).not.toContain(
      'const rcedit = (await import("rcedit")).default;',
    );
    expect(
      patched.match(/const rcedit = await importRcedit\(\);/g),
    ).toHaveLength(3);
  });
});
