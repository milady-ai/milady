#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const electrobunDir = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "platforms",
  "electrobun",
);
const smokeScript = path.join(
  electrobunDir,
  "scripts",
  "smoke-test-windows.ps1",
);
const artifactsDir = path.join(electrobunDir, "artifacts");
const buildDir = path.join(electrobunDir, "build");

function fail(message, code = 1) {
  console.error(`[milady-desktop-smoke] ${message}`);
  process.exit(code);
}

function hasSmokePayload(root) {
  if (!fs.existsSync(root)) return false;

  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(candidate);
        continue;
      }
      if (
        entry.isFile() &&
        (/launcher\.exe$/i.test(entry.name) ||
          /setup.*\.exe$/i.test(entry.name) ||
          /\.(tar\.gz|tgz)$/i.test(entry.name))
      ) {
        return true;
      }
    }
  }

  return false;
}

if (!fs.existsSync(smokeScript)) {
  fail(`Windows smoke script not found: ${smokeScript}`);
}

const smokeArtifactsDir = hasSmokePayload(artifactsDir)
  ? artifactsDir
  : hasSmokePayload(buildDir)
    ? buildDir
    : null;
if (!smokeArtifactsDir) {
  fail(
    `No Windows desktop smoke payload found under ${artifactsDir} or ${buildDir}. Run bun run build:desktop first.`,
  );
}

const smokeBuildDir = fs.existsSync(buildDir) ? buildDir : smokeArtifactsDir;
const result = spawnSync(
  "pwsh",
  [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    smokeScript,
    "-ArtifactsDir",
    smokeArtifactsDir,
    "-BuildDir",
    smokeBuildDir,
    ...process.argv.slice(2),
  ],
  {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  fail(`pwsh failed to start: ${result.error.message}`);
}
if ((result.status ?? 1) !== 0) {
  fail(
    `Windows packaged desktop smoke failed with code ${result.status ?? 1}`,
    result.status ?? 1,
  );
}
