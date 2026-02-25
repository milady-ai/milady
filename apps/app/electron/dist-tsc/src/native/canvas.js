"use strict";
/**
 * Canvas Native Module for Electron
 *
 * Provides a BrowserWindow-based "canvas" for web navigation, JS evaluation,
 * page snapshots, and A2UI message injection.  Each canvas is a separate
 * BrowserWindow (not the main app window).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanvasManager = void 0;
exports.getCanvasManager = getCanvasManager;
exports.registerCanvasIPC = registerCanvasIPC;
const electron_1 = require("electron");
// ── Manager ─────────────────────────────────────────────────────────────────
/**
 * Canvas Manager – creates / controls one or more auxiliary BrowserWindows.
 */
class CanvasManager {
  constructor() {
    this.mainWindow = null;
    this.windows = new Map();
    this.counter = 0;
  }
  setMainWindow(window) {
    this.mainWindow = window;
  }
  // ── Window lifecycle ────────────────────────────────────────────────────
  getWindow(id) {
    const win = this.windows.get(id);
    if (!win || win.isDestroyed()) {
      throw new Error(`Canvas window "${id}" not found or destroyed`);
    }
    return win;
  }
  /** Create a new canvas BrowserWindow and return its id. */
  async createWindow(options) {
    var _a, _b, _c, _d;
    const id = `canvas_${++this.counter}`;
    const win = new electron_1.BrowserWindow({
      width:
        (_a =
          options === null || options === void 0 ? void 0 : options.width) !==
          null && _a !== void 0
          ? _a
          : 1280,
      height:
        (_b =
          options === null || options === void 0 ? void 0 : options.height) !==
          null && _b !== void 0
          ? _b
          : 720,
      x: options === null || options === void 0 ? void 0 : options.x,
      y: options === null || options === void 0 ? void 0 : options.y,
      show:
        (_c =
          options === null || options === void 0 ? void 0 : options.show) !==
          null && _c !== void 0
          ? _c
          : false,
      title:
        (_d =
          options === null || options === void 0 ? void 0 : options.title) !==
          null && _d !== void 0
          ? _d
          : "Canvas",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        javascript: true,
      },
    });
    // Forward page-level events to the main renderer so the plugin layer can
    // surface them as Capacitor listeners.
    win.webContents.on("did-finish-load", () => {
      this.sendToRenderer("canvas:didFinishLoad", {
        windowId: id,
        url: win.webContents.getURL(),
      });
    });
    win.webContents.on("did-fail-load", (_ev, code, desc) => {
      this.sendToRenderer("canvas:didFailLoad", {
        windowId: id,
        errorCode: code,
        errorDescription: desc,
      });
    });
    win.on("closed", () => {
      this.windows.delete(id);
      this.sendToRenderer("canvas:windowClosed", { windowId: id });
    });
    this.windows.set(id, win);
    if (options === null || options === void 0 ? void 0 : options.url) {
      await win.loadURL(options.url);
    }
    return { windowId: id };
  }
  /** Close and dispose a canvas window. */
  async destroyWindow(options) {
    const win = this.getWindow(options.windowId);
    win.close();
    this.windows.delete(options.windowId);
  }
  // ── Navigation ──────────────────────────────────────────────────────────
  /** Navigate the canvas window to a URL. */
  async navigate(options) {
    const win = this.getWindow(options.windowId);
    await win.loadURL(options.url);
  }
  // ── JavaScript evaluation ───────────────────────────────────────────────
  /** Execute arbitrary JavaScript in the canvas page and return the result. */
  async eval(options) {
    const win = this.getWindow(options.windowId);
    const result = await win.webContents.executeJavaScript(
      options.script,
      true,
    );
    return { result };
  }
  // ── Snapshot ────────────────────────────────────────────────────────────
  /** Capture a screenshot of the canvas page. */
  async snapshot(options) {
    var _a, _b;
    const win = this.getWindow(options.windowId);
    const rect = options.rect
      ? {
          x: options.rect.x,
          y: options.rect.y,
          width: options.rect.width,
          height: options.rect.height,
        }
      : undefined;
    const image = await win.webContents.capturePage(rect);
    const format = (_a = options.format) !== null && _a !== void 0 ? _a : "png";
    const size = image.getSize();
    let base64;
    if (format === "jpeg") {
      base64 = image
        .toJPEG((_b = options.quality) !== null && _b !== void 0 ? _b : 90)
        .toString("base64");
    } else {
      base64 = image.toPNG().toString("base64");
    }
    return { base64, format, width: size.width, height: size.height };
  }
  // ── A2UI ────────────────────────────────────────────────────────────────
  /** Inject an A2UI message payload into the canvas page. */
  async a2uiPush(options) {
    const win = this.getWindow(options.windowId);
    const json = JSON.stringify(options.payload);
    await win.webContents.executeJavaScript(
      `if (window.miladyA2UI && typeof window.miladyA2UI.push === 'function') { window.miladyA2UI.push(${json}); }`,
    );
  }
  /** Reset the A2UI state on the canvas page. */
  async a2uiReset(options) {
    const win = this.getWindow(options.windowId);
    await win.webContents.executeJavaScript(
      `if (window.miladyA2UI && typeof window.miladyA2UI.reset === 'function') { window.miladyA2UI.reset(); }`,
    );
  }
  // ── Visibility / geometry ───────────────────────────────────────────────
  async show(options) {
    this.getWindow(options.windowId).show();
  }
  async hide(options) {
    this.getWindow(options.windowId).hide();
  }
  async resize(options) {
    const win = this.getWindow(options.windowId);
    win.setSize(options.width, options.height, options.animate);
  }
  async focus(options) {
    this.getWindow(options.windowId).focus();
  }
  async getBounds(options) {
    return { bounds: this.getWindow(options.windowId).getBounds() };
  }
  async setBounds(options) {
    this.getWindow(options.windowId).setBounds(options.bounds);
  }
  // ── Query ───────────────────────────────────────────────────────────────
  async listWindows() {
    const list = [];
    for (const [id, win] of this.windows) {
      if (win.isDestroyed()) continue;
      list.push({
        id,
        url: win.webContents.getURL(),
        title: win.getTitle(),
        visible: win.isVisible(),
        bounds: win.getBounds(),
      });
    }
    return { windows: list };
  }
  // ── Cleanup ─────────────────────────────────────────────────────────────
  dispose() {
    for (const [_id, win] of this.windows) {
      if (!win.isDestroyed()) win.close();
    }
    this.windows.clear();
  }
  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}
exports.CanvasManager = CanvasManager;
// ── Singleton & IPC ─────────────────────────────────────────────────────────
let canvasManager = null;
function getCanvasManager() {
  if (!canvasManager) {
    canvasManager = new CanvasManager();
  }
  return canvasManager;
}
function registerCanvasIPC() {
  const m = getCanvasManager();
  // Lifecycle
  electron_1.ipcMain.handle("canvas:createWindow", async (_e, opts) =>
    m.createWindow(opts),
  );
  electron_1.ipcMain.handle("canvas:destroyWindow", async (_e, opts) =>
    m.destroyWindow(opts),
  );
  // Navigation / eval
  electron_1.ipcMain.handle("canvas:navigate", async (_e, opts) =>
    m.navigate(opts),
  );
  electron_1.ipcMain.handle("canvas:eval", async (_e, opts) => m.eval(opts));
  // Snapshot
  electron_1.ipcMain.handle("canvas:snapshot", async (_e, opts) =>
    m.snapshot(opts),
  );
  // A2UI
  electron_1.ipcMain.handle("canvas:a2uiPush", async (_e, opts) =>
    m.a2uiPush(opts),
  );
  electron_1.ipcMain.handle("canvas:a2uiReset", async (_e, opts) =>
    m.a2uiReset(opts),
  );
  // Visibility / geometry
  electron_1.ipcMain.handle("canvas:show", async (_e, opts) => m.show(opts));
  electron_1.ipcMain.handle("canvas:hide", async (_e, opts) => m.hide(opts));
  electron_1.ipcMain.handle("canvas:resize", async (_e, opts) =>
    m.resize(opts),
  );
  electron_1.ipcMain.handle("canvas:focus", async (_e, opts) => m.focus(opts));
  electron_1.ipcMain.handle("canvas:getBounds", async (_e, opts) =>
    m.getBounds(opts),
  );
  electron_1.ipcMain.handle("canvas:setBounds", async (_e, opts) =>
    m.setBounds(opts),
  );
  // Query
  electron_1.ipcMain.handle("canvas:listWindows", async () => m.listWindows());
}
