#!/usr/bin/env node
/**
 * One-shot iOS Simulator runner for Milady.
 *
 * Builds the agent JS bundle, overlays the Capacitor iOS project, installs
 * Pods, builds the .app for Simulator, boots the Simulator, installs the
 * .app, launches with `--console-pty`, and streams the live console.
 *
 * Steps:
 *   1. Verify Xcode + simulator runtime are present.
 *   2. Verify the GGUF first-light model is staged (unless
 *      `MILADY_SKIP_MODEL_CHECK=1`).
 *   3. `bun install` (light — only if node_modules is obviously missing).
 *   4. Build the agent JS bundle (`build:ios-jsc`).
 *   5. Build the polyfill prefix if its build script exists, and
 *      re-concatenate `polyfill-prefix + agent-bundle-ios.js` when both
 *      are present so the final bundle the native bridge loads has the
 *      polyfill on top. (The agent's `build-mobile-bundle.mjs` already
 *      does this on its own build path; we only re-stitch when the
 *      polyfill was rebuilt after.)
 *   6. Overlay the iOS Capacitor project (`run-mobile-build.mjs ios-overlay`).
 *   7. Stage the agent bundle + manifest + PGlite assets under
 *      `apps/app/ios/App/App/agent/` so Xcode picks them up as resources.
 *   8. `pod install`.
 *   9. `xcodebuild` for `iPhone 15 Pro` Simulator destination.
 *  10. `simctl boot` + open Simulator app.
 *  11. `simctl install` + `simctl launch --console-pty` (streams stdout).
 *
 * Robustness contract:
 *   - Every step fails loud with a clear `[ios-sim] step N/M ...` prefix.
 *   - Non-zero exit codes propagate with the original status code where
 *     possible.
 *   - Ctrl-C tears down `xcrun simctl launch` cleanly.
 *
 * Manual prereqs for a fresh Mac:
 *   - Xcode installed (`xcode-select --install` minimum; full Xcode for
 *     simulator).
 *   - At least one iOS Simulator runtime installed (Xcode → Settings →
 *     Platforms).
 *   - `bun install` has been run at least once at the repo root.
 *   - First-light model downloaded:
 *       bun native/ios-bun-port/models/download-first-light.sh
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const STEPS_TOTAL = 11;
let stepIndex = 0;

const SIMULATOR_DEVICE = process.env.MILADY_IOS_SIM_DEVICE ?? "iPhone 15 Pro";
const APP_BUNDLE_ID = process.env.MILADY_IOS_APP_ID ?? "com.miladyai.milady";
const XCODE_SCHEME = process.env.MILADY_IOS_SCHEME ?? "App";

const AGENT_DIR = path.join(REPO_ROOT, "eliza/packages/agent");
const AGENT_BUILD_OUT = path.join(AGENT_DIR, "dist-mobile-ios-jsc");
const POLYFILL_DIR = path.join(REPO_ROOT, "native/ios-bun-port/polyfill");
const POLYFILL_DIST = path.join(POLYFILL_DIR, "dist/polyfill-prefix.js");

const IOS_APP_DIR = path.join(REPO_ROOT, "apps/app/ios/App");
const _IOS_WORKSPACE = path.join(IOS_APP_DIR, "App.xcworkspace");
const IOS_AGENT_RESOURCE_DIR = path.join(IOS_APP_DIR, "App/agent");
const IOS_MODELS_DIR = path.join(IOS_AGENT_RESOURCE_DIR, "models");

const MODEL_FILENAME =
  process.env.MILADY_MODEL_NAME ?? "qwen2.5-0.5b-instruct-q4_k_m.gguf";

// ── Logging ─────────────────────────────────────────────────────────────

function step(label) {
  stepIndex += 1;
  console.log(`[ios-sim] [step ${stepIndex}/${STEPS_TOTAL}] ${label}`);
}

function info(msg) {
  console.log(`[ios-sim] ${msg}`);
}

function warn(msg) {
  console.warn(`[ios-sim] warn: ${msg}`);
}

function fail(msg, code = 1) {
  console.error(`[ios-sim] FAIL: ${msg}`);
  process.exit(code);
}

// ── Exec helpers ────────────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
  const cwd = opts.cwd ?? REPO_ROOT;
  const env = opts.env ?? process.env;
  const printable = `${cmd} ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`;
  info(`$ ${printable}  (cwd: ${path.relative(REPO_ROOT, cwd) || "."})`);
  const result = spawnSync(cmd, args, {
    cwd,
    env,
    stdio: opts.captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });
  if (result.error) {
    fail(`failed to spawn '${cmd}': ${result.error.message}`);
  }
  if (
    typeof result.status === "number" &&
    result.status !== 0 &&
    !opts.allowFailure
  ) {
    fail(`'${cmd}' exited ${result.status}`, result.status);
  }
  return result;
}

function runCaptured(cmd, args, opts = {}) {
  return run(cmd, args, { ...opts, captureOutput: true, allowFailure: true });
}

function exists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// ── Step bodies ─────────────────────────────────────────────────────────

function verifyXcode() {
  step("Verifying Xcode toolchain...");
  const xcrun = runCaptured("xcrun", ["--version"]);
  if ((xcrun.status ?? 1) !== 0) {
    fail(
      "Xcode command-line tools not found. Install Xcode (App Store) and run `xcode-select --install`.",
    );
  }
  const xcodebuild = runCaptured("xcodebuild", ["-version"]);
  if ((xcodebuild.status ?? 1) !== 0) {
    fail(
      "`xcodebuild` not found. Make sure full Xcode is installed (not just CLT) and run `sudo xcode-select -s /Applications/Xcode.app`.",
    );
  }
  const runtimes = runCaptured("xcrun", [
    "simctl",
    "list",
    "runtimes",
    "available",
  ]);
  const stdout = runtimes.stdout ?? "";
  if (!/iOS \d/.test(stdout)) {
    fail(
      "No iOS Simulator runtime found. Open Xcode → Settings → Platforms and install an iOS runtime.",
    );
  }
}

function verifyModel() {
  step("Verifying first-light model is staged...");
  if (process.env.MILADY_SKIP_MODEL_CHECK === "1") {
    info("MILADY_SKIP_MODEL_CHECK=1 — skipping GGUF model check.");
    return;
  }
  const modelPath = path.join(IOS_MODELS_DIR, MODEL_FILENAME);
  if (!exists(modelPath)) {
    console.error("[ios-sim] First-light model missing.");
    console.error(
      "[ios-sim] Run: bun native/ios-bun-port/models/download-first-light.sh",
    );
    console.error(
      "[ios-sim] (Or set MILADY_SKIP_MODEL_CHECK=1 to bypass for cloud-only smoke tests.)",
    );
    process.exit(1);
  }
  const size = fs.statSync(modelPath).size;
  info(
    `model present at ${path.relative(REPO_ROOT, modelPath)} (${size} bytes)`,
  );
}

function ensureWorkspaceInstalled() {
  step("Ensuring workspace dependencies are installed...");
  if (!exists(path.join(REPO_ROOT, "node_modules"))) {
    info("node_modules missing — running `bun install`.");
    run("bun", ["install"]);
  } else {
    info(
      "node_modules present — skipping `bun install` (run manually if stale).",
    );
  }
}

function buildAgentBundle() {
  step("Building agent bundle for ios-jsc...");
  run("bun", ["run", "build:ios-jsc"], { cwd: AGENT_DIR });
  const bundlePath = path.join(AGENT_BUILD_OUT, "agent-bundle-ios.js");
  if (!exists(bundlePath)) {
    fail(
      `agent bundle not found at ${bundlePath}; check eliza/packages/agent build output.`,
    );
  }
}

function buildPolyfillIfPresent() {
  step("Building iOS JSContext polyfill prefix (if present)...");
  const polyfillPkg = path.join(POLYFILL_DIR, "package.json");
  if (!exists(polyfillPkg)) {
    info("native/ios-bun-port/polyfill not found — skipping.");
    return;
  }
  run("bun", ["run", "build"], { cwd: POLYFILL_DIR });
  if (!exists(POLYFILL_DIST)) {
    warn(
      `polyfill build succeeded but dist/polyfill-prefix.js missing at ${POLYFILL_DIST}; not stitching.`,
    );
    return;
  }

  // Re-concatenate polyfill prefix + agent-bundle so the JSContext sees
  // the polyfill first. `build-mobile-bundle.mjs` already does this on
  // its own build path; we re-stitch here in case the polyfill was
  // rebuilt afterwards.
  const bundlePath = path.join(AGENT_BUILD_OUT, "agent-bundle-ios.js");
  if (!exists(bundlePath)) {
    warn(`cannot re-stitch — bundle missing at ${bundlePath}.`);
    return;
  }
  const prefix = fs.readFileSync(POLYFILL_DIST, "utf8");
  const bundle = fs.readFileSync(bundlePath, "utf8");
  const polyfillSentinel = "// @milady/ios-jsc-polyfill prefix";
  if (
    bundle.startsWith(polyfillSentinel) ||
    bundle.includes(polyfillSentinel)
  ) {
    info("polyfill prefix already present in bundle — leaving as-is.");
    return;
  }
  fs.writeFileSync(
    bundlePath,
    `${polyfillSentinel}\n${prefix}\n${bundle}`,
    "utf8",
  );
  info("stitched polyfill prefix into agent-bundle-ios.js.");
}

function overlayIos() {
  step("Overlaying iOS Capacitor project...");
  run("node", [
    "eliza/packages/app-core/scripts/run-mobile-build.mjs",
    "ios-overlay",
  ]);
}

function stageAgentResources() {
  step("Staging agent bundle + assets into iOS resources...");
  fs.mkdirSync(IOS_AGENT_RESOURCE_DIR, { recursive: true });

  // Files that always exist after `build:ios-jsc` succeeds.
  const required = ["agent-bundle-ios.js", "manifest.json"];
  // PGlite assets ship for completeness (the iOS JSC target doesn't use
  // them today but the manifest references them and the resource layout
  // should match the macOS / dev build).
  const optional = [
    "plugins-manifest.json",
    "pglite.data",
    "pglite.wasm",
    "initdb.wasm",
    "fuzzystrmatch.tar.gz",
    "vector.tar.gz",
  ];

  let copiedRequired = 0;
  for (const name of required) {
    const src = path.join(AGENT_BUILD_OUT, name);
    if (!exists(src)) {
      fail(`required agent build artifact missing: ${src}`);
    }
    fs.copyFileSync(src, path.join(IOS_AGENT_RESOURCE_DIR, name));
    copiedRequired += 1;
  }

  let copiedOptional = 0;
  for (const name of optional) {
    const src = path.join(AGENT_BUILD_OUT, name);
    if (!exists(src)) continue;
    fs.copyFileSync(src, path.join(IOS_AGENT_RESOURCE_DIR, name));
    copiedOptional += 1;
  }

  info(
    `staged ${copiedRequired} required + ${copiedOptional} optional files into ${path.relative(REPO_ROOT, IOS_AGENT_RESOURCE_DIR)}.`,
  );
}

function podInstall() {
  step("Running `pod install` (slow on first run)...");
  if (!exists(IOS_APP_DIR)) {
    fail(
      `iOS app directory missing at ${IOS_APP_DIR} — overlay step did not produce expected layout.`,
    );
  }
  // Prefer `pod` from PATH. CocoaPods is required by Capacitor 8 on iOS.
  const podCheck = runCaptured("which", ["pod"]);
  if ((podCheck.status ?? 1) !== 0) {
    fail(
      "`pod` not found. Install CocoaPods: `sudo gem install cocoapods` (or `brew install cocoapods`).",
    );
  }
  run("pod", ["install"], { cwd: IOS_APP_DIR });
}

function xcodebuildSimulator() {
  step(`Building app for Simulator (${SIMULATOR_DEVICE})...`);
  run(
    "xcodebuild",
    [
      "-workspace",
      "App.xcworkspace",
      "-scheme",
      XCODE_SCHEME,
      "-configuration",
      "Debug",
      "-destination",
      `platform=iOS Simulator,name=${SIMULATOR_DEVICE},OS=latest`,
      "CODE_SIGNING_ALLOWED=NO",
      "build",
    ],
    { cwd: IOS_APP_DIR },
  );
}

function bootSimulator() {
  step(`Booting Simulator (${SIMULATOR_DEVICE})...`);
  // `simctl boot` returns nonzero if already booted — that's fine.
  runCaptured("xcrun", ["simctl", "boot", SIMULATOR_DEVICE]);
  // Bring the Simulator app forward so the booted device is visible.
  runCaptured("open", ["-a", "Simulator"]);
}

function findAppBundle() {
  // Look in DerivedData for the most recent `App.app` under
  // `Debug-iphonesimulator`. Filter by the configured scheme.
  const home = process.env.HOME ?? "";
  if (!home) return null;
  const derivedDataRoot = path.join(
    home,
    "Library/Developer/Xcode/DerivedData",
  );
  if (!exists(derivedDataRoot)) return null;

  const candidates = [];
  for (const entry of fs.readdirSync(derivedDataRoot)) {
    if (!entry.startsWith(`${XCODE_SCHEME}-`)) continue;
    const appPath = path.join(
      derivedDataRoot,
      entry,
      "Build/Products/Debug-iphonesimulator",
      `${XCODE_SCHEME}.app`,
    );
    if (exists(appPath)) {
      const mtime = fs.statSync(appPath).mtimeMs;
      candidates.push({ path: appPath, mtime });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].path;
}

function installApp() {
  step("Installing built .app into Simulator...");
  const appPath = findAppBundle();
  if (!appPath) {
    fail(
      `could not find ${XCODE_SCHEME}.app under ~/Library/Developer/Xcode/DerivedData — did xcodebuild succeed?`,
    );
  }
  info(`installing ${path.relative(process.env.HOME ?? "", appPath)}`);
  run("xcrun", ["simctl", "install", "booted", appPath]);
}

function launchAppStreaming() {
  step("Launching app with live console (Ctrl-C to detach)...");
  const child = spawn(
    "xcrun",
    [
      "simctl",
      "launch",
      "--console-pty",
      "--terminate-running-process",
      "booted",
      APP_BUNDLE_ID,
    ],
    { stdio: "inherit" },
  );

  const onSignal = (signal) => {
    info(`received ${signal} — terminating launch session`);
    try {
      child.kill(signal);
    } catch {
      // best effort
    }
    runCaptured("xcrun", ["simctl", "terminate", "booted", APP_BUNDLE_ID]);
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));

  child.on("exit", (code, signal) => {
    if (signal) {
      info(`launch session ended via ${signal}`);
      process.exit(0);
    }
    process.exit(code ?? 0);
  });
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  if (process.platform !== "darwin") {
    fail("iOS Simulator runs on macOS only.");
  }

  verifyXcode();
  verifyModel();
  ensureWorkspaceInstalled();
  buildAgentBundle();
  buildPolyfillIfPresent();
  overlayIos();
  stageAgentResources();
  podInstall();
  xcodebuildSimulator();
  bootSimulator();
  installApp();
  launchAppStreaming();
}

main().catch((err) => {
  fail(err instanceof Error ? (err.stack ?? err.message) : String(err));
});
