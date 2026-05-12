#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

export const LOCAL_ELIZA_CI_OVERRIDE_PACKAGES = [
  {
    name: "@elizaos/skills",
    packageDir: "eliza/packages/skills",
    entrypoint: "dist/index.js",
  },
  {
    name: "@elizaos/plugin-signal",
    packageDir: "eliza/plugins/plugin-signal",
    entrypoint: "dist/index.js",
  },
];

function isPackageJsonWithBuildScript(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.scripts === "object" &&
    value.scripts !== null &&
    !Array.isArray(value.scripts) &&
    typeof value.scripts.build === "string"
  );
}

function readPackageJson(packageJsonPath) {
  const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (!isPackageJsonWithBuildScript(parsed)) {
    throw new Error(
      `${packageJsonPath} is missing the build script required by published-only CI.`,
    );
  }
  return parsed;
}

export async function runBunBuild(packageDir) {
  await new Promise((resolve, reject) => {
    const child = spawn("bun", ["run", "build"], {
      cwd: packageDir,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`bun run build was killed by ${signal}`));
        return;
      }
      if ((code ?? 1) !== 0) {
        reject(new Error(`bun run build exited with code ${code ?? 1}`));
        return;
      }
      resolve();
    });
  });
}

export async function buildLocalElizaCiOverrides({
  root = repoRoot,
  packages = LOCAL_ELIZA_CI_OVERRIDE_PACKAGES,
  runBuild = runBunBuild,
  log = console.log,
} = {}) {
  for (const packageInfo of packages) {
    const packageDir = path.join(root, packageInfo.packageDir);
    const packageJsonPath = path.join(packageDir, "package.json");
    const entrypointPath = path.join(packageDir, packageInfo.entrypoint);

    if (!fs.existsSync(packageJsonPath)) {
      log(
        `[local-eliza-ci-overrides] ${packageInfo.name} source is absent; using the published package installed by fallback dependencies.`,
      );
      continue;
    }

    readPackageJson(packageJsonPath);

    if (fs.existsSync(entrypointPath)) {
      log(
        `[local-eliza-ci-overrides] ${packageInfo.name} already has ${packageInfo.entrypoint}; skipping build.`,
      );
      continue;
    }

    log(
      `[local-eliza-ci-overrides] Building ${packageInfo.name} for published-only CI.`,
    );
    await runBuild(packageDir);

    if (!fs.existsSync(entrypointPath)) {
      throw new Error(
        `${packageInfo.name} build completed but did not create ${packageInfo.packageDir}/${packageInfo.entrypoint}.`,
      );
    }
  }
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  await buildLocalElizaCiOverrides();
}
