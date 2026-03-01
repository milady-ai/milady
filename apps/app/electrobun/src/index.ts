/**
 * Milady Desktop — Electrobun Main Process
 *
 * Replaces apps/app/electron/src/index.ts.
 *
 * Architecture:
 *   • Bun serves the React app on localhost:18999 with the window.electron shim injected
 *   • WebSocket on the same port handles all IPC (replaces Electron ipcMain)
 *   • Electrobun BrowserWindow wraps the native OS window
 *   • Native modules (agent, desktop, gateway, permissions) dispatch through the IPC registry
 */

import path from "node:path";
import { BrowserWindow, Updater, Utils } from "electrobun";
import { injectApiBase, pushSharePayload, resolveExternalApiBase } from "./api-base";
import { startIpcServer, stopIpcServer, pushToRenderer } from "./ipc-server";
import {
  disposeNativeModules,
  getAgentManager,
  getDesktopManager,
  initializeNativeModules,
  registerAllIPC,
} from "./native/index";

// ---------------------------------------------------------------------------
// Share target support
// ---------------------------------------------------------------------------

interface ShareTargetPayload {
  source: string;
  title?: string;
  text?: string;
  url?: string;
  files?: Array<{ name: string; path?: string }>;
}

let pendingSharePayloads: ShareTargetPayload[] = [];
let appReady = false;

function parseShareUrl(rawUrl: string): ShareTargetPayload | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "milady:") return null;
  const sharePath = (parsed.pathname || parsed.host || "").replace(/^\/+/, "");
  if (sharePath !== "share") return null;

  const title = parsed.searchParams.get("title")?.trim() ?? undefined;
  const text = parsed.searchParams.get("text")?.trim() ?? undefined;
  const sharedUrl = parsed.searchParams.get("url")?.trim() ?? undefined;
  const files = parsed.searchParams
    .getAll("file")
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => ({ name: path.basename(f), path: f }));

  return { source: "electrobun-open-url", title, text, url: sharedUrl, files };
}

function dispatchShare(payload: ShareTargetPayload): void {
  if (!appReady) {
    pendingSharePayloads.push(payload);
    return;
  }
  pushSharePayload(payload);
}

function flushPendingShares(): void {
  const toFlush = pendingSharePayloads;
  pendingSharePayloads = [];
  for (const p of toFlush) {
    pushSharePayload(p);
  }
}

// Check CLI args for milady:// URLs passed on launch
for (const arg of process.argv) {
  const payload = parseShareUrl(arg);
  if (payload) pendingSharePayloads.push(payload);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Resolve web dist directory (React app build output)
  const distDir = process.env.MILADY_WEB_DIST
    ?? path.resolve(process.cwd(), "..", "app", "dist")
    ?? path.resolve(process.cwd(), "dist");

  // Start IPC WebSocket + React app dev server
  const { port: ipcPort } = await startIpcServer({
    distDir,
    port: Number(process.env.MILADY_DESKTOP_PORT) || 18999,
  });

  // Register all native IPC handlers
  registerAllIPC();

  // Resolve API base (external or embedded agent)
  const externalApiBaseResolution = resolveExternalApiBase(process.env);
  const externalApiBase = externalApiBaseResolution.base;
  if (externalApiBaseResolution.invalidSources.length > 0) {
    console.warn(
      `[Milady] Ignoring invalid API base from: ${externalApiBaseResolution.invalidSources.join(", ")}`,
    );
  }

  const skipEmbeddedAgent =
    process.env.MILADY_ELECTRON_SKIP_EMBEDDED_AGENT === "1" || Boolean(externalApiBase);

  // Create the main window
  const win = new BrowserWindow({
    title: "Milady",
    frame: {
      x: 100,
      y: 100,
      width: 1200,
      height: 800,
    },
    url: `http://localhost:${ipcPort}`,
    renderer: "cef",
    titleBarStyle: "hiddenInset",
  });

  initializeNativeModules(win);

  appReady = true;

  // Inject API base into renderer when available
  const injectApiEndpoint = (portOrBase: number | string | null): void => {
    if (!portOrBase) return;
    const base = typeof portOrBase === "number"
      ? `http://localhost:${portOrBase}`
      : portOrBase;
    injectApiBase(base, process.env.MILADY_API_TOKEN);
    flushPendingShares();
  };

  if (externalApiBase) {
    const source = externalApiBaseResolution.source ?? "unknown";
    console.info(`[Milady] External API base (${source}): ${externalApiBase}`);
    injectApiBase(externalApiBase, process.env.MILADY_API_TOKEN);
    flushPendingShares();
  } else if (!skipEmbeddedAgent) {
    const agentManager = getAgentManager();
    const startPromise = agentManager.start();

    // Poll for the port and inject as soon as it's available
    void (async () => {
      const startedAt = Date.now();
      const timeoutMs = 30_000;
      while (Date.now() - startedAt < timeoutMs) {
        const port = agentManager.getPort();
        if (port) {
          injectApiEndpoint(port);
          return;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    })();

    startPromise.catch((err) => {
      console.error("[Milady] Agent startup failed:", err);
    });
  } else {
    console.info("[Milady] Embedded agent disabled by configuration");
    flushPendingShares();
  }

  // Auto-update check
  if (process.env.MILADY_ELECTRON_DISABLE_AUTO_UPDATER !== "1") {
    try {
      const updater = new Updater();
      await updater.checkForUpdate();
    } catch (err) {
      console.warn("[Milady] Update check failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  }

  // Also re-inject API base when the page reloads (best-effort via periodic check)
  let lastInjectedPort: number | null = null;
  setInterval(() => {
    const port = getAgentManager().getPort();
    if (port && port !== lastInjectedPort) {
      lastInjectedPort = port;
      injectApiEndpoint(port);
    }
  }, 5000);
}

// ---------------------------------------------------------------------------
// Process lifecycle
// ---------------------------------------------------------------------------

process.on("SIGTERM", () => {
  disposeNativeModules();
  stopIpcServer();
  process.exit(0);
});

process.on("SIGINT", () => {
  disposeNativeModules();
  stopIpcServer();
  process.exit(0);
});

// Run
main().catch((err) => {
  console.error("[Milady] Fatal startup error:", err);
  process.exit(1);
});
