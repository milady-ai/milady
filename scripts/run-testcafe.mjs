#!/usr/bin/env node
/**
 * TestCafe runner — auto-detects an available browser and runs the UI E2E suite.
 *
 * Usage:
 *   bun run test:ui:testcafe
 *   bun run test:ui:testcafe -- opera
 *   bun run test:ui:testcafe -- --spawn-dev
 *   bun run test:ui:testcafe -- --fixture apps/app/test/testcafe/packaged-hash.testcafe.js
 *
 * Env:
 *   MILADY_TESTCAFE_SPAWN_DEV=1 — start `bun run dev` if :2138 is closed (also --spawn-dev)
 *   MILADY_TESTCAFE_FIXTURE=path — default smoke suite if unset
 *
 * Requires UI on localhost:2138 unless --spawn-dev (or dev already running).
 *
 * Browser pick: `BROWSER_DETECTION_ORDER` uses **macOS .app bundle paths** only.
 * On Linux and Windows no path matches, so detection falls through to
 * `bunx testcafe --list-browsers` and the first preferred name (chrome, opera, …).
 */
import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";

const DEFAULT_FIXTURE = "apps/app/test/testcafe/smoke.testcafe.js";

/** macOS-only fast path; other OSes use `--list-browsers` (see file header). */
const BROWSER_DETECTION_ORDER = [
  { name: "chrome", paths: ["/Applications/Google Chrome.app"] },
  {
    name: "opera",
    paths: ["/Applications/Opera GX.app", "/Applications/Opera.app"],
  },
  { name: "firefox", paths: ["/Applications/Firefox.app"] },
  {
    name: "edge",
    paths: ["/Applications/Microsoft Edge.app"],
  },
  { name: "safari", paths: ["/Applications/Safari.app"] },
];

function portOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

function waitForPort(port, timeoutMs, host = "127.0.0.1") {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = async () => {
      if (Date.now() > deadline) {
        reject(new Error(`Timeout waiting for ${host}:${port}`));
        return;
      }
      if (await portOpen(port, host)) resolve();
      else setTimeout(poll, 500);
    };
    void poll();
  });
}

function parseArgs(argv) {
  let spawnDev =
    process.env.MILADY_TESTCAFE_SPAWN_DEV === "1" ||
    process.env.MILADY_TESTCAFE_SPAWN_DEV === "true";
  let fixture = process.env.MILADY_TESTCAFE_FIXTURE || DEFAULT_FIXTURE;
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--spawn-dev") spawnDev = true;
    else if (a === "--fixture" && argv[i + 1]) fixture = argv[++i];
    else if (a.startsWith("--fixture=")) fixture = a.slice("--fixture=".length);
    else if (a === "--") continue;
    else positional.push(a);
  }

  return { spawnDev, fixture, browser: positional[0] ?? null };
}

function detectBrowserSync() {
  for (const browser of BROWSER_DETECTION_ORDER) {
    for (const p of browser.paths) {
      if (existsSync(p)) return browser.name;
    }
  }

  try {
    const result = execSync("bunx testcafe --list-browsers", {
      encoding: "utf8",
      timeout: 10000,
    });
    const browsers = result
      .trim()
      .split("\n")
      .map((b) => b.trim())
      .filter(Boolean);

    const preferred = [
      "chrome",
      "chromium",
      "opera",
      "edge",
      "firefox",
      "safari",
    ];
    for (const pref of preferred) {
      const match = browsers.find((b) => b.toLowerCase().includes(pref));
      if (match) return match;
    }

    if (browsers.length > 0) return browsers[0];
  } catch {
    // --list-browsers failed
  }

  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  const { spawnDev, fixture, browser: explicitBrowser } = parseArgs(argv);
  const browser = explicitBrowser || detectBrowserSync();

  if (!browser) {
    console.error(
      "[testcafe] No supported browser found. Install Chrome, Opera GX, Firefox, Edge, or Safari.",
    );
    process.exit(1);
  }

  let devChild = null;
  if (spawnDev) {
    const uiPort = Number.parseInt(process.env.MILADY_PORT ?? "2138", 10);
    if (!(await portOpen(uiPort))) {
      console.log(
        `[testcafe] Port ${uiPort} closed — spawning ELIZA_DEV_ONCHAIN=0 bun run dev …`,
      );
      devChild = spawn("bun", ["run", "dev"], {
        cwd: process.cwd(),
        env: { ...process.env, ELIZA_DEV_ONCHAIN: "0" },
        stdio: "inherit",
        detached: false,
      });
      try {
        await waitForPort(uiPort, 180_000);
        console.log(`[testcafe] Dev server ready on port ${uiPort}.`);
      } catch (e) {
        console.error("[testcafe]", e instanceof Error ? e.message : e);
        devChild.kill("SIGTERM");
        process.exit(1);
      }
    }
  }

  const cleanup = () => {
    if (devChild && !devChild.killed) {
      devChild.kill("SIGTERM");
    }
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  console.log(`[testcafe] Using browser: ${browser}`);
  console.log(`[testcafe] Fixture: ${fixture}`);
  console.log();

  const result = spawnSync(
    "bunx",
    ["testcafe", browser, fixture, "--disable-screenshots"],
    {
      stdio: "inherit",
      cwd: process.cwd(),
    },
  );

  cleanup();
  process.exit(result.status ?? 1);
}

await main();
