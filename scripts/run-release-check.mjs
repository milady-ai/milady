#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import {
  isElizaWorktreeClean,
  listElizaUntrackedFiles,
  restoreGeneratedElizaChanges,
} from "./run-release-contract-suite.mjs";

const releaseWorkflowPath = ".github/workflows/release-electrobun.yml";
const releaseWorkflowNeedles = [
  "MILADY_NO_VISION_DEPS: $" +
    "{{ matrix.platform.os == 'windows' && '1' || '' }}",
];

const shouldRestoreElizaChanges = isElizaWorktreeClean();
const initialElizaUntrackedFiles = shouldRestoreElizaChanges
  ? listElizaUntrackedFiles()
  : [];
let exitStatus = 1;
let exitSignal = null;

try {
  const applyResult = spawnSync(
    "node",
    ["scripts/apply-eliza-ci-patches.mjs"],
    { stdio: "inherit" },
  );
  if (applyResult.status !== 0) {
    exitStatus = applyResult.status ?? 1;
    exitSignal = applyResult.signal;
    throw new Error("run-release-check: eliza CI patch overlay failed");
  }

  const electrobunSmokePatchCheck = spawnSync(
    "node",
    ["scripts/patch-eliza-electrobun-windows-smoke-startup.mjs"],
    { stdio: "inherit" },
  );
  if (electrobunSmokePatchCheck.status !== 0) {
    exitStatus = electrobunSmokePatchCheck.status ?? 1;
    exitSignal = electrobunSmokePatchCheck.signal;
    throw new Error(
      "run-release-check: Electrobun Windows smoke startup overlay drifted",
    );
  }

  const releaseWorkflow = fs.readFileSync(releaseWorkflowPath, "utf8");
  const missingReleaseWorkflowNeedles = releaseWorkflowNeedles.filter(
    (needle) => !releaseWorkflow.includes(needle),
  );
  if (missingReleaseWorkflowNeedles.length > 0) {
    exitStatus = 1;
    throw new Error(
      [
        "run-release-check: release workflow is missing Windows postinstall native-script guard:",
        ...missingReleaseWorkflowNeedles.map((needle) => `  - ${needle}`),
      ].join("\n"),
    );
  }

  const buildInfoResult = spawnSync(
    "node",
    ["--import", "tsx", "scripts/write-build-info.ts"],
    { stdio: "inherit" },
  );
  if (buildInfoResult.status !== 0) {
    exitStatus = buildInfoResult.status ?? 1;
    exitSignal = buildInfoResult.signal;
    throw new Error("run-release-check: build metadata generation failed");
  }

  const result = spawnSync(
    "bun",
    [
      "eliza/packages/app-core/scripts/run-node-tsx.mjs",
      "eliza/packages/app-core/scripts/release-check.ts",
    ],
    { stdio: "inherit" },
  );

  exitStatus = result.status ?? 1;
  exitSignal = result.signal;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (exitStatus === 0) {
    exitStatus = 1;
  }
} finally {
  restoreGeneratedElizaChanges(
    shouldRestoreElizaChanges,
    undefined,
    initialElizaUntrackedFiles,
  );
}

if (exitSignal) {
  process.kill(process.pid, exitSignal);
}
process.exit(exitStatus);
