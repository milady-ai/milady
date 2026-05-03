#!/usr/bin/env node
/**
 * Personal dev dashboard launcher (dutch's variant of dev:desktop).
 *
 * Opens Windows Terminal with 3 split panes:
 *   left       → API server
 *   right-top  → Electrobun
 *   right-bot  → Vite
 *
 * Port-coordinates the same way dev-platform.mjs does — allocates before
 * any child starts, writes .env.dutch.json so each pane script picks them up.
 *
 * Usage:
 *   bun run dev:desktop:dutch          # prod renderer dist (build if stale)
 *   bun run dev:desktop:dutch:watch    # Vite dev server + Electrobun ELIZA_RENDERER_URL (HMR)
 */

import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const bunExe = process.execPath.includes("bun") ? process.execPath : "bun";
const panePath = path.join(here, "dev-dutch-pane.mjs");
const viteWatch = process.argv.includes("--watch");

// ── imports from eliza submodule ─────────────────────────────────────────────
const libBase = path.join(root, "eliza/packages/app-core/scripts/lib");
const { allocateFirstFreeLoopbackPort } = await import(
  path.join(libBase, "allocate-loopback-port.mjs")
);
const { viteRendererBuildNeeded } = await import(
  path.join(libBase, "vite-renderer-dist-stale.mjs")
);
const { resolveMainAppDir, resolveElectrobunDir } = await import(
  path.join(libBase, "app-dir.mjs")
);

// ── Port allocation ───────────────────────────────────────────────────────────
console.log("[dutch] Allocating ports…");
const apiPort = await allocateFirstFreeLoopbackPort(31337);
const uiPort = viteWatch ? await allocateFirstFreeLoopbackPort(2138) : 2138;
console.log(`[dutch] API :${apiPort}   UI :${uiPort}   viteWatch=${viteWatch}`);

// Write resolved config for pane scripts to read
const envFile = path.join(root, ".env.dutch.json");
writeFileSync(
  envFile,
  JSON.stringify({ apiPort, uiPort, bunExe, viteWatch }, null, 2),
  "utf8",
);

// ── Pre-flight ────────────────────────────────────────────────────────────────
const appDir = resolveMainAppDir(root, "app");

if (!viteWatch && viteRendererBuildNeeded(appDir, root)) {
  console.log("[dutch] Building renderer (vite build)…");
  execSync("bun run vite build", { cwd: appDir, stdio: "inherit" });
  console.log("[dutch] Renderer ready.");
} else if (!viteWatch) {
  console.log("[dutch] Renderer dist up to date — skipping vite build.");
}

const rootDistEntry = path.join(root, "dist", "entry.js");
if (!existsSync(rootDistEntry)) {
  console.log("[dutch] Building root bundle (tsdown)…");
  execSync("bunx tsdown", { cwd: root, stdio: "inherit" });
}

// ── Check Windows Terminal ────────────────────────────────────────────────────
// wt.exe is a Windows Store app execution alias — execFileSync can't resolve
// those; only the shell (cmd/powershell) can. Use shell:true here.
try {
  execSync("wt --version", { stdio: "ignore", shell: true });
} catch {
  console.error("[dutch] Windows Terminal (wt.exe) not found.");
  console.error("  Install: winget install Microsoft.WindowsTerminal");
  console.error("  Fallback: bun run dev:desktop");
  process.exit(1);
}

// ── Build Windows Terminal launch command ─────────────────────────────────────
// Use -EncodedCommand to pass arbitrary PowerShell to each pane without
// escaping hell (wt subcommand `;` vs. PowerShell `;`, nested quotes, etc.).

function encodePS(cmd) {
  return Buffer.from(cmd, "utf16le").toString("base64");
}

function paneCmd(service) {
  // Each pane: run the pane script then keep pwsh open on failure
  const ps = `& '${bunExe.replace(/'/g, "''")}' '${panePath.replace(/'/g, "''")}' ${service}; if ($LASTEXITCODE -ne 0) { Read-Host 'Press Enter to close' }`;
  return `pwsh -NoProfile -NoExit -EncodedCommand ${encodePS(ps)}`;
}

const apiLabel = `API :${apiPort}`;
const electrobunLabel = "Electrobun";

// Non-watch: 2 panes (API left, Electrobun right) — renderer is prebuilt, no Vite needed.
// Watch:     3 panes (API left, Electrobun right-top, Vite HMR right-bottom).
const ps1Lines = [
  `wt \``,
  `  new-tab --title "${apiLabel}" -- ${paneCmd("api")} \``,
  "  `; split-pane -V " +
    `--title "${electrobunLabel}" -- ${paneCmd("electrobun")}` +
    (viteWatch ? " `" : ""),
];
if (viteWatch) {
  ps1Lines.push(
    "  `; split-pane -H " +
      `--title "Vite :${uiPort} (HMR)" -- ${paneCmd("vite-watch")}`,
  );
}
const ps1 = ps1Lines.join("\n");

const tmpPs1 = path.join(os.tmpdir(), "milady-dev-dutch.ps1");
writeFileSync(tmpPs1, ps1, "utf8");

console.log("[dutch] Launching Windows Terminal…");
execSync(
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tmpPs1}"`,
  { stdio: "inherit" },
);
