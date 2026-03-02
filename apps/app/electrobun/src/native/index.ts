/**
 * Native Module Registry — Electrobun
 *
 * Replaces the Electron ipcMain.handle() pattern with a unified
 * dispatch map. The IPC server calls dispatch(channel, args).
 */

import { handle } from "../ipc-server";
import { agentHandlers, getAgentManager } from "./agent";
import { cameraHandlers, getCameraManager } from "./camera";
import { canvasHandlers, getCanvasManager } from "./canvas";
import { desktopHandlers, getDesktopManager } from "./desktop";
import { gatewayHandlers, getGatewayDiscovery } from "./gateway";
import { getLocationManager, locationHandlers } from "./location";
import { getPermissionManager, permissionsHandlers } from "./permissions";
import {
  getScreenCaptureManager,
  screenCaptureHandlers,
} from "./screencapture";
import { getSwabbleManager, swabbleHandlers } from "./swabble";
import { getTalkModeManager, talkModeHandlers } from "./talkmode";

// Re-export managers for use in index.ts
export {
  getAgentManager,
  getCameraManager,
  getCanvasManager,
  getDesktopManager,
  getGatewayDiscovery,
  getLocationManager,
  getPermissionManager,
  getScreenCaptureManager,
  getSwabbleManager,
  getTalkModeManager,
};

/** LIFO (always-on-top PIP) handlers — implemented inline, no Electron dep */
const lifoHandlers: Record<string, (args: unknown[]) => Promise<unknown>> = {
  "lifo:setPip": async ([options]) => {
    const opts = (options ?? {}) as { flag?: boolean; level?: string };
    const desktop = getDesktopManager();
    if (opts.flag) {
      await desktop.setAlwaysOnTop({
        flag: true,
        level: opts.level ?? "floating",
      });
    } else {
      await desktop.setAlwaysOnTop({ flag: false });
    }
    return { enabled: opts.flag === true };
  },
  "lifo:getPipState": async () => {
    // Approximate: always return false since we can't query it from Electrobun
    return { enabled: false };
  },
};

/** Context menu event-push handlers — sends data back to the renderer */
const contextMenuHandlers: Record<
  string,
  (args: unknown[]) => Promise<unknown>
> = {
  "contextMenu:saveAsCommand": ([data]) => Promise.resolve(data),
  "contextMenu:askAgent": ([data]) => Promise.resolve(data),
  "contextMenu:createSkill": ([data]) => Promise.resolve(data),
  "contextMenu:quoteInChat": ([data]) => Promise.resolve(data),
};

const ALL_HANDLERS: Record<string, (args: unknown[]) => Promise<unknown>> = {
  ...agentHandlers,
  ...cameraHandlers,
  ...canvasHandlers,
  ...desktopHandlers,
  ...gatewayHandlers,
  ...locationHandlers,
  ...permissionsHandlers,
  ...screenCaptureHandlers,
  ...swabbleHandlers,
  ...talkModeHandlers,
  ...lifoHandlers,
  ...contextMenuHandlers,
};

/**
 * Register all IPC handlers with the WebSocket IPC server.
 * Call once after startIpcServer().
 */
export function registerAllIPC(): void {
  for (const [channel, handler] of Object.entries(ALL_HANDLERS)) {
    handle(channel, handler);
  }
  console.info(`[IPC] Registered ${Object.keys(ALL_HANDLERS).length} channels`);
}

/**
 * Initialize managers that need a window reference.
 * In Electrobun these are no-ops since push events go through WebSocket.
 */
export function initializeNativeModules(win: unknown): void {
  getDesktopManager().setMainWindow(win);
  // Others don't need a window reference in Electrobun
}

/** Dispose all native modules on quit. */
export function disposeNativeModules(): void {
  getAgentManager().dispose();
  getDesktopManager().dispose();
  getGatewayDiscovery().dispose();
  getTalkModeManager().dispose();
  getSwabbleManager().dispose();
  getScreenCaptureManager().dispose();
  getLocationManager().dispose();
  getCameraManager().dispose();
  getCanvasManager().dispose();
  getPermissionManager().dispose();
}
