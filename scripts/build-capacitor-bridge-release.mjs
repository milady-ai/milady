#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const packageDir = process.cwd();
const distDir = path.join(packageDir, "dist");
const bunExecutable = process.platform === "win32" ? "bun.exe" : "bun";

function run(args) {
  const result = spawnSync(bunExecutable, args, {
    cwd: packageDir,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${bunExecutable} ${args.join(" ")} failed`);
  }
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(path.join(distDir, "shared"), { recursive: true });
fs.mkdirSync(path.join(distDir, "android"), { recursive: true });
fs.mkdirSync(path.join(distDir, "ios"), { recursive: true });

run([
  "build",
  "src/mobile-device-bridge-bootstrap.ts",
  "--outfile",
  "dist/mobile-device-bridge-bootstrap.js",
  "--target=node",
  "--format=esm",
  "--packages=external",
]);
run([
  "build",
  "src/shared/fs-shim.ts",
  "--outfile",
  "dist/shared/fs-shim.js",
  "--target=node",
  "--format=esm",
  "--packages=external",
]);
run([
  "build",
  "src/android/bridge.ts",
  "--outfile",
  "dist/android/bridge.js",
  "--target=node",
  "--format=esm",
  "--packages=external",
]);
run([
  "build",
  "src/ios/bridge.ts",
  "--outfile",
  "dist/ios/bridge.js",
  "--target=node",
  "--format=esm",
  "--packages=external",
]);

fs.writeFileSync(
  path.join(distDir, "index.js"),
  `export async function runAndroidBridgeCli() {
  const { runAndroidBridgeCli } = await import("./android/bridge.js");
  return runAndroidBridgeCli();
}

export async function runIosBridgeCli(argv = process.argv) {
  const { runIosBridgeCli } = await import("./ios/bridge.js");
  return runIosBridgeCli(argv);
}

export {
  attachMobileDeviceBridgeToServer,
  ensureMobileDeviceBridgeInferenceHandlers,
  getMobileDeviceBridgeStatus,
  loadMobileDeviceBridgeModel,
  mobileDeviceBridge,
  unloadMobileDeviceBridgeModel,
} from "./mobile-device-bridge-bootstrap.js";

export {
  getMobileWorkspaceRoot,
  installMobileFsShim,
  isMobileFsShimInstalled,
  sandboxedPath,
} from "./shared/fs-shim.js";
`,
);

fs.writeFileSync(
  path.join(distDir, "index.d.ts"),
  `export declare function runAndroidBridgeCli(): Promise<void>;
export declare function runIosBridgeCli(argv?: string[]): Promise<void>;
export * from "./mobile-device-bridge-bootstrap.js";
export * from "./shared/fs-shim.js";
`,
);
