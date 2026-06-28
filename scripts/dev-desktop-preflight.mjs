#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const optionalChecks = [
  "cleanup-desktop-orphans.mjs",
  "check-eliza-git-freshness.mjs",
  "ensure-required-eliza-plugin-builds.mjs",
  "check-plugin-dist-staleness.mjs",
];

if (process.platform === "darwin") {
  const brandAssetsScript = path.join(
    repoRoot,
    "apps/app/scripts/generate-brand-assets.mjs",
  );
  if (existsSync(brandAssetsScript)) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [brandAssetsScript], {
        cwd: path.join(repoRoot, "apps/app"),
        env: process.env,
        stdio: "inherit",
      });
      child.on("error", (error) => {
        reject(
          new Error(
            `generate-brand-assets.mjs failed to spawn: ${error.message}`,
          ),
        );
      });
      child.on("exit", (code, signal) => {
        if (signal) {
          reject(
            new Error(
              `generate-brand-assets.mjs exited due to signal ${signal}`,
            ),
          );
          return;
        }
        if ((code ?? 1) !== 0) {
          reject(
            new Error(
              `generate-brand-assets.mjs exited with code ${code ?? 1}`,
            ),
          );
          return;
        }
        resolve();
      });
    });
  }
}

for (const checkName of optionalChecks) {
  const checkPath = path.join(repoRoot, "scripts", checkName);
  if (!existsSync(checkPath)) {
    console.warn(
      `[dev:desktop:preflight] optional check ${checkName} is not present; skipping.`,
    );
    continue;
  }

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [checkPath], {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", (error) => {
      reject(new Error(`${checkName} failed to spawn: ${error.message}`));
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${checkName} exited due to signal ${signal}`));
        return;
      }
      if ((code ?? 1) !== 0) {
        reject(new Error(`${checkName} exited with code ${code ?? 1}`));
        return;
      }
      resolve();
    });
  });
}
