/**
 * Agent Native Module for Electron
 *
 * Embeds the Milaidy agent runtime (ElizaOS) directly in the Electron main
 * process and exposes it to the renderer via IPC.
 *
 * On startup the module:
 *   1. Imports startEliza (headless) from the milaidy dist
 *   2. Starts the API server on an available port
 *   3. Sends the port number to the renderer so the UI's api-client can connect
 *
 * The renderer never needs to know whether the API server is embedded or
 * remote — it simply connects to `http://localhost:{port}`.
 */

import { ipcMain, BrowserWindow, app } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "path";
import type { IpcValue } from "./ipc-types";

/**
 * Dynamic import that survives TypeScript's CommonJS transformation.
 * tsc converts `import()` to `require()` when targeting CommonJS, but the
 * milaidy dist bundles are ESM.  This wrapper keeps a real `import()` call
 * at runtime.
 */
const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentStatus {
  state: "not_started" | "starting" | "running" | "stopped" | "error";
  agentName: string | null;
  port: number | null;
  startedAt: number | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// AgentManager — singleton
// ---------------------------------------------------------------------------

export class AgentManager {
  private mainWindow: BrowserWindow | null = null;
  private status: AgentStatus = {
    state: "not_started",
    agentName: null,
    port: null,
    startedAt: null,
    error: null,
  };
  // Keep references so we can shut down gracefully
  private runtime: Record<string, unknown> | null = null;
  private apiClose: (() => Promise<void>) | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /** Start the agent runtime + API server. Idempotent. */
  async start(): Promise<AgentStatus> {
    if (this.status.state === "running" || this.status.state === "starting") {
      return this.status;
    }

    this.status.state = "starting";
    this.status.error = null;
    this.sendToRenderer("agent:status", this.status);

    try {
      // Resolve the milaidy dist.
      // In dev: __dirname = electron/build/src/native/ → 6 levels up to milaidy root/dist
      // In packaged app: extraResources copies dist/ to Resources/milaidy-dist/
      const milaidyDist = app.isPackaged
        ? path.join(process.resourcesPath, "milaidy-dist")
        : path.resolve(__dirname, "../../../../../../dist");

      console.log(`[Agent] Resolved milaidy dist: ${milaidyDist} (packaged: ${app.isPackaged})`);

      // 1. Start the ElizaOS runtime in headless mode
      const elizaModule = await dynamicImport(path.join(milaidyDist, "eliza.js"));
      const startEliza = (
        elizaModule.startEliza ?? (elizaModule.default as Record<string, unknown>)?.startEliza
      ) as ((opts: { headless: boolean }) => Promise<Record<string, unknown> | null>) | undefined;

      if (typeof startEliza !== "function") {
        throw new Error("eliza.js does not export startEliza");
      }

      const runtimeResult = await startEliza({ headless: true });
      if (!runtimeResult) {
        throw new Error("startEliza returned null — runtime failed to initialize");
      }

      this.runtime = runtimeResult as Record<string, unknown>;
      const agentName =
        (runtimeResult as { character?: { name?: string } }).character?.name ?? "Milaidy";

      // 2. Start the API server with the live runtime on port 2138
      //    (or MILAIDY_PORT if set)
      const apiPort = Number(process.env.MILAIDY_PORT) || 2138;
      const serverModule = await dynamicImport(
        path.join(milaidyDist, "server.js")
      ).catch((err: unknown) => {
        console.warn("[Agent] Could not load server.js:", err instanceof Error ? err.message : err);
        return null;
      });

      let actualPort = apiPort;
      if (serverModule?.startApiServer) {
        const { port: resolvedPort, close } = await serverModule.startApiServer({
          port: apiPort,
          runtime: runtimeResult,
        });
        actualPort = resolvedPort;
        this.apiClose = close;
      } else {
        console.warn("[Agent] Could not find API server module — runtime only, no HTTP");
      }

      this.status = {
        state: "running",
        agentName,
        port: actualPort,
        startedAt: Date.now(),
        error: null,
      };

      this.sendToRenderer("agent:status", this.status);
      console.log(`[Agent] Runtime started — agent: ${agentName}, port: ${actualPort}`);
      return this.status;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status = {
        state: "error",
        agentName: null,
        port: null,
        startedAt: null,
        error: msg,
      };
      this.sendToRenderer("agent:status", this.status);
      console.error("[Agent] Failed to start:", msg);
      return this.status;
    }
  }

  /** Stop the agent runtime. */
  async stop(): Promise<void> {
    if (this.status.state !== "running") return;

    try {
      if (this.apiClose) {
        await this.apiClose();
        this.apiClose = null;
      }
      if (this.runtime && typeof (this.runtime as { stop?: () => Promise<void> }).stop === "function") {
        await (this.runtime as { stop: () => Promise<void> }).stop();
      }
    } catch (err) {
      console.warn("[Agent] Error during shutdown:", err instanceof Error ? err.message : err);
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
  async restart(): Promise<AgentStatus> {
    console.log("[Agent] Restart requested — stopping current runtime…");
    await this.stop();
    console.log("[Agent] Restarting…");
    return this.start();
  }

  getStatus(): AgentStatus {
    return { ...this.status };
  }

  getPort(): number | null {
    return this.status.port;
  }

  private sendToRenderer(channel: string, data: IpcValue): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /** Clean up on app quit. */
  dispose(): void {
    this.stop().catch((err) =>
      console.warn("[Agent] dispose error:", err instanceof Error ? err.message : err)
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let agentManager: AgentManager | null = null;

export function getAgentManager(): AgentManager {
  if (!agentManager) {
    agentManager = new AgentManager();
  }
  return agentManager;
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

export function registerAgentIPC(): void {
  const manager = getAgentManager();

  ipcMain.handle("agent:start", async () => {
    return manager.start();
  });

  ipcMain.handle("agent:stop", async () => {
    await manager.stop();
    return { ok: true };
  });

  ipcMain.handle("agent:restart", async () => {
    return manager.restart();
  });

  ipcMain.handle("agent:status", () => {
    return manager.getStatus();
  });
}
