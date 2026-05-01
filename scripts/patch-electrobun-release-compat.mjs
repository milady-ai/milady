#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const checkOnly = process.argv.includes("--check");

const replacements = [
  {
    relativePath:
      "eliza/packages/app-core/platforms/electrobun/src/native/agent.ts",
    description:
      "propagate the selected packaged API port to server-only child",
    from: `      const childEnv: Record<string, string> = {
        ...(process.env as Record<string, string>),
        ELIZA_API_PORT: String(apiPort),
        ELIZA_PORT: String(apiPort),
      };`,
    to: `      const childEnv: Record<string, string> = {
        ...(process.env as Record<string, string>),
        ELIZA_API_PORT: String(apiPort),
        ELIZA_PORT: String(apiPort),
        MILADY_API_PORT: String(apiPort),
        MILADY_PORT: String(apiPort),
      };`,
  },
  {
    relativePath:
      "eliza/packages/app-core/platforms/electrobun/src/native/agent.ts",
    description: "keep ELIZA_PORT for eliza start server-only mode",
    from: `      delete childEnv.ELIZA_PORT;
      delete childEnv.NODE_PATH;`,
    to: `      delete childEnv.NODE_PATH;`,
  },
  {
    relativePath:
      "eliza/packages/app-core/platforms/electrobun/src/startup-trace.ts",
    description: "read Milady startup trace env aliases",
    from: `  const sessionId =
    trimEnv(env.ELIZA_STARTUP_SESSION_ID) ??
    trimEnv(env.ELIZA_STARTUP_SESSION_ID) ??
    trimEnv(bootstrap?.session_id ?? undefined) ??
    null;
  const stateFile =
    trimEnv(env.ELIZA_STARTUP_STATE_FILE) ??
    trimEnv(env.ELIZA_STARTUP_STATE_FILE) ??
    trimEnv(bootstrap?.state_file ?? undefined) ??
    null;
  const eventsFile =
    trimEnv(env.ELIZA_STARTUP_EVENTS_FILE) ??
    trimEnv(env.ELIZA_STARTUP_EVENTS_FILE) ??
    trimEnv(bootstrap?.events_file ?? undefined) ??
    null;`,
    to: `  const sessionId =
    trimEnv(env.MILADY_STARTUP_SESSION_ID) ??
    trimEnv(env.ELIZA_STARTUP_SESSION_ID) ??
    trimEnv(bootstrap?.session_id ?? undefined) ??
    null;
  const stateFile =
    trimEnv(env.MILADY_STARTUP_STATE_FILE) ??
    trimEnv(env.ELIZA_STARTUP_STATE_FILE) ??
    trimEnv(bootstrap?.state_file ?? undefined) ??
    null;
  const eventsFile =
    trimEnv(env.MILADY_STARTUP_EVENTS_FILE) ??
    trimEnv(env.ELIZA_STARTUP_EVENTS_FILE) ??
    trimEnv(bootstrap?.events_file ?? undefined) ??
    null;`,
  },
  {
    relativePath:
      "eliza/packages/app-core/platforms/electrobun/scripts/smoke-test-windows.ps1",
    description: "export legacy startup trace state paths",
    from: `$env:ELIZA_STARTUP_SESSION_ID = $startupSessionId
$env:MILADY_STARTUP_SESSION_ID = $startupSessionId
$env:MILADY_STARTUP_STATE_FILE = $startupStateFile
$env:MILADY_STARTUP_EVENTS_FILE = $startupEventsFile`,
    to: `$env:ELIZA_STARTUP_SESSION_ID = $startupSessionId
$env:MILADY_STARTUP_SESSION_ID = $startupSessionId
$env:ELIZA_STARTUP_STATE_FILE = $startupStateFile
$env:MILADY_STARTUP_STATE_FILE = $startupStateFile
$env:ELIZA_STARTUP_EVENTS_FILE = $startupEventsFile
$env:MILADY_STARTUP_EVENTS_FILE = $startupEventsFile`,
  },
  {
    relativePath:
      "eliza/packages/app-core/platforms/electrobun/scripts/smoke-test-windows.ps1",
    description: "export branded and legacy packaged backend ports",
    from: `$env:MILADY_API_PORT = "$BackendPort"
$env:ELIZA_API_PORT = "$BackendPort"
$env:ELIZA_PORT = "$BackendPort"`,
    to: `$env:MILADY_API_PORT = "$BackendPort"
$env:MILADY_PORT = "$BackendPort"
$env:ELIZA_API_PORT = "$BackendPort"
$env:ELIZA_PORT = "$BackendPort"`,
  },
  {
    relativePath:
      "eliza/packages/app-core/platforms/electrobun/scripts/smoke-test-windows.ps1",
    description: "publish legacy AppData paths for downstream diagnostics",
    from: `  Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_APPDATA_PATH=$($env:APPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH=$($env:LOCALAPPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "PGLITE_DATA_DIR=$pgliteDataDir"`,
    to: `  Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_APPDATA_PATH=$($env:APPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "ELIZA_TEST_WINDOWS_APPDATA_PATH=$($env:APPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH=$($env:LOCALAPPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "ELIZA_TEST_WINDOWS_LOCALAPPDATA_PATH=$($env:LOCALAPPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "PGLITE_DATA_DIR=$pgliteDataDir"`,
  },
];

function patchFile({ relativePath, description, from, to }) {
  const filePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`missing ${relativePath}`);
  }

  const current = fs.readFileSync(filePath, "utf8");
  if (!current.includes(from)) {
    if (!current.includes(to)) {
      throw new Error(
        `could not find patch anchor in ${relativePath}: ${description}`,
      );
    }
    console.log(
      `[patch-electrobun-release-compat] already patched: ${description}`,
    );
    return false;
  }

  if (checkOnly) {
    console.log(
      `[patch-electrobun-release-compat] would patch: ${description}`,
    );
    return true;
  }

  fs.writeFileSync(filePath, current.replace(from, to), "utf8");
  console.log(`[patch-electrobun-release-compat] patched: ${description}`);
  return true;
}

try {
  const changedCount = replacements.filter((replacement) =>
    patchFile(replacement),
  ).length;
  console.log(
    `[patch-electrobun-release-compat] ${checkOnly ? "check complete" : "complete"} (${changedCount} change${changedCount === 1 ? "" : "s"})`,
  );
} catch (error) {
  console.error(
    `[patch-electrobun-release-compat] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
