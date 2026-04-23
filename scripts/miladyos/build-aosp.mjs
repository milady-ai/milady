#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { main as syncToAospMain } from "./sync-to-aosp.mjs";
import { main as validateMain } from "./validate.mjs";

const PRODUCT_LUNCH = "milady_cf_x86_64_phone-userdebug";
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

export function parseArgs(argv) {
  const args = {
    aospRoot: null,
    jobs: os.cpus().length,
    sourceVendor: null,
    skipBuild: false,
    launch: false,
    bootValidate: false,
  };

  const readFlagValue = (flag, index) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--aosp-root") {
      args.aospRoot = path.resolve(readFlagValue(arg, i));
      i += 1;
    } else if (arg === "--jobs" || arg === "-j") {
      args.jobs = Number.parseInt(readFlagValue(arg, i), 10);
      i += 1;
    } else if (arg === "--source-vendor") {
      args.sourceVendor = path.resolve(readFlagValue(arg, i));
      i += 1;
    } else if (arg === "--skip-build") {
      args.skipBuild = true;
    } else if (arg === "--launch") {
      args.launch = true;
    } else if (arg === "--boot-validate") {
      args.bootValidate = true;
    } else if (arg === "-h" || arg === "--help") {
      console.log(
        "Usage: node scripts/miladyos/build-aosp.mjs --aosp-root <AOSP_ROOT> [--source-vendor <VENDOR_DIR>] [--jobs <N>] [--skip-build] [--launch] [--boot-validate]",
      );
      process.exit(0);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    } else if (!args.aospRoot) {
      args.aospRoot = path.resolve(arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.aospRoot) {
    throw new Error("--aosp-root is required");
  }
  if (!Number.isFinite(args.jobs) || args.jobs <= 0) {
    throw new Error("--jobs must be a positive integer");
  }
  return args;
}

function assertLinuxBuilder() {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error(
      "MiladyOS AOSP/Cuttlefish builds require a Linux x86_64 builder with KVM.",
    );
  }
  if (!fs.existsSync("/dev/kvm")) {
    throw new Error("MiladyOS Cuttlefish launch requires /dev/kvm.");
  }
}

function assertAospRoot(aospRoot) {
  const envsetup = path.join(aospRoot, "build", "envsetup.sh");
  if (!fs.existsSync(envsetup)) {
    throw new Error(`${aospRoot} is missing build/envsetup.sh`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    throw new Error(`${command} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited with code ${result.status}`,
    );
  }
}

function runAospBuild(aospRoot, jobs) {
  run(
    "bash",
    [
      "-lc",
      `source build/envsetup.sh && lunch ${PRODUCT_LUNCH} && m -j${jobs}`,
    ],
    { cwd: aospRoot },
  );
}

function launchCuttlefish(aospRoot) {
  run(
    "bash",
    [
      "-lc",
      `source build/envsetup.sh && lunch ${PRODUCT_LUNCH} && launch_cvd --daemon`,
    ],
    { cwd: aospRoot },
  );
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  assertLinuxBuilder();
  assertAospRoot(args.aospRoot);

  const syncArgs = args.sourceVendor
    ? ["--source-vendor", args.sourceVendor, args.aospRoot]
    : [args.aospRoot];
  await syncToAospMain(syncArgs);

  const validateArgs = args.sourceVendor
    ? ["--vendor-dir", args.sourceVendor, "--aosp-root", args.aospRoot]
    : ["--aosp-root", args.aospRoot];
  await validateMain(validateArgs);

  if (!args.skipBuild) {
    runAospBuild(args.aospRoot, args.jobs);
  }

  if (args.launch) {
    launchCuttlefish(args.aospRoot);
  }

  if (args.bootValidate) {
    run("node", [path.join(here, "boot-validate.mjs")], { cwd: repoRoot });
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  await main();
}
