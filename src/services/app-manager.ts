/**
 * App Manager for Milaidy.
 *
 * Manages the lifecycle of ElizaOS apps: discovery, installation, launching,
 * and stopping. Apps are plugins that also provide a launchable user experience
 * (game, social platform, 3D world, etc.).
 *
 * Architecture:
 * - Apps are npm packages that export an ElizaOS Plugin with an `app` field.
 * - Installation reuses the plugin-installer infrastructure.
 * - Launching dynamically imports the app, registers the plugin with the runtime,
 *   and (for "local" apps) starts the game server on an allocated port.
 *
 * @module services/app-manager
 */

import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AppServerHandle, Plugin } from "@elizaos/core";
import { type AgentRuntime, logger } from "@elizaos/core";
import { loadMilaidyConfig } from "../config/config.js";
import { resolvePackageEntry } from "../runtime/eliza.js";
import { installPlugin, type ProgressCallback } from "./plugin-installer.js";
import {
  type RegistryAppInfo,
  getAppInfo as registryGetAppInfo,
  listApps as registryListApps,
  searchApps as registrySearchApps,
} from "./registry-client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Information about a currently running app. */
export interface RunningAppInfo {
  /** Registry package name (e.g. "@elizaos/app-dungeons") */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** URL where the app is accessible */
  url: string;
  /** How the app was launched */
  launchType: "url" | "local" | "connect";
  /** When the app was launched (ISO timestamp) */
  launchedAt: string;
  /** Port used by the local server (only for "local" type) */
  port: number | null;
}

/** Result of launching an app. */
export interface AppLaunchResult {
  /** URL to open the app experience */
  url: string;
  /** How the app was launched */
  launchType: "url" | "local" | "connect";
  /** Human-readable display name */
  displayName: string;
}

/** Information about an installed app. */
export interface InstalledAppInfo {
  name: string;
  displayName: string;
  version: string;
  installPath: string;
  installedAt: string;
  isRunning: boolean;
}

/** Internal state for a running app. */
interface RunningApp {
  name: string;
  displayName: string;
  url: string;
  launchType: "url" | "local" | "connect";
  launchedAt: string;
  port: number | null;
  serverHandle: AppServerHandle | null;
  plugin: Plugin;
}

/** Shape we expect from a dynamically-imported app package. */
interface AppModuleShape {
  default?: Plugin;
  plugin?: Plugin;
  [key: string]: Plugin | undefined;
}

// ---------------------------------------------------------------------------
// Port allocation
// ---------------------------------------------------------------------------

const PORT_RANGE_START = 19000;
const PORT_RANGE_END = 19100;
const allocatedPorts = new Set<number>();

/**
 * Find an available port in the app port range.
 * Checks both the internal allocation set and actual TCP availability.
 */
async function allocatePort(preferredPort?: number): Promise<number> {
  if (
    preferredPort &&
    preferredPort >= PORT_RANGE_START &&
    preferredPort <= PORT_RANGE_END
  ) {
    if (
      !allocatedPorts.has(preferredPort) &&
      (await isPortAvailable(preferredPort))
    ) {
      allocatedPorts.add(preferredPort);
      return preferredPort;
    }
  }

  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (allocatedPorts.has(port)) continue;
    if (await isPortAvailable(port)) {
      allocatedPorts.add(port);
      return port;
    }
  }

  throw new Error(
    `No available ports in range ${PORT_RANGE_START}-${PORT_RANGE_END}. ` +
      `${allocatedPorts.size} ports currently allocated.`,
  );
}

function releasePort(port: number): void {
  allocatedPorts.delete(port);
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

// ---------------------------------------------------------------------------
// Module resolution
// ---------------------------------------------------------------------------

/**
 * Dynamically import an installed app package and extract the Plugin export.
 */
async function importAppPlugin(
  installPath: string,
  packageName: string,
): Promise<Plugin> {
  const absPath = path.resolve(installPath);

  // npm layout: installPath/node_modules/@scope/name/
  // git layout: installPath/ is the package root
  const nmCandidate = path.join(
    absPath,
    "node_modules",
    ...packageName.split("/"),
  );
  let pkgRoot = absPath;

  const nmStat = await fs.stat(nmCandidate).catch(() => null);
  if (nmStat?.isDirectory()) {
    pkgRoot = nmCandidate;
  }

  const entryPoint = await resolvePackageEntry(pkgRoot);
  const mod = (await import(pathToFileURL(entryPoint).href)) as AppModuleShape;

  // Extract the Plugin — try default export, then named 'plugin' export
  const plugin = mod.default ?? mod.plugin;
  if (!plugin || typeof plugin.name !== "string") {
    throw new Error(
      `App package "${packageName}" does not export a valid Plugin. ` +
        `Expected a default or named 'plugin' export with a 'name' property.`,
    );
  }

  return plugin;
}

// ---------------------------------------------------------------------------
// AppManager
// ---------------------------------------------------------------------------

export class AppManager {
  private runningApps = new Map<string, RunningApp>();
  private runtime: AgentRuntime | null = null;

  /** Update the agent runtime reference (called when runtime restarts). */
  setRuntime(runtime: AgentRuntime | null): void {
    this.runtime = runtime;
  }

  // ── Registry queries ───────────────────────────────────────────────

  /** List all apps available in the registry. */
  async listAvailable(): Promise<RegistryAppInfo[]> {
    return registryListApps();
  }

  /** Search apps by query. */
  async search(query: string, limit = 15): Promise<RegistryAppInfo[]> {
    return registrySearchApps(query, limit);
  }

  /** Get detailed info about a specific app from the registry. */
  async getInfo(name: string): Promise<RegistryAppInfo | null> {
    return registryGetAppInfo(name);
  }

  // ── Installation ───────────────────────────────────────────────────

  /** Install an app package (delegates to plugin-installer). */
  async install(
    name: string,
    onProgress?: ProgressCallback,
  ): ReturnType<typeof installPlugin> {
    logger.info(`[app-manager] Installing app: ${name}`);
    return installPlugin(name, onProgress);
  }

  /** List installed apps (apps are plugins with kind "app" or name starting with "app-"). */
  listInstalled(): InstalledAppInfo[] {
    const config = loadMilaidyConfig();
    const installs = config.plugins?.installs ?? {};
    const apps: InstalledAppInfo[] = [];

    for (const [pluginName, record] of Object.entries(installs)) {
      // An installed plugin is an app if its name matches the @elizaos/app-* pattern
      if (!isAppPackageName(pluginName)) continue;

      apps.push({
        name: pluginName,
        displayName: pluginName
          .replace(/^@elizaos\/app-/, "")
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        version: record.version ?? "unknown",
        installPath: record.installPath ?? "",
        installedAt: record.installedAt ?? "",
        isRunning: this.runningApps.has(pluginName),
      });
    }

    return apps;
  }

  // ── Launch / Stop ──────────────────────────────────────────────────

  /**
   * Launch an app.
   *
   * 1. Loads the app plugin from the install path.
   * 2. Registers the plugin with the agent runtime (agent gains game abilities).
   * 3. For "local" apps: starts the game server on an allocated port.
   * 4. Returns the URL where the app is accessible.
   */
  async launch(name: string): Promise<AppLaunchResult> {
    if (this.runningApps.has(name)) {
      const running = this.runningApps.get(name);
      if (!running) throw new Error(`App "${name}" not found in running apps`);
      return {
        url: running.url,
        launchType: running.launchType,
        displayName: running.displayName,
      };
    }

    if (!this.runtime) {
      throw new Error(
        "Cannot launch app: no agent runtime is running. Start the agent first.",
      );
    }

    // Resolve the app's install path
    const config = loadMilaidyConfig();
    const installRecord = config.plugins?.installs?.[name];
    if (!installRecord?.installPath) {
      throw new Error(
        `App "${name}" is not installed. Run 'milaidy apps install ${name}' first.`,
      );
    }

    logger.info(`[app-manager] Launching app: ${name}`);

    // Dynamically import the app plugin
    const plugin = await importAppPlugin(installRecord.installPath, name);

    const appConfig = plugin.app;
    if (!appConfig) {
      throw new Error(
        `Package "${name}" is not an app — it does not export an 'app' configuration on its Plugin. ` +
          `It may be a regular plugin. Use 'milaidy plugins install' instead.`,
      );
    }

    // Register the plugin with the runtime — agent gains game actions/providers
    await this.runtime.registerPlugin(plugin);
    logger.info(
      `[app-manager] Plugin "${plugin.name}" registered with runtime (${plugin.actions?.length ?? 0} actions, ${plugin.providers?.length ?? 0} providers)`,
    );

    // Determine launch URL based on type
    const launchType = appConfig.launchType;
    let url: string;
    let port: number | null = null;
    let serverHandle: AppServerHandle | null = null;

    if (launchType === "local") {
      if (!appConfig.startServer) {
        throw new Error(
          `App "${name}" declares launchType "local" but does not provide a startServer function.`,
        );
      }

      port = await allocatePort(
        typeof appConfig.launchUrl === "string"
          ? extractPortFromUrl(appConfig.launchUrl)
          : undefined,
      );

      const milaidyUiPort = process.env.MILAIDY_UI_PORT || "2138";
      const corsOrigins = [
        `http://localhost:${milaidyUiPort}`,
        `http://127.0.0.1:${milaidyUiPort}`,
        `http://localhost:${port}`,
        `http://127.0.0.1:${port}`,
      ];

      logger.info(
        `[app-manager] Starting local server for "${name}" on port ${port}`,
      );

      serverHandle = await appConfig.startServer({
        port,
        agentRuntime: this.runtime,
        corsOrigins,
      });

      url = serverHandle.url;
      logger.info(`[app-manager] Local server started: ${url}`);
    } else if (launchType === "connect") {
      // "connect" type: the plugin's Service handles the WebSocket/API connection
      // to the external game server. We just open the client URL.
      url = appConfig.launchUrl ?? "";
      if (!url) {
        throw new Error(
          `App "${name}" declares launchType "connect" but has no launchUrl configured.`,
        );
      }
      logger.info(`[app-manager] Connect-type app, opening: ${url}`);
    } else {
      // "url" type: hosted platform, just open the URL
      url = appConfig.launchUrl ?? "";
      if (!url) {
        throw new Error(
          `App "${name}" declares launchType "url" but has no launchUrl configured.`,
        );
      }
      logger.info(`[app-manager] URL-type app, opening: ${url}`);
    }

    const displayName =
      appConfig.displayName ?? name.replace(/^@elizaos\/app-/, "");

    this.runningApps.set(name, {
      name,
      displayName,
      url,
      launchType,
      launchedAt: new Date().toISOString(),
      port,
      serverHandle,
      plugin,
    });

    return { url, launchType, displayName };
  }

  /**
   * Stop a running app.
   * Shuts down the local server (if any), releases the port, and removes from running list.
   */
  async stop(name: string): Promise<void> {
    const app = this.runningApps.get(name);
    if (!app) {
      logger.warn(`[app-manager] App "${name}" is not running`);
      return;
    }

    logger.info(`[app-manager] Stopping app: ${name}`);

    if (app.serverHandle) {
      await app.serverHandle.stop();
      logger.info(`[app-manager] Local server stopped for "${name}"`);
    }

    if (app.port !== null) {
      releasePort(app.port);
    }

    this.runningApps.delete(name);
  }

  /** Stop all running apps. Called during shutdown. */
  async stopAll(): Promise<void> {
    const names = [...this.runningApps.keys()];
    for (const name of names) {
      await this.stop(name);
    }
  }

  /** List all currently running apps. */
  listRunning(): RunningAppInfo[] {
    return [...this.runningApps.values()].map((app) => ({
      name: app.name,
      displayName: app.displayName,
      url: app.url,
      launchType: app.launchType,
      launchedAt: app.launchedAt,
      port: app.port,
    }));
  }

  /** Check if an app is currently running. */
  isRunning(name: string): boolean {
    return this.runningApps.has(name);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a package name follows the app naming convention. */
function isAppPackageName(name: string): boolean {
  return (
    name.startsWith("@elizaos/app-") ||
    name.startsWith("@elizaos-apps/") ||
    name.includes("/app-")
  );
}

/** Extract port number from a URL string. */
function extractPortFromUrl(url: string): number | undefined {
  const match = url.match(/:(\d+)/);
  return match ? Number(match[1]) : undefined;
}
