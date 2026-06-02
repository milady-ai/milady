#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElizaAppCoreScript } from "./lib/resolve-eliza-app-core-script.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const scriptPath = resolveElizaAppCoreScript("run-production-build.mjs", {
  repoRoot,
});

const child = spawn(process.execPath, [scriptPath, ...process.argv.slice(2)], {
  cwd: repoRoot,
  env: {
    ...process.env,
    MILADY_REPO_ROOT: process.env.MILADY_REPO_ROOT?.trim() || repoRoot,
  },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(
    `[milady] Failed to start production build: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[milady] production build exited due to signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
