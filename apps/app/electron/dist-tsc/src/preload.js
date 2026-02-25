"use strict";
/**
 * Electron Preload Script
 *
 * Exposes native functionality to the renderer process via contextBridge.
 * This is the secure bridge between Node.js and the web context.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Load Capacitor runtime (optional — don't let it crash the preload)
try {
  require("./rt/electron-rt");
} catch (_a) {
  // Capacitor runtime not available — non-fatal
}
const ipcListenerRegistry = new Map();
function getWrappedListener(channel, listener) {
  let channelRegistry = ipcListenerRegistry.get(channel);
  if (!channelRegistry) {
    channelRegistry = new WeakMap();
    ipcListenerRegistry.set(channel, channelRegistry);
  }
  const existing = channelRegistry.get(listener);
  if (existing) return existing;
  const wrapped = (_event, ...args) => {
    listener(...args);
  };
  channelRegistry.set(listener, wrapped);
  return wrapped;
}
function clearWrappedListener(channel, listener) {
  const channelRegistry = ipcListenerRegistry.get(channel);
  if (!channelRegistry) return;
  channelRegistry.delete(listener);
}
/**
 * IPC Renderer wrapper with type safety
 */
const electronAPI = {
  ipcRenderer: {
    invoke: (channel, ...args) =>
      electron_1.ipcRenderer.invoke(channel, ...args),
    send: (channel, ...args) => electron_1.ipcRenderer.send(channel, ...args),
    on: (channel, listener) => {
      electron_1.ipcRenderer.on(channel, getWrappedListener(channel, listener));
    },
    once: (channel, listener) => {
      const wrapped = (_event, ...args) => {
        clearWrappedListener(channel, listener);
        listener(...args);
      };
      let channelRegistry = ipcListenerRegistry.get(channel);
      if (!channelRegistry) {
        channelRegistry = new WeakMap();
        ipcListenerRegistry.set(channel, channelRegistry);
      }
      channelRegistry.set(listener, wrapped);
      electron_1.ipcRenderer.once(channel, wrapped);
    },
    removeListener: (channel, listener) => {
      var _a;
      const wrapped =
        (_a = ipcListenerRegistry.get(channel)) === null || _a === void 0
          ? void 0
          : _a.get(listener);
      if (!wrapped) return;
      electron_1.ipcRenderer.removeListener(channel, wrapped);
      clearWrappedListener(channel, listener);
    },
    removeAllListeners: (channel) => {
      electron_1.ipcRenderer.removeAllListeners(channel);
      ipcListenerRegistry.delete(channel);
    },
  },
  /**
   * Desktop Capturer for screen capture (via IPC — desktopCapturer
   * was removed from preload/renderer in Electron 36+)
   */
  desktopCapturer: {
    getSources: async (_options) => {
      var _a;
      const result = await electron_1.ipcRenderer.invoke(
        "screencapture:getSources",
      );
      return (_a =
        result === null || result === void 0 ? void 0 : result.sources) !==
        null && _a !== void 0
        ? _a
        : [];
    },
  },
  /**
   * Platform information
   */
  platform: {
    isMac: process.platform === "darwin",
    isWindows: process.platform === "win32",
    isLinux: process.platform === "linux",
    arch: process.arch,
    version: process.getSystemVersion(),
  },
};
// Expose to renderer
electron_1.contextBridge.exposeInMainWorld("electron", electronAPI);
