#!/usr/bin/env node
/**
 * dev:desktop — orchestrates Milady desktop local development (Vite, API, Electrobun).
 *
 * ## Why orchestrate instead of "just run electrbun"?
 * Electrobun needs a renderer URL, usually the dashboard API, and (in dev) repo-root `dist/`
 * for the embedded runtime. One script keeps ports and env vars aligned and implements a
 * single shutdown policy so the terminal does not hang with stray children.
 *
 * ## Startup phases
 * 1. **Renderer production build** — Runs `vite build` only when `viteRendererBuildNeeded()`
 *    says `apps/app/dist` is missing or older than sources (cheap mtime heuristic). Override:
 *    `--force-renderer` or `MILADY_DESKTOP_RENDERER_BUILD=always`. **Why skip:** redundant
 *    production builds on every restart are slow; watch mode users get HMR from `vite dev`.
 * 2. **Root bundle** — `tsdown` at repo root if `dist/entry.js` missing (Electrobun milady-dist).
 * 3. **Long-lived children** (see `launch()`):
 *    - **API** — `bun --watch dev-server` unless `--no-api`.
 *    - **Watch + default** — Vite **dev** server + `MILADY_RENDERER_URL` for Electrobun (HMR).
 *      Stale dep chunks: `MILADY_VITE_FORCE=1` (passes `vite --force`, same as dev-ui).
 *    - **Watch + `MILADY_DESKTOP_VITE_BUILD_WATCH=1`** — legacy `vite build --watch`
 *      (Rollup re-emits large chunks each save). **Why separate flag:** production watch is
 *      intentionally opt-in because it is much slower than the dev server on big graphs.
 *    - **Electrobun** — `bun run dev` in `apps/app/electrobun`.
 *
 * ## Port allocation (`launch()`) — WHY
 * Before spawning API / Vite / Electrobun, `allocateFirstFreeLoopbackPort()` from
 * `scripts/lib/allocate-loopback-port.mjs` resolves **MILADY_API_PORT** (default
 * 31337) and, in Vite dev mode, **MILADY_PORT** (default 2138) if something else
 * already listens. **Why:** every child must agree on the same numbers; Vite's
 * proxy is fixed at config load time, so "API picks a port later" desyncs the UI.
 *
 * ## Signals (Unix) — why `detached: true` on children
 * TTY Ctrl-C is sent to the **foreground process group**. Non-detached children share that
 * group, so Electrobun could consume the first SIGINT while Vite/API stayed up; the parent
 * stayed alive on open stdio pipes. **Detached** puts services in their own session so this
 * process alone receives Ctrl-C and runs one coordinated teardown (SIGTERM → brief grace →
 * SIGKILL). Second Ctrl-C force-exits if you are stuck.
 *
 * ## Quit from the app
 * When Electrobun exits (user chose Quit), siblings would otherwise keep the orchestrator
 * alive. We detect electrbun's `exit` and stop Vite/API the same way as signal shutdown.
 *
 * Docs: docs/apps/desktop-local-development.md
 *
 * ## Observability (IDEs / agents) — WHY
 *
 * This script sets env so the Milady API and Electrobun expose **machine-readable** hooks:
 * - Aggregated child log file + `MILADY_DESKTOP_DEV_LOG_PATH` → `GET /api/dev/console-log` (loopback tail).
 * - Screenshot token + upstream URL → `GET /api/dev/cursor-screenshot` on the API (proxies Electrobun).
 * **Why:** multiple processes (Vite, API, Electrobun) are opaque to tools that cannot see the native
 *   window; loopback + optional token bounds exposure vs. convenience. Defaults are **on** so agents
 *   and humans debugging together get signal; opt-out via `MILADY_DESKTOP_DEV_LOG=0` and
 *   `MILADY_DESKTOP_SCREENSHOT_SERVER=0`.
 */

import { execSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveDesktopApiPort,
  resolveDesktopUiPort,
} from "../packages/shared/src/runtime-env.ts";
import { allocateFirstFreeLoopbackPort } from "./lib/allocate-loopback-port.mjs";
import { signalSpawnedProcessTree } from "./lib/kill-process-tree.mjs";
import { killUiListenPort } from "./lib/kill-ui-listen-port.mjs";
import { viteRendererBuildNeeded } from "./lib/vite-renderer-dist-stale.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const appDir = path.join(repoRoot, "apps/app");
const electrobunDir = path.join(appDir, "electrobun");
const skipApi = process.argv.includes("--no-api");
const forceRenderer =
  process.argv.includes("--force-renderer") ||
  process.env.MILADY_DESKTOP_RENDERER_BUILD === "always" ||
  process.env.MILADY_DESKTOP_RENDERER_BUILD === "1";
const viteWatch = process.env.MILADY_DESKTOP_VITE_WATCH === "1";
const viteDepForce =
  process.env.MILADY_VITE_FORCE === "1" || process.env.ELIZA_VITE_FORCE === "1";
/** Legacy: Rollup `vite build --watch` (tens of seconds per edit on large graphs). */
const viteRollupWatch =
  viteWatch && process.env.MILADY_DESKTOP_VITE_BUILD_WATCH === "1";
/** Default when VITE_WATCH: Vite dev server + Electrobun MILADY_RENDERER_URL (fast HMR). */
const viteDevServer = viteWatch && !viteRollupWatch;
/** On by default for `dev:desktop` / `dev:desktop:watch`; set to 0/false/no/off to disable. */
const screenshotServerOptOut = (() => {
  const v = process.env.MILADY_DESKTOP_SCREENSHOT_SERVER?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "no" || v === "off";
})();
const screenshotServerEnabled = !screenshotServerOptOut;
const screenshotPort = process.env.MILADY_SCREENSHOT_SERVER_PORT || "31339";
const screenshotToken = screenshotServerEnabled
  ? randomBytes(24).toString("hex")
  : "";
const screenshotEnvElectrobun = screenshotServerEnabled
  ? {
      MILADY_DESKTOP_SCREENSHOT_SERVER: "1",
      MILADY_SCREENSHOT_SERVER_PORT: screenshotPort,
      MILADY_SCREENSHOT_SERVER_TOKEN: screenshotToken,
    }
  : {};
const screenshotEnvApi = screenshotServerEnabled
  ? {
      MILADY_ELECTROBUN_SCREENSHOT_URL: `http://127.0.0.1:${screenshotPort}`,
      MILADY_SCREENSHOT_SERVER_TOKEN: screenshotToken,
    }
  : {};

/** On by default for dev-platform; set MILADY_DESKTOP_DEV_LOG=0 to disable file + API tail. */
const desktopDevLogOptOut = (() => {
  const v = process.env.MILADY_DESKTOP_DEV_LOG?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "no" || v === "off";
})();
const desktopDevLogPath = desktopDevLogOptOut
  ? null
  : path.resolve(repoRoot, ".milady", "desktop-dev-console.log");

const needRendererBuild =
  forceRenderer || viteRendererBuildNeeded(appDir, repoRoot);

if (needRendererBuild) {
  console.log("\n[eliza] Building renderer (vite build)…");
  execSync("bun run vite build", { cwd: appDir, stdio: "inherit" });
  console.log("[eliza] Renderer ready.\n");
} else {
  console.log(
    "\n[eliza] Skipping vite build — apps/app/dist is up to date.\n" +
      "  Force: --force-renderer or MILADY_DESKTOP_RENDERER_BUILD=always\n",
  );
}

const rootDistEntry = path.join(repoRoot, "dist", "entry.js");
if (!existsSync(rootDistEntry)) {
  console.log(
    "\n[eliza] Building root bundle (tsdown) for Electrobun milady-dist…\n",
  );
  execSync("bunx tsdown", { cwd: repoRoot, stdio: "inherit" });
  const distPkg = path.join(repoRoot, "dist", "package.json");
  if (!existsSync(distPkg)) {
    mkdirSync(path.dirname(distPkg), { recursive: true });
    writeFileSync(distPkg, `${JSON.stringify({ type: "module" })}\n`);
  }
}

function waitForPort(port, { timeout = 120_000, interval = 400 } = {}) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    function attempt() {
      if (Date.now() > deadline) {
        reject(
          new Error(
            `Timed out waiting for port ${port} after ${timeout / 1000}s`,
          ),
        );
        return;
      }
      const socket = createConnection({ port, host: "127.0.0.1" });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        setTimeout(attempt, interval);
      });
    }
    attempt();
  });
}

const children = [];

/** First Ctrl-C starts graceful shutdown; second exits immediately (pipes keep the process alive until then). */
let shuttingDown = false;

const namesForLog = [];
if (!skipApi) namesForLog.push("api");
if (viteDevServer) namesForLog.push("vite");
if (viteRollupWatch) namesForLog.push("vite");
namesForLog.push("electrobun");
const PREFIX_PAD = Math.max(...namesForLog.map((n) => n.length));

function prefixStream(name, stream) {
  const prefix = `[${name.padEnd(PREFIX_PAD)}]`;
  stream.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.trim()) {
        const row = `${prefix} ${line}\n`;
        process.stdout.write(row);
        if (desktopDevLogPath) {
          try {
            appendFileSync(desktopDevLogPath, row, "utf8");
          } catch {
            /* ignore disk errors — console remains primary */
          }
        }
      }
    }
  });
}

function pushChild(name, cmd, args, cwd, extraEnv = {}) {
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...extraEnv, FORCE_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    // Without this, macOS/Linux deliver Ctrl-C to the whole process group; Electrobun
    // then handles SIGINT ("press Ctrl+C again…") while Vite/API keep this parent alive.
    ...(process.platform !== "win32" ? { detached: true } : {}),
  });
  if (child.stdout) prefixStream(name, child.stdout);
  if (child.stderr) prefixStream(name, child.stderr);
  child.on("exit", (code, signal) => {
    const reason = signal ? `signal ${signal}` : `exit ${code}`;
    console.log(`[${name}] stopped (${reason})`);
    if (name === "electrobun" && !shuttingDown) {
      const exitCode = signal ? 1 : (code ?? 0);
      shutdownDesktopDev({
        exitCode,
        message:
          "\n[eliza] Electrobun exited — stopping Vite/API and closing dev session.",
      });
    }
  });
  children.push(child);
  return child;
}

async function launch() {
  const preferredApi = resolveDesktopApiPort(process.env);
  const resolvedApiPort = await allocateFirstFreeLoopbackPort(preferredApi);
  if (resolvedApiPort !== preferredApi) {
    console.log(
      `[eliza] API port ${preferredApi} in use — using ${resolvedApiPort} (Vite proxy + Electrobun env updated)`,
    );
  }
  const apiPort = String(resolvedApiPort);

  const preferredUi = resolveDesktopUiPort(process.env);
  let uiDevPort = preferredUi;
  if (viteDevServer) {
    uiDevPort = await allocateFirstFreeLoopbackPort(preferredUi);
    if (uiDevPort !== preferredUi) {
      console.log(
        `[eliza] UI port ${preferredUi} in use — Vite dev server using ${uiDevPort}`,
      );
    }
  }

  const rendererUrlForShell = viteDevServer
    ? `http://127.0.0.1:${uiDevPort}/`
    : "";

  if (desktopDevLogPath) {
    mkdirSync(path.dirname(desktopDevLogPath), { recursive: true });
    writeFileSync(
      desktopDevLogPath,
      `--- milady desktop dev ${new Date().toISOString()} ---\n`,
      "utf8",
    );
  }

  if (viteDevServer) {
    killUiListenPort(uiDevPort);
    console.log(
      "\n[eliza] Vite dev server (HMR) for desktop — Electrobun loads MILADY_RENDERER_URL.\n" +
        `    (Slow Rollup watch: MILADY_DESKTOP_VITE_BUILD_WATCH=1 with MILADY_DESKTOP_VITE_WATCH=1)\n`,
    );
    if (viteDepForce) {
      console.log(
        "[eliza] Vite --force (MILADY_VITE_FORCE=1): re-optimizing dependencies.\n",
      );
    }
    pushChild(
      "vite",
      "bun",
      viteDepForce ? ["run", "vite", "--", "--force"] : ["run", "vite"],
      appDir,
      {
        NODE_ENV: "development",
        MILADY_PORT: String(uiDevPort),
        MILADY_API_PORT: apiPort,
        ELIZA_API_PORT: apiPort,
        ELIZA_PORT: apiPort,
        ELIZA_NAMESPACE: process.env.ELIZA_NAMESPACE ?? "milady",
      },
    );
    await waitForPort(uiDevPort);
    console.log(`[eliza] Vite ready on ${rendererUrlForShell}\n`);
  }

  const serviceLine = namesForLog.join(", ");
  console.log(
    `Milady desktop dev${skipApi ? " (no API)" : ""}\n` +
      `  Services: ${serviceLine}\n`,
  );
  if (screenshotServerEnabled && !skipApi) {
    console.log(
      "[eliza] Screenshot server for Cursor/agents: enabled\n" +
        `  GET http://127.0.0.1:${apiPort}/api/dev/cursor-screenshot  (PNG, loopback; proxies Electrobun on :${screenshotPort})\n`,
    );
  }
  if (desktopDevLogPath && !skipApi) {
    console.log(
      "[eliza] Dev console log (aggregated child output)\n" +
        `  file: ${desktopDevLogPath}\n` +
        `  GET http://127.0.0.1:${apiPort}/api/dev/console-log  (tail, loopback; ?maxLines=&maxBytes=)\n`,
    );
  } else if (desktopDevLogPath && skipApi) {
    console.log(
      `[eliza] Dev console log file: ${desktopDevLogPath}  (no API proxy — started with --no-api)\n`,
    );
  }

  if (!skipApi) {
    pushChild(
      "api",
      "bun",
      ["--watch", "packages/app-core/src/runtime/dev-server.ts"],
      repoRoot,
      {
        NODE_ENV: "development",
        ELIZA_PORT: apiPort,
        ELIZA_API_PORT: apiPort,
        ELIZA_HEADLESS: "1",
        MILADY_API_PORT: apiPort,
        MILADY_PORT: String(uiDevPort),
        ...(rendererUrlForShell
          ? { MILADY_RENDERER_URL: rendererUrlForShell }
          : {}),
        MILADY_DESKTOP_API_BASE: `http://127.0.0.1:${apiPort}`,
        ...screenshotEnvApi,
        ...(desktopDevLogPath
          ? { MILADY_DESKTOP_DEV_LOG_PATH: desktopDevLogPath }
          : {}),
      },
    );
  }

  if (viteRollupWatch) {
    pushChild("vite", "bun", ["run", "vite", "build", "--watch"], appDir, {
      MILADY_DESKTOP_VITE_FAST_DIST: "1",
    });
  }

  pushChild("electrobun", "bun", ["run", "dev"], electrobunDir, {
    NODE_ENV: "development",
    ELECTROBUN_SKIP_CODESIGN: "1",
    ...(rendererUrlForShell
      ? { MILADY_RENDERER_URL: rendererUrlForShell }
      : {}),
    ...(skipApi
      ? {}
      : {
          MILADY_API_PORT: apiPort,
          ELIZA_API_PORT: apiPort,
          ELIZA_PORT: apiPort,
          MILADY_DESKTOP_API_BASE: `http://127.0.0.1:${apiPort}`,
        }),
    ...screenshotEnvElectrobun,
  });
}

/**
 * SIGTERM still-running children, wait for `exit` (or force SIGKILL), then `process.exit`.
 *
 * Skips PIDs that already exited so we do not signal stale trees after app Quit.
 * `checkAllExited` + short timeout **why:** piped stdio keeps the event loop alive until
 * every child is gone; exiting early avoids staring at a hung terminal after children die.
 */
function shutdownDesktopDev({
  exitCode = 0,
  message = "\n[eliza] Shutting down desktop dev environment...",
} = {}) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(message);

  let exitScheduled = false;
  const finish = () => {
    if (exitScheduled) return;
    exitScheduled = true;
    process.exit(exitCode);
  };

  const checkAllExited = () => {
    const anyRunning = children.some(
      (c) => c.exitCode === null && c.signalCode === null,
    );
    if (!anyRunning) {
      finish();
    }
  };

  for (const child of children) {
    child.once("exit", checkAllExited);
    child.once("error", checkAllExited);
    if (child.exitCode === null && child.signalCode === null) {
      signalSpawnedProcessTree(child, "SIGTERM");
    }
  }
  checkAllExited();

  setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        signalSpawnedProcessTree(child, "SIGKILL");
      }
    }
    finish();
  }, 1500).unref();
}

function cleanup() {
  if (shuttingDown) {
    console.log("\n[eliza] Force exit.");
    process.exit(1);
    return;
  }
  shutdownDesktopDev({
    exitCode: 0,
    message: "\n[eliza] Shutting down desktop dev environment...",
  });
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
if (process.platform !== "win32") {
  process.on("SIGHUP", cleanup);
}

launch().catch((err) => {
  console.error("[eliza] dev-platform failed:", err);
  for (const child of children) {
    signalSpawnedProcessTree(child, "SIGKILL");
  }
  process.exit(1);
});
