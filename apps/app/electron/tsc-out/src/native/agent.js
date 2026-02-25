"use strict";
/**
 * Agent Native Module for Electron
 *
 * Embeds the Milady agent runtime (ElizaOS) directly in the Electron main
 * process and exposes it to the renderer via IPC.
 *
 * On startup the module:
 *   1. Imports startEliza (headless) from the milady dist
 *   2. Starts the API server on an available port
 *   3. Sends the port number to the renderer so the UI's api-client can connect
 *
 * The renderer never needs to know whether the API server is embedded or
 * remote — it simply connects to `http://localhost:{port}`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentManager = void 0;
exports.getAgentManager = getAgentManager;
exports.registerAgentIPC = registerAgentIPC;
const tslib_1 = require("tslib");
const node_path_1 = tslib_1.__importDefault(require("node:path"));
const node_url_1 = require("node:url");
const electron_1 = require("electron");
/**
 * Dynamic import that survives TypeScript's CommonJS transformation.
 * tsc converts `import()` to `require()` when targeting CommonJS, but the
 * milady dist bundles are ESM.  This wrapper keeps a real `import()` call
 * at runtime.
 *
 * For ASAR-packed files (Electron packaged app), ESM import() doesn't work
 * because Node's ESM loader can't read from ASAR archives.  In that case
 * we fall back to require() with the filesystem path.
 */
const dynamicImport = async (specifier) => {
  // Convert file:// URLs to filesystem paths for require() fallback
  const fsPath = specifier.startsWith("file://")
    ? (0, node_url_1.fileURLToPath)(specifier)
    : specifier;
  // If the path is inside an ASAR archive (but NOT in app.asar.unpacked),
  // require() is the only option.  Electron patches require() to handle
  // ASAR reads, but the ESM loader does NOT support ASAR.
  // Note: app.asar.unpacked is a regular directory on the real filesystem,
  // so ESM import() works there.
  const isAsar = fsPath.includes(".asar") && !fsPath.includes(".asar.unpacked");
  if (isAsar) {
    console.log(`[Agent] Loading from ASAR via require(): ${fsPath}`);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(fsPath);
    } catch (requireErr) {
      console.error(
        "[Agent] ASAR require() failed:",
        requireErr instanceof Error ? requireErr.message : requireErr,
      );
      throw requireErr;
    }
  }
  // Primary path: use new Function to get a real async import() at runtime,
  // bypassing tsc's CJS downgrade.
  try {
    // Ensure we use a file:// URL for import()
    const importUrl = fsPath.startsWith("file://")
      ? fsPath
      : specifier.startsWith("file://")
        ? specifier
        : (0, node_url_1.pathToFileURL)(fsPath).href;
    console.log(`[Agent] Loading via ESM import(): ${importUrl}`);
    const importer = new Function("s", "return import(s)");
    return await importer(importUrl);
  } catch (primaryErr) {
    // If the primary path failed, try require() with filesystem path
    console.warn(
      "[Agent] ESM dynamic import failed, falling back to require():",
      primaryErr instanceof Error ? primaryErr.message : primaryErr,
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(fsPath);
  }
};
// ---------------------------------------------------------------------------
// AgentManager — singleton
// ---------------------------------------------------------------------------
class AgentManager {
  constructor() {
    this.mainWindow = null;
    this.status = {
      state: "not_started",
      agentName: null,
      port: null,
      startedAt: null,
      error: null,
    };
    // Keep references so we can shut down gracefully
    this.runtime = null;
    this.apiClose = null;
  }
  setMainWindow(window) {
    this.mainWindow = window;
  }
  /** Start the agent runtime + API server. Idempotent. */
  async start() {
    var _a, _b, _c, _d;
    if (this.status.state === "running" || this.status.state === "starting") {
      return this.status;
    }
    if (this.apiClose) {
      try {
        await this.apiClose();
      } catch (err) {
        console.warn(
          "[Agent] Failed to close stale API server before restart:",
          err instanceof Error ? err.message : err,
        );
      } finally {
        this.apiClose = null;
        this.status.port = null;
      }
    }
    if (this.runtime && typeof this.runtime.stop === "function") {
      try {
        await this.runtime.stop();
      } catch (err) {
        console.warn(
          "[Agent] Failed to stop stale runtime before restart:",
          err instanceof Error ? err.message : err,
        );
      } finally {
        this.runtime = null;
      }
    }
    this.status.state = "starting";
    this.status.error = null;
    this.sendToRenderer("agent:status", this.status);
    try {
      // Resolve the milady dist.
      // In dev: __dirname = electron/build/src/native/ → 6 levels up to milady root/dist
      // In packaged app: dist is unpacked to app.asar.unpacked/milady-dist
      // (asarUnpack in electron-builder.config.json ensures milady-dist is
      // extracted outside the ASAR so ESM import() works normally.)
      const miladyDist = electron_1.app.isPackaged
        ? node_path_1.default.join(
            electron_1.app
              .getAppPath()
              .replace("app.asar", "app.asar.unpacked"),
            "milady-dist",
          )
        : node_path_1.default.resolve(__dirname, "../../../../../../dist");
      console.log(
        `[Agent] Resolved milady dist: ${miladyDist} (packaged: ${electron_1.app.isPackaged})`,
      );
      // When loading from app.asar.unpacked, Node's module resolution can't
      // find dependencies inside the ASAR's node_modules (e.g. json5). Add
      // the ASAR's node_modules to NODE_PATH so ESM imports can resolve them.
      if (electron_1.app.isPackaged) {
        const asarModules = node_path_1.default.join(
          electron_1.app.getAppPath(),
          "node_modules",
        );
        const existing = process.env.NODE_PATH || "";
        process.env.NODE_PATH = existing
          ? `${asarModules}${node_path_1.default.delimiter}${existing}`
          : asarModules;
        // Force Node to re-read NODE_PATH
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("node:module").Module._initPaths();
        console.log(
          `[Agent] Added ASAR node_modules to NODE_PATH: ${asarModules}`,
        );
      }
      // 1. Start API server immediately so the UI can bootstrap while runtime starts.
      //    (or MILADY_PORT if set)
      const apiPort = Number(process.env.MILADY_PORT) || 2138;
      const serverModule = await dynamicImport(
        (0, node_url_1.pathToFileURL)(
          node_path_1.default.join(miladyDist, "server.js"),
        ).href,
      ).catch((err) => {
        console.warn(
          "[Agent] Could not load server.js:",
          err instanceof Error ? err.message : err,
        );
        return null;
      });
      let actualPort = null;
      let startEliza = null;
      // `startApiServer()` returns an `updateRuntime()` helper that broadcasts
      // status updates and restores conversation state after a hot restart.
      // Keep it around so our onRestart hook can call it.
      let apiUpdateRuntime = null;
      if (
        serverModule === null || serverModule === void 0
          ? void 0
          : serverModule.startApiServer
      ) {
        const {
          port: resolvedPort,
          close,
          updateRuntime,
        } = await serverModule.startApiServer({
          port: apiPort,
          initialAgentState: "starting",
          // IMPORTANT: the web UI expects POST /api/agent/restart to work.
          // Without an onRestart handler, config changes that require a runtime
          // restart appear to "not work".
          onRestart: async () => {
            var _a, _b;
            console.log(
              "[Agent] HTTP restart requested — restarting embedded runtime…",
            );
            // 1) Stop old runtime (do NOT stop the API server)
            const prevRuntime = this.runtime;
            if (prevRuntime && typeof prevRuntime.stop === "function") {
              try {
                await prevRuntime.stop();
              } catch (stopErr) {
                console.warn(
                  "[Agent] Error stopping runtime during HTTP restart:",
                  stopErr instanceof Error ? stopErr.message : stopErr,
                );
              }
            }
            if (!startEliza) {
              console.error(
                "[Agent] HTTP restart failed: runtime bootstrap not initialized",
              );
              return null;
            }
            // 2) Start new runtime (picks up latest config/env from disk)
            const nextRuntime = await startEliza({ headless: true });
            if (!nextRuntime) {
              console.error(
                "[Agent] HTTP restart failed: startEliza returned null",
              );
              return null;
            }
            this.runtime = nextRuntime;
            // Tell the API server about the new runtime so status is broadcast
            // and conversations are restored.
            apiUpdateRuntime === null || apiUpdateRuntime === void 0
              ? void 0
              : apiUpdateRuntime(nextRuntime);
            // 3) Update the Electron-side status (renderer may be listening via IPC)
            const nextName =
              (_b =
                (_a = nextRuntime.character) === null || _a === void 0
                  ? void 0
                  : _a.name) !== null && _b !== void 0
                ? _b
                : "Milady";
            this.status = Object.assign(Object.assign({}, this.status), {
              state: "running",
              agentName: nextName,
              port: actualPort,
              startedAt: Date.now(),
              error: null,
            });
            this.sendToRenderer("agent:status", this.status);
            console.log(`[Agent] HTTP restart complete — agent: ${nextName}`);
            return nextRuntime;
          },
        });
        actualPort = resolvedPort;
        this.apiClose = close;
        apiUpdateRuntime = updateRuntime;
      } else {
        console.warn(
          "[Agent] Could not find API server module — runtime will start without HTTP API",
        );
      }
      // Surface the API port while runtime is still booting.
      this.status = Object.assign(Object.assign({}, this.status), {
        port: actualPort,
      });
      this.sendToRenderer("agent:status", this.status);
      // 2. Resolve runtime bootstrap entry (may be slow on cold boot).
      const elizaModule = await dynamicImport(
        (0, node_url_1.pathToFileURL)(
          node_path_1.default.join(miladyDist, "eliza.js"),
        ).href,
      );
      const resolvedStartEliza =
        (_a = elizaModule.startEliza) !== null && _a !== void 0
          ? _a
          : (_b = elizaModule.default) === null || _b === void 0
            ? void 0
            : _b.startEliza;
      if (typeof resolvedStartEliza !== "function") {
        throw new Error("eliza.js does not export startEliza");
      }
      startEliza = resolvedStartEliza;
      // 3. Start Eliza runtime in headless mode.
      const runtimeResult = await startEliza({ headless: true });
      if (!runtimeResult) {
        throw new Error(
          "startEliza returned null — runtime failed to initialize",
        );
      }
      this.runtime = runtimeResult;
      const agentName =
        (_d =
          (_c = runtimeResult.character) === null || _c === void 0
            ? void 0
            : _c.name) !== null && _d !== void 0
          ? _d
          : "Milady";
      // Attach runtime to the already-running API server.
      apiUpdateRuntime === null || apiUpdateRuntime === void 0
        ? void 0
        : apiUpdateRuntime(runtimeResult);
      this.status = {
        state: "running",
        agentName,
        port: actualPort,
        startedAt: Date.now(),
        error: null,
      };
      this.sendToRenderer("agent:status", this.status);
      if (actualPort) {
        console.log(
          `[Agent] Runtime started — agent: ${agentName}, port: ${actualPort}`,
        );
      } else {
        console.log(
          `[Agent] Runtime started — agent: ${agentName}, API unavailable`,
        );
      }
      return this.status;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (this.apiClose) {
        try {
          await this.apiClose();
        } catch (closeErr) {
          console.warn(
            "[Agent] Failed to close API server after startup failure:",
            closeErr instanceof Error ? closeErr.message : closeErr,
          );
        } finally {
          this.apiClose = null;
          this.status.port = null;
        }
      }
      if (this.runtime && typeof this.runtime.stop === "function") {
        try {
          await this.runtime.stop();
        } catch (stopErr) {
          console.warn(
            "[Agent] Failed to stop runtime after startup failure:",
            stopErr instanceof Error ? stopErr.message : stopErr,
          );
        }
      }
      this.runtime = null;
      this.status = {
        state: "error",
        agentName: null,
        port: this.status.port,
        startedAt: null,
        error: msg,
      };
      this.sendToRenderer("agent:status", this.status);
      console.error("[Agent] Failed to start:", msg);
      return this.status;
    }
  }
  /** Stop the agent runtime. */
  async stop() {
    if (this.status.state !== "running" && this.status.state !== "starting") {
      return;
    }
    try {
      if (this.apiClose) {
        await this.apiClose();
        this.apiClose = null;
      }
      if (this.runtime && typeof this.runtime.stop === "function") {
        await this.runtime.stop();
      }
    } catch (err) {
      console.warn(
        "[Agent] Error during shutdown:",
        err instanceof Error ? err.message : err,
      );
    }
    this.runtime = null;
    this.status = {
      state: "stopped",
      agentName: this.status.agentName,
      port: null,
      startedAt: null,
      error: null,
    };
    this.sendToRenderer("agent:status", this.status);
    console.log("[Agent] Runtime stopped");
  }
  /**
   * Restart the agent runtime — stops the current instance and starts a
   * fresh one, picking up config/plugin changes.
   */
  async restart() {
    console.log("[Agent] Restart requested — stopping current runtime…");
    await this.stop();
    console.log("[Agent] Restarting…");
    return this.start();
  }
  getStatus() {
    return Object.assign({}, this.status);
  }
  getPort() {
    return this.status.port;
  }
  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
  /** Clean up on app quit. */
  dispose() {
    this.stop().catch((err) =>
      console.warn(
        "[Agent] dispose error:",
        err instanceof Error ? err.message : err,
      ),
    );
  }
}
exports.AgentManager = AgentManager;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let agentManager = null;
function getAgentManager() {
  if (!agentManager) {
    agentManager = new AgentManager();
  }
  return agentManager;
}
// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
function registerAgentIPC() {
  const manager = getAgentManager();
  electron_1.ipcMain.handle("agent:start", async () => {
    return manager.start();
  });
  electron_1.ipcMain.handle("agent:stop", async () => {
    await manager.stop();
    return { ok: true };
  });
  electron_1.ipcMain.handle("agent:restart", async () => {
    return manager.restart();
  });
  electron_1.ipcMain.handle("agent:status", () => {
    return manager.getStatus();
  });
}
