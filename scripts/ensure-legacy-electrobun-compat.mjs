#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ensureLegacyElectrobunCompatDir,
  writeLegacyElectrobunWrapper,
} from "./run-release-contract-suite.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const legacyDir = path.join(repoRoot, "apps", "app", "electrobun");
const canonicalDir = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "platforms",
  "electrobun",
);
const wrapperPath = path.join(legacyDir, "electrobun.config.ts");

const before = {
  canonicalExists: fs.existsSync(canonicalDir),
  legacyDirExists: fs.existsSync(legacyDir),
  wrapperExists: fs.existsSync(wrapperPath),
};
console.log(
  `[ensure-legacy-electrobun-compat] state before: ${JSON.stringify(before)}`,
);

const created = ensureLegacyElectrobunCompatDir();
const status = created ? "created" : "skipped";
console.log(
  `[ensure-legacy-electrobun-compat] ${status} apps/app/electrobun compatibility directory`,
);

// Defensive guarantee: if canonical exists, wrapper must exist after this
// script runs. The "skipped" branch can fire when both legacy dir and wrapper
// are present, but in CI we have observed the wrapper missing right after
// "skipped" is reported. Re-create it unconditionally rather than trust the
// optimization.
if (before.canonicalExists && !fs.existsSync(wrapperPath)) {
  console.warn(
    `[ensure-legacy-electrobun-compat] wrapper missing after run; force-creating ${wrapperPath}`,
  );
  fs.mkdirSync(legacyDir, { recursive: true });
  writeLegacyElectrobunWrapper(wrapperPath);
}

const after = {
  canonicalExists: fs.existsSync(canonicalDir),
  legacyDirExists: fs.existsSync(legacyDir),
  wrapperExists: fs.existsSync(wrapperPath),
};
console.log(
  `[ensure-legacy-electrobun-compat] state after: ${JSON.stringify(after)}`,
);

if (after.canonicalExists && !after.wrapperExists) {
  console.error(
    `[ensure-legacy-electrobun-compat] FATAL: wrapper still missing at ${wrapperPath} despite canonical present`,
  );
  process.exit(1);
}
