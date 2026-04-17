import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFreePort } from "../test/utils/get-free-port.mjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appDir, "..", "..");
const playwrightArgs = process.argv.slice(2);

function resolvePlaywrightCommand() {
  const binaryName =
    process.platform === "win32" ? "playwright.cmd" : "playwright";
  for (const candidate of [
    path.join(appDir, "node_modules", ".bin", binaryName),
    path.join(repoRoot, "node_modules", ".bin", binaryName),
  ]) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return binaryName;
}

const env = { ...process.env };
delete env.NO_COLOR;
delete env.FORCE_COLOR;
delete env.CLICOLOR_FORCE;

if (
  playwrightArgs.includes("--config") &&
  playwrightArgs.some((value) =>
    value.includes("playwright.ui-smoke.config.ts"),
  )
) {
  if (!env.MILADY_UI_SMOKE_API_PORT) {
    const apiPort = await getFreePort();
    env.MILADY_UI_SMOKE_API_PORT = String(apiPort);
    env.MILADY_API_PORT = env.MILADY_API_PORT || String(apiPort);
  }

  if (!env.MILADY_UI_SMOKE_PORT) {
    const uiPort = await getFreePort();
    env.MILADY_UI_SMOKE_PORT = String(uiPort);
    env.MILADY_PORT = env.MILADY_PORT || String(uiPort);
  }
}

const child = spawn(resolvePlaywrightCommand(), ["test", ...playwrightArgs], {
  cwd: appDir,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
