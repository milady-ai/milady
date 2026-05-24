#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  evaluateCurrentInstallEnvironment,
  formatInstallReadinessError,
  shouldSkipInstallPreflight,
} from "./lib/install-env.mjs";

const scriptFile = fileURLToPath(import.meta.url);
const __dirname = dirname(scriptFile);
const rootDir = resolve(__dirname, "..");

if (shouldSkipInstallPreflight(process.env)) {
  process.exit(0);
}

const readiness = evaluateCurrentInstallEnvironment({ rootDir });

if (!readiness.ok) {
  console.error(formatInstallReadinessError(readiness));
  process.exit(1);
}

if (process.env.MILADY_INSTALL_VERBOSE === "1") {
  console.log(
    `[milady-preinstall] install environment ok (${readiness.activeNode.version} via ${readiness.activeNode.executable})`,
  );
}
