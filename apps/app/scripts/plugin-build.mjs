#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
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

// Drop plugins whose package.json pins them to OS platforms that don't
// include the current host — keeps the Windows build green when the team
// lands a macOS-only native plugin (e.g. macosalarm) without guarding it.
// Only filters when `platforms` is a pure OS allowlist; arrays with
// runtime targets like "node"/"browser"/"android"/"ios" are treated as
// runtime hints and still build on any host.
const OS_PLATFORMS = new Set(["darwin", "linux", "win32"]);
const buildablePluginNames = pluginNames.filter((name) => {
  const pkgPath = path.join(pluginsDir, name, "package.json");
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    return true;
  }
  const platforms = pkg?.milady?.platforms ?? pkg?.elizaos?.platforms;
  if (!Array.isArray(platforms) || platforms.length === 0) {
    return true;
  }
  const isPureOsAllowlist = platforms.every((p) => OS_PLATFORMS.has(p));
  if (!isPureOsAllowlist || platforms.includes(process.platform)) {
    return true;
  }
  console.log(
    `[plugin:${name}] skipping — declares platforms=${JSON.stringify(
      platforms,
    )}, host is ${process.platform}`,
  );
  return false;
});

// Plugins have no inter-dependencies — build in parallel
await Promise.all(
  buildablePluginNames.map(async (name) => {
    console.log(`[plugin:${name}] building...`);
    await run(npmCommand, npmArgs, path.join(pluginsDir, name));
    console.log(`[plugin:${name}] done`);
  }),
);
