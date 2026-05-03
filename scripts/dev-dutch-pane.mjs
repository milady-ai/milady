#!/usr/bin/env node

/**
 * Milady dev dashboard pane runner — called by dev-dutch.mjs, one instance per pane.
 *
 * Args:  api | electrobun | vite | vite-watch
 *
 * Reads .env.dutch.json (written by dev-dutch.mjs) for resolved ports.
 * Pretty-prints service output: dims noise, highlights errors/warnings/ready lines,
 * and emits OSC 8 clickable hyperlinks for "listening on http://..." URLs.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const service = process.argv[2];
const VALID = ["api", "electrobun", "vite", "vite-watch"];
if (!VALID.includes(service)) {
  console.error(`Usage: dev-dutch-pane.mjs <${VALID.join("|")}>`);
  process.exit(1);
}

// ── Read shared env ───────────────────────────────────────────────────────────
let cfg = { apiPort: 31337, uiPort: 2138, bunExe: "bun", viteWatch: false };
const envFile = path.join(root, ".env.dutch.json");
if (existsSync(envFile)) {
  try {
    cfg = { ...cfg, ...JSON.parse(readFileSync(envFile, "utf8")) };
  } catch {
    /* use defaults */
  }
}
const { apiPort, uiPort, bunExe: BUN, viteWatch } = cfg;

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const A = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

function osc8(url, text) {
  return `\x1b]8;;${url}\x1b\\${A.cyan}${A.bold}${text}${A.reset}\x1b]8;;\x1b\\`;
}

// ── Service config ────────────────────────────────────────────────────────────
const electrobunDir = path.join(
  root,
  "eliza/packages/app-core/platforms/electrobun",
);
const appDir = existsSync(path.join(root, "apps/app"))
  ? path.join(root, "apps/app")
  : path.join(root, "eliza/apps/app");

const NODE_PATH = [path.join(root, "node_modules"), process.env.NODE_PATH]
  .filter(Boolean)
  .join(path.delimiter);

const SHARED_ENV = {
  ELIZA_NAMESPACE: process.env.ELIZA_NAMESPACE || "milady",
  FORCE_COLOR: "1",
  NODE_PATH,
};

const CONFIGS = {
  api: {
    label: `API`,
    port: apiPort,
    color: A.green,
    cmd: BUN,
    args: ["eliza/packages/app-core/src/runtime/dev-server.ts"],
    cwd: root,
    env: {
      ...SHARED_ENV,
      NODE_ENV: "development",
      ELIZA_API_PORT: String(apiPort),
      ELIZA_PORT: String(uiPort),
      ELIZA_UI_PORT: String(uiPort),
      ELIZA_HEADLESS: "1",
      ELIZA_DESKTOP_API_BASE: `http://127.0.0.1:${apiPort}`,
      ...(viteWatch
        ? { ELIZA_RENDERER_URL: `http://127.0.0.1:${uiPort}/` }
        : {}),
    },
  },
  electrobun: {
    label: "ELECTROBUN",
    port: null,
    color: A.magenta,
    cmd: BUN,
    args: ["run", "dev"],
    cwd: electrobunDir,
    env: {
      ...SHARED_ENV,
      NODE_ENV: "development",
      ELECTROBUN_SKIP_CODESIGN: "1",
      ELIZA_API_PORT: String(apiPort),
      ELIZA_UI_PORT: String(uiPort),
      ELIZA_DESKTOP_API_BASE: `http://127.0.0.1:${apiPort}`,
      ...(viteWatch
        ? { ELIZA_RENDERER_URL: `http://127.0.0.1:${uiPort}/` }
        : {}),
    },
  },
  vite: {
    label: "VITE",
    port: uiPort,
    color: A.cyan,
    cmd: BUN,
    args: ["run", "vite"],
    cwd: appDir,
    env: {
      ...SHARED_ENV,
      NODE_ENV: "development",
      ELIZA_PORT: String(uiPort),
      ELIZA_UI_PORT: String(uiPort),
      ELIZA_API_PORT: String(apiPort),
      ELIZA_VITE_LOOPBACK_ORIGIN: "1",
    },
  },
  "vite-watch": {
    label: "VITE (HMR)",
    port: uiPort,
    color: A.cyan,
    cmd: BUN,
    args: ["run", "vite"],
    cwd: appDir,
    env: {
      ...SHARED_ENV,
      NODE_ENV: "development",
      ELIZA_PORT: String(uiPort),
      ELIZA_UI_PORT: String(uiPort),
      ELIZA_API_PORT: String(apiPort),
      ELIZA_VITE_LOOPBACK_ORIGIN: "1",
    },
  },
};

const config = CONFIGS[service];
const { label, port, color } = config;

// ── Header ────────────────────────────────────────────────────────────────────
process.stdout.write("\x1bc"); // clear

const portStr = port ? ` :${port}` : "";
const title = `  ${label}${portStr}  `;
const bar = "─".repeat(title.length);
console.log(`${color}${A.bold}┌${bar}┐`);
console.log(`│${title}│`);
console.log(`└${bar}┘${A.reset}`);
console.log(
  `${A.gray}cwd: ${config.cwd}\ncmd: ${config.cmd} ${config.args.join(" ")}${A.reset}\n`,
);

// ── Log filtering / colorising ────────────────────────────────────────────────
// Returns null to drop the line entirely.
function colorLine(raw) {
  // strip existing ANSI so our checks work on plain text, then re-emit raw
  const ANSI_ESC = "";
  const plain = raw
    .replace(new RegExp(`${ANSI_ESC}\\[[0-9;]*m`, "g"), "")
    .replace(new RegExp(`${ANSI_ESC}\\].*?${ANSI_ESC}\\\\`, "g"), "");

  // ── drop: HTTP access log lines (any method + path + status) ──
  if (
    /\b(get|post|put|patch|delete|head|options)\s+\/\S*\s+\d{3}\b/.test(plain)
  )
    return null;
  // Also catch logger-formatted variants: "GET /path" even without status code
  if (
    /\b(get|post|put|patch|delete)\s+\/[^\s"]*/.test(plain) &&
    /\b(info|debug|log)\b/.test(l)
  )
    return null;

  // ── drop: other high-frequency noise ──
  if (/\[vite\].*ping/.test(l)) return null;
  // rcedit icon-embed failure is a cosmetic CI-path bug in the electrobun binary; non-fatal
  if (/failed to embed icon/.test(l)) return null;
  if (/rcedit/.test(l) && /error executing command/.test(l)) return null;

  // ── errors (bold red) ──
  if (
    /\b(error|failed|failure|exception|crash)\b/.test(l) &&
    !/no.error/.test(l)
  ) {
    return `${A.red}${A.bold}${raw}${A.reset}`;
  }

  // ── warnings (yellow) ──
  if (/\bwarn(ing)?\b/.test(l)) {
    return `${A.yellow}${raw}${A.reset}`;
  }

  // ── ready / listening — green + bold + OSC 8 link for URL ──
  if (/\b(ready|listening|started|running on|compiled|built in|➜)\b/.test(l)) {
    const urlMatch = raw.match(/https?:\/\/[\w.:/-]+/);
    if (urlMatch) {
      const url = urlMatch[0];
      const linked = raw.replace(url, osc8(url, url));
      return `${A.green}${A.bold}${linked}${A.reset}`;
    }
    return `${A.green}${A.bold}${raw}${A.reset}`;
  }

  // ── HMR updates — dim ──
  if (/\bhmr\b|\bpage reload\b|\bfull reload\b/.test(l)) {
    return `${A.dim}${raw}${A.reset}`;
  }

  // ── debug / verbose — dim ──
  if (/\b(debug|verbose|trace)\b/.test(l)) {
    return `${A.dim}${raw}${A.reset}`;
  }

  return raw;
}

function onData(chunk) {
  for (const line of chunk.toString().split("\n")) {
    if (!line.trim()) continue;
    const out = colorLine(line);
    if (out !== null) process.stdout.write(`${out}\n`);
  }
}

// ── Spawn service ─────────────────────────────────────────────────────────────
const child = spawn(config.cmd, config.args, {
  cwd: config.cwd,
  env: { ...process.env, ...config.env },
  stdio: ["inherit", "pipe", "pipe"],
});

child.stdout?.on("data", onData);
child.stderr?.on("data", onData);

child.on("exit", (code, signal) => {
  const reason = signal ? `signal ${signal}` : `exit ${code ?? "?"}`;
  console.log(`\n${A.yellow}${A.bold}[${label}] stopped (${reason})${A.reset}`);
  process.exit(code ?? 0);
});

process.on("SIGINT", () => child.kill("SIGTERM"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
