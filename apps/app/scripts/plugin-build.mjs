#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  CAPACITOR_PLUGIN_NAMES,
  NATIVE_PLUGINS_ROOT,
} from "./capacitor-plugin-names.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _appDir = path.resolve(__dirname, "..");
const pluginsDir = NATIVE_PLUGINS_ROOT;
const pluginNames = CAPACITOR_PLUGIN_NAMES;

// Skip plugin builds if explicitly disabled or if Capacitor core is missing
const skipPlugins =
  process.env.SKIP_NATIVE_PLUGINS === "1" || process.env.CI === "true";

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited due to signal ${signal}`));
        return;
      }
      if ((code ?? 1) !== 0) {
        reject(new Error(`${command} exited with code ${code ?? 1}`));
        return;
      }
      resolve();
    });
  });
}

const npmCommand = "bun";
const npmArgs = ["run", "build"];

if (skipPlugins) {
  console.log(
    "[plugins] skipping native plugin builds (CI or explicitly disabled)",
  );
  process.exit(0);
}

// Plugins have no inter-dependencies — build in parallel
await Promise.all(
  pluginNames.map(async (name) => {
    console.log(`[plugin:${name}] building...`);
    await run(npmCommand, npmArgs, path.join(pluginsDir, name));
    console.log(`[plugin:${name}] done`);
  }),
);
