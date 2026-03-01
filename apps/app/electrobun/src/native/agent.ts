/**
 * Agent Native Module — Electrobun
 *
 * Embeds the Milady agent runtime (elizaOS) in the main process and
 * exposes it via the IPC dispatch registry (no Electron ipcMain).
 *
 * Adapted from apps/app/electron/src/native/agent.ts — Electron APIs
 * replaced with Bun equivalents.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pushToRenderer } from "../ipc-server";
import type { IpcValue } from "./ipc-types";

// ---------------------------------------------------------------------------
// Diagnostic logging
// ---------------------------------------------------------------------------

let _logPath: string | null = null;

function getLogPath(): string | null {
  if (_logPath !== null) return _logPath;
  try {
    const userDataDir = process.env.MILADY_USER_DATA_DIR ?? Bun.env.HOME
      ? path.join(Bun.env.HOME as string, ".config", "Milady")
      : null;
    if (userDataDir) {
      fs.mkdirSync(userDataDir, { recursive: true });
      _logPath = path.join(userDataDir, "milady-startup.log");
    }
  } catch {
    // ignore
  }
  return _logPath;
}

function diagnosticLog(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  console.log(message);
  const logPath = getLogPath();
  if (logPath) {
    try {
      fs.appendFileSync(logPath, line);
    } catch {
      // ignore
    }
  }
}

function shortError(err: unknown, maxLen = 280): string {
  const raw =
    err instanceof Error
      ? err.message || (err.stack ?? String(err))
      : String(err);
  const oneLine = raw.replace(/\s+/g, " ").trim();
  return oneLine.length <= maxLen ? oneLine : `${oneLine.slice(0, maxLen)}…`;
}

// ---------------------------------------------------------------------------
// Dynamic import helper (ESM-safe, ASAR-aware)
// ---------------------------------------------------------------------------

const dynamicImport = async (
  specifier: string,
): Promise<Record<string, unknown>> => {
  const fsPath = specifier.startsWith("file://")
    ? fileURLToPath(specifier)
    : specifier;

  // Bun handles ESM natively, no CJS transform issues
  try {
    const importUrl = fsPath.startsWith("file://")
      ? fsPath
      : pathToFileURL(fsPath).href;
    const importer = new Function("s", "return import(s)") as (
      s: string,
    ) => Promise<Record<string, unknown>>;
    return await importer(importUrl);
  } catch (primaryErr) {
    // Fallback to require for CJS bundles
    console.warn(
      "[Agent] ESM import failed, falling back to require():",
      primaryErr instanceof Error ? primaryErr.message : primaryErr,
    );
    const mod = require(fsPath) as Record<string, unknown>;
    return mod;
  }
};

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
// AgentManager
// ---------------------------------------------------------------------------

export class AgentManager {
  private status: AgentStatus = {
    state: "not_started",
    agentName: null,
    port: null,
    startedAt: null,
    error: null,
  };
  private runtime: Record<string, unknown> | null = null;
  private apiClose: (() => Promise<void>) | null = null;

  // setMainWindow kept for API compatibility but unused in Electrobun
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setMainWindow(_window: unknown): void {}

  async start(): Promise<AgentStatus> {
    diagnosticLog(`[Agent] start() — state: ${this.status.state}`);
    if (this.status.state === "running" || this.status.state === "starting") {
      return this.status;
    }

    if (this.apiClose) {
      try {
        await this.apiClose();
      } catch (err) {
        console.warn("[Agent] Failed to close stale API server:", err instanceof Error ? err.message : err);
      } finally {
        this.apiClose = null;
        this.status.port = null;
      }
    }
    if (
      this.runtime &&
      typeof (this.runtime as { stop?: () => Promise<void> }).stop === "function"
    ) {
      try {
        await (this.runtime as { stop: () => Promise<void> }).stop();
      } catch {
        // ignore
      } finally {
        this.runtime = null;
      }
    }

    this.status.state = "starting";
    this.status.error = null;
    this.send("agent:status", this.status);

    try {
      // Resolve milady dist — use cwd-relative path in dev, env override in production
      const miladyDist =
        process.env.MILADY_DIST_PATH ??
        path.resolve(process.cwd(), "milady-dist");

      diagnosticLog(`[Agent] milady dist: ${miladyDist}`);

      const apiPort = Number(process.env.MILADY_PORT) || 2138;

      // NODE_PATH for dynamic plugin resolution
      const existing = process.env.NODE_PATH || "";
      let rootModules: string | null = null;
      {
        let dir = process.cwd();
        while (dir !== path.dirname(dir)) {
          const candidate = path.join(dir, "node_modules");
          if (fs.existsSync(candidate)) {
            rootModules = candidate;
            break;
          }
          dir = path.dirname(dir);
        }
      }
      if (rootModules) {
        process.env.NODE_PATH = existing
          ? `${rootModules}${path.delimiter}${existing}`
          : rootModules;
      }

      const miladyDistModules = path.join(miladyDist, "node_modules");
      if (fs.existsSync(miladyDistModules)) {
        process.env.NODE_PATH = process.env.NODE_PATH
          ? `${miladyDistModules}${path.delimiter}${process.env.NODE_PATH}`
          : miladyDistModules;
      }

      // Server module
      diagnosticLog(`[Agent] Loading server.js…`);
      const serverModule = await dynamicImport(
        pathToFileURL(path.join(miladyDist, "server.js")).href,
      ).catch((err: unknown) => {
        diagnosticLog(`[Agent] FAILED server.js: ${shortError(err)}`);
        return null;
      });

      let actualPort: number | null = null;
      let startEliza: ((opts: { headless: boolean }) => Promise<Record<string, unknown> | null>) | null = null;
      let apiUpdateRuntime: ((rt: unknown) => void) | null = null;

      if (serverModule?.startApiServer) {
        const { port: resolvedPort, close, updateRuntime } =
          await (serverModule.startApiServer as Function)({
            port: apiPort,
            initialAgentState: "starting",
            onRestart: async () => {
              console.log("[Agent] HTTP restart requested…");
              const prev = this.runtime;
              if (prev && typeof (prev as { stop?: () => Promise<void> }).stop === "function") {
                try { await (prev as { stop: () => Promise<void> }).stop(); } catch { /* ignore */ }
              }
              if (!startEliza) return null;
              const next = await startEliza({ headless: true });
              if (!next) return null;
              this.runtime = next as Record<string, unknown>;
              apiUpdateRuntime?.(next);
              const nextName =
                (next as { character?: { name?: string } }).character?.name ?? "Milady";
              this.status = {
                ...this.status,
                state: "running",
                agentName: nextName,
                port: actualPort,
                startedAt: Date.now(),
                error: null,
              };
              this.send("agent:status", this.status);
              return next as Record<string, unknown>;
            },
          });
        actualPort = resolvedPort as number;
        this.apiClose = close as () => Promise<void>;
        apiUpdateRuntime = updateRuntime as ((rt: unknown) => void);
        diagnosticLog(`[Agent] API server on port ${actualPort}`);
      }

      this.status = { ...this.status, port: actualPort };
      this.send("agent:status", this.status);

      // Eliza module
      diagnosticLog(`[Agent] Loading eliza.js…`);
      let elizaLoadError: string | null = null;
      const elizaModule = await dynamicImport(
        pathToFileURL(path.join(miladyDist, "eliza.js")).href,
      ).catch((err: unknown) => {
        elizaLoadError = shortError(err);
        diagnosticLog(`[Agent] FAILED eliza.js: ${elizaLoadError}`);
        return null;
      });

      const resolvedStartEliza = elizaModule
        ? ((elizaModule.startEliza ??
            (elizaModule.default as Record<string, unknown>)?.startEliza) as
            | ((opts: { headless: boolean }) => Promise<Record<string, unknown> | null>)
            | undefined)
        : undefined;

      if (typeof resolvedStartEliza !== "function") {
        const reason = elizaModule
          ? "eliza.js does not export startEliza"
          : (elizaLoadError ?? "eliza.js failed to load");
        this.status = {
          state: "error",
          agentName: null,
          port: actualPort,
          startedAt: null,
          error: reason,
        };
        this.send("agent:status", this.status);
        return this.status;
      }
      startEliza = resolvedStartEliza;

      let runtimeResult: Record<string, unknown> | null = null;
      let runtimeInitError: string | null = null;
      try {
        runtimeResult = await startEliza({ headless: true });
      } catch (runtimeErr) {
        runtimeInitError = shortError(runtimeErr);
        diagnosticLog(`[Agent] Runtime startup threw: ${runtimeInitError}`);
      }

      if (!runtimeResult) {
        const reason = runtimeInitError ?? "Runtime failed to initialize";
        this.status = { state: "error", agentName: null, port: actualPort, startedAt: null, error: reason };
        this.send("agent:status", this.status);
        return this.status;
      }

      this.runtime = runtimeResult;
      const agentName =
        (runtimeResult as { character?: { name?: string } }).character?.name ?? "Milady";
      apiUpdateRuntime?.(runtimeResult);

      this.status = {
        state: "running",
        agentName,
        port: actualPort,
        startedAt: Date.now(),
        error: null,
      };
      this.send("agent:status", this.status);
      diagnosticLog(`[Agent] Running — agent: ${agentName}, port: ${actualPort}`);
      return this.status;
    } catch (err) {
      const msg = err instanceof Error ? (err.stack || err.message) : String(err);
      if (
        this.runtime &&
        typeof (this.runtime as { stop?: () => Promise<void> }).stop === "function"
      ) {
        try { await (this.runtime as { stop: () => Promise<void> }).stop(); } catch { /* ignore */ }
      }
      this.runtime = null;
      this.status = {
        state: "error",
        agentName: null,
        port: this.status.port,
        startedAt: null,
        error: msg,
      };
      this.send("agent:status", this.status);
      diagnosticLog(`[Agent] Failed: ${msg}`);
      return this.status;
    }
  }

  async stop(): Promise<void> {
    if (this.status.state !== "running" && this.status.state !== "starting") return;
    try {
      if (this.apiClose) {
        await this.apiClose();
        this.apiClose = null;
      }
      if (
        this.runtime &&
        typeof (this.runtime as { stop?: () => Promise<void> }).stop === "function"
      ) {
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
    this.send("agent:status", this.status);
    console.log("[Agent] Runtime stopped");
  }

  async restart(): Promise<AgentStatus> {
    await this.stop();
    return this.start();
  }

  getStatus(): AgentStatus {
    return { ...this.status };
  }

  getPort(): number | null {
    return this.status.port;
  }

  private send(channel: string, data: IpcValue): void {
    pushToRenderer(channel, data);
  }

  dispose(): void {
    this.stop().catch((err) =>
      console.warn("[Agent] dispose error:", err instanceof Error ? err.message : err),
    );
  }
}

let agentManager: AgentManager | null = null;

export function getAgentManager(): AgentManager {
  if (!agentManager) agentManager = new AgentManager();
  return agentManager;
}

// ---------------------------------------------------------------------------
// IPC handlers — registered via dispatch registry, not ipcMain
// ---------------------------------------------------------------------------

export const agentHandlers: Record<string, (args: unknown[]) => Promise<unknown>> = {
  "agent:start": async () => getAgentManager().start(),
  "agent:stop": async () => {
    await getAgentManager().stop();
    return { ok: true };
  },
  "agent:restart": async () => getAgentManager().restart(),
  "agent:status": async () => getAgentManager().getStatus(),
};
