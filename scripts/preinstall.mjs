#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  evaluateCurrentInstallEnvironment,
  formatInstallReadinessError,
  resolveInstallEnvironment,
  shouldSkipInstallPreflight,
  writeInstallLifecycleNodeShim,
} from "./lib/install-env.mjs";

const scriptFile = fileURLToPath(import.meta.url);
const __dirname = dirname(scriptFile);
const rootDir = resolve(__dirname, "..");

if (shouldSkipInstallPreflight(process.env)) {
  process.exit(0);
}

const readiness = evaluateCurrentInstallEnvironment({ rootDir });

if (!readiness.ok) {
  const installEnvironment = resolveInstallEnvironment({ rootDir });
  if (installEnvironment.ok) {
    const shimPath = writeInstallLifecycleNodeShim({
      rootDir,
      nodeExecutable: installEnvironment.node.executable,
      pythonExecutable: installEnvironment.python?.executable ?? null,
    });
    console.error(formatInstallReadinessError(readiness));
    console.error(
      `[milady-preinstall] Prepared install lifecycle Node shim: ${shimPath}`,
    );
    console.error(
      `[milady-preinstall] Dependency install scripts will use ${installEnvironment.node.version} via ${installEnvironment.node.executable}`,
    );
    process.exit(0);
  }

  console.error(formatInstallReadinessError(readiness));
  console.error(`[milady-preinstall] ${installEnvironment.error}`);
  process.exit(1);
}

if (process.env.MILADY_INSTALL_VERBOSE === "1") {
  console.log(
    `[milady-preinstall] install environment ok (${readiness.activeNode.version} via ${readiness.activeNode.executable})`,
  );
}
