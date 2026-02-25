"use strict";
/**
 * Desktop Native Module for Electron
 *
 * Provides native desktop features:
 * - System tray management
 * - Global keyboard shortcuts
 * - Auto-launch on startup
 * - Window management
 * - Native notifications
 * - Power monitoring
 * - Clipboard operations
 * - Shell operations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DesktopManager = void 0;
exports.getDesktopManager = getDesktopManager;
exports.registerDesktopIPC = registerDesktopIPC;
const tslib_1 = require("tslib");
const node_fs_1 = tslib_1.__importDefault(require("node:fs"));
const node_path_1 = tslib_1.__importDefault(require("node:path"));
const electron_1 = require("electron");
/**
 * Desktop Manager - handles all native desktop features
 */
class DesktopManager {
  constructor() {
    this.mainWindow = null;
    this.tray = null;
    this.shortcuts = new Map();
    this.notifications = new Map();
    this.notificationCounter = 0;
    this.setupPowerMonitorEvents();
  }
  /**
   * Set the main window reference
   */
  setMainWindow(window) {
    this.mainWindow = window;
    this.setupWindowEvents();
  }
  getWindow() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      throw new Error("Main window not available");
    }
    return this.mainWindow;
  }
  // MARK: - System Tray
  async createTray(options) {
    if (this.tray) {
      this.tray.destroy();
    }
    const iconPath = this.resolveIconPath(options.icon);
    const icon = electron_1.nativeImage.createFromPath(iconPath);
    this.tray = new electron_1.Tray(icon);
    if (options.tooltip) {
      this.tray.setToolTip(options.tooltip);
    }
    if (options.title && process.platform === "darwin") {
      this.tray.setTitle(options.title);
    }
    if (options.menu) {
      this.setTrayMenu({ menu: options.menu });
    }
    this.setupTrayEvents();
  }
  async updateTray(options) {
    if (!this.tray) return;
    if (options.icon) {
      const iconPath = this.resolveIconPath(options.icon);
      const icon = electron_1.nativeImage.createFromPath(iconPath);
      this.tray.setImage(icon);
    }
    if (options.tooltip) {
      this.tray.setToolTip(options.tooltip);
    }
    if (options.title !== undefined && process.platform === "darwin") {
      this.tray.setTitle(options.title);
    }
    if (options.menu) {
      this.setTrayMenu({ menu: options.menu });
    }
  }
  async destroyTray() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
  setTrayMenu(options) {
    if (!this.tray) return;
    const template = this.buildMenuTemplate(options.menu);
    const menu = electron_1.Menu.buildFromTemplate(template);
    this.tray.setContextMenu(menu);
  }
  buildMenuTemplate(items) {
    return items.map((item) => {
      const menuItem = {
        id: item.id,
        label: item.label,
        type: item.type,
        checked: item.checked,
        enabled: item.enabled !== false,
        visible: item.visible !== false,
        accelerator: item.accelerator,
        click: () => {
          this.sendToRenderer("desktop:trayMenuClick", {
            itemId: item.id,
            checked: item.type === "checkbox" ? !item.checked : item.checked,
          });
        },
      };
      if (item.icon) {
        const iconPath = this.resolveIconPath(item.icon);
        if (node_fs_1.default.existsSync(iconPath)) {
          menuItem.icon = electron_1.nativeImage
            .createFromPath(iconPath)
            .resize({ width: 16, height: 16 });
        }
      }
      if (item.submenu) {
        menuItem.submenu = this.buildMenuTemplate(item.submenu);
      }
      return menuItem;
    });
  }
  setupTrayEvents() {
    if (!this.tray) return;
    this.tray.on("click", (event, bounds) => {
      this.sendToRenderer("desktop:trayClick", {
        x: bounds.x,
        y: bounds.y,
        button: "left",
        modifiers: {
          alt: event.altKey,
          shift: event.shiftKey,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
        },
      });
    });
    this.tray.on("double-click", (event, bounds) => {
      this.sendToRenderer("desktop:trayDoubleClick", {
        x: bounds.x,
        y: bounds.y,
        button: "left",
        modifiers: {
          alt: event.altKey,
          shift: event.shiftKey,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
        },
      });
    });
    this.tray.on("right-click", (event, bounds) => {
      this.sendToRenderer("desktop:trayRightClick", {
        x: bounds.x,
        y: bounds.y,
        button: "right",
        modifiers: {
          alt: event.altKey,
          shift: event.shiftKey,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
        },
      });
    });
  }
  // MARK: - Global Shortcuts
  async registerShortcut(options) {
    var _a;
    if (this.shortcuts.has(options.id)) {
      electron_1.globalShortcut.unregister(
        (_a = this.shortcuts.get(options.id)) === null || _a === void 0
          ? void 0
          : _a.accelerator,
      );
    }
    const success = electron_1.globalShortcut.register(
      options.accelerator,
      () => {
        this.sendToRenderer("desktop:shortcutPressed", {
          id: options.id,
          accelerator: options.accelerator,
        });
      },
    );
    if (success) {
      this.shortcuts.set(options.id, options);
    }
    return { success };
  }
  async unregisterShortcut(options) {
    const shortcut = this.shortcuts.get(options.id);
    if (shortcut) {
      electron_1.globalShortcut.unregister(shortcut.accelerator);
      this.shortcuts.delete(options.id);
    }
  }
  async unregisterAllShortcuts() {
    electron_1.globalShortcut.unregisterAll();
    this.shortcuts.clear();
  }
  async isShortcutRegistered(options) {
    return {
      registered: electron_1.globalShortcut.isRegistered(options.accelerator),
    };
  }
  // MARK: - Auto Launch
  async setAutoLaunch(options) {
    electron_1.app.setLoginItemSettings({
      openAtLogin: options.enabled,
      openAsHidden: options.openAsHidden,
    });
  }
  async getAutoLaunchStatus() {
    const settings = electron_1.app.getLoginItemSettings();
    return {
      enabled: settings.openAtLogin,
      openAsHidden: settings.openAsHidden || false,
    };
  }
  // MARK: - Window Management
  async setWindowOptions(options) {
    var _a, _b, _c, _d, _f, _g, _h, _j;
    const win = this.getWindow();
    if (options.width !== undefined || options.height !== undefined) {
      const bounds = win.getBounds();
      win.setSize(
        (_a = options.width) !== null && _a !== void 0 ? _a : bounds.width,
        (_b = options.height) !== null && _b !== void 0 ? _b : bounds.height,
      );
    }
    if (options.x !== undefined || options.y !== undefined) {
      const bounds = win.getBounds();
      win.setPosition(
        (_c = options.x) !== null && _c !== void 0 ? _c : bounds.x,
        (_d = options.y) !== null && _d !== void 0 ? _d : bounds.y,
      );
    }
    if (options.minWidth !== undefined || options.minHeight !== undefined) {
      win.setMinimumSize(
        (_f = options.minWidth) !== null && _f !== void 0 ? _f : 0,
        (_g = options.minHeight) !== null && _g !== void 0 ? _g : 0,
      );
    }
    if (options.maxWidth !== undefined || options.maxHeight !== undefined) {
      win.setMaximumSize(
        (_h = options.maxWidth) !== null && _h !== void 0 ? _h : 0,
        (_j = options.maxHeight) !== null && _j !== void 0 ? _j : 0,
      );
    }
    if (options.resizable !== undefined) win.setResizable(options.resizable);
    if (options.movable !== undefined) win.setMovable(options.movable);
    if (options.minimizable !== undefined)
      win.setMinimizable(options.minimizable);
    if (options.maximizable !== undefined)
      win.setMaximizable(options.maximizable);
    if (options.closable !== undefined) win.setClosable(options.closable);
    if (options.focusable !== undefined) win.setFocusable(options.focusable);
    if (options.alwaysOnTop !== undefined)
      win.setAlwaysOnTop(options.alwaysOnTop);
    if (options.fullscreen !== undefined) win.setFullScreen(options.fullscreen);
    if (options.fullscreenable !== undefined)
      win.setFullScreenable(options.fullscreenable);
    if (options.skipTaskbar !== undefined)
      win.setSkipTaskbar(options.skipTaskbar);
    if (options.opacity !== undefined) win.setOpacity(options.opacity);
    if (options.title !== undefined) win.setTitle(options.title);
    if (options.backgroundColor !== undefined)
      win.setBackgroundColor(options.backgroundColor);
    if (options.vibrancy !== undefined && process.platform === "darwin") {
      win.setVibrancy(options.vibrancy);
    }
  }
  async getWindowBounds() {
    return this.getWindow().getBounds();
  }
  async setWindowBounds(options) {
    this.getWindow().setBounds(options);
  }
  async minimizeWindow() {
    this.getWindow().minimize();
  }
  async maximizeWindow() {
    this.getWindow().maximize();
  }
  async unmaximizeWindow() {
    this.getWindow().unmaximize();
  }
  async closeWindow() {
    this.getWindow().close();
  }
  async showWindow() {
    this.getWindow().show();
  }
  async hideWindow() {
    this.getWindow().hide();
  }
  async focusWindow() {
    this.getWindow().focus();
  }
  async isWindowMaximized() {
    return { maximized: this.getWindow().isMaximized() };
  }
  async isWindowMinimized() {
    return { minimized: this.getWindow().isMinimized() };
  }
  async isWindowVisible() {
    return { visible: this.getWindow().isVisible() };
  }
  async isWindowFocused() {
    return { focused: this.getWindow().isFocused() };
  }
  async setAlwaysOnTop(options) {
    this.getWindow().setAlwaysOnTop(options.flag, options.level);
  }
  async setFullscreen(options) {
    this.getWindow().setFullScreen(options.flag);
  }
  async setOpacity(options) {
    this.getWindow().setOpacity(options.opacity);
  }
  setupWindowEvents() {
    if (!this.mainWindow) return;
    this.mainWindow.on("focus", () =>
      this.sendToRenderer("desktop:windowFocus"),
    );
    this.mainWindow.on("blur", () => this.sendToRenderer("desktop:windowBlur"));
    this.mainWindow.on("maximize", () =>
      this.sendToRenderer("desktop:windowMaximize"),
    );
    this.mainWindow.on("unmaximize", () =>
      this.sendToRenderer("desktop:windowUnmaximize"),
    );
    this.mainWindow.on("minimize", () =>
      this.sendToRenderer("desktop:windowMinimize"),
    );
    this.mainWindow.on("restore", () =>
      this.sendToRenderer("desktop:windowRestore"),
    );
    this.mainWindow.on("close", () =>
      this.sendToRenderer("desktop:windowClose"),
    );
  }
  // MARK: - Notifications
  async showNotification(options) {
    const id = `notification_${++this.notificationCounter}`;
    const notification = new electron_1.Notification({
      title: options.title,
      body: options.body,
      icon: options.icon ? this.resolveIconPath(options.icon) : undefined,
      silent: options.silent,
      urgency: options.urgency,
      timeoutType: options.timeoutType,
      actions: options.actions,
      closeButtonText: options.closeButtonText,
      hasReply: options.hasReply,
      replyPlaceholder: options.replyPlaceholder,
    });
    notification.on("click", () => {
      this.sendToRenderer("desktop:notificationClick", { id });
    });
    notification.on("action", (_event, index) => {
      var _a, _b;
      this.sendToRenderer("desktop:notificationAction", {
        id,
        action:
          (_b =
            (_a = options.actions) === null || _a === void 0
              ? void 0
              : _a[index]) === null || _b === void 0
            ? void 0
            : _b.text,
      });
    });
    notification.on("reply", (_event, reply) => {
      this.sendToRenderer("desktop:notificationReply", { id, reply });
    });
    notification.on("close", () => {
      this.notifications.delete(id);
    });
    this.notifications.set(id, notification);
    notification.show();
    return { id };
  }
  async closeNotification(options) {
    const notification = this.notifications.get(options.id);
    if (notification) {
      notification.close();
      this.notifications.delete(options.id);
    }
  }
  // MARK: - Power Monitor
  async getPowerState() {
    const idleTime = electron_1.powerMonitor.getSystemIdleTime();
    const idleState = electron_1.powerMonitor.getSystemIdleState(60);
    // Note: Battery info not available on all platforms
    let onBattery = false;
    try {
      onBattery = electron_1.powerMonitor.isOnBatteryPower();
    } catch (_a) {
      // Not supported
    }
    return {
      onBattery,
      idleState,
      idleTime,
    };
  }
  setupPowerMonitorEvents() {
    electron_1.powerMonitor.on("suspend", () =>
      this.sendToRenderer("desktop:powerSuspend"),
    );
    electron_1.powerMonitor.on("resume", () =>
      this.sendToRenderer("desktop:powerResume"),
    );
    electron_1.powerMonitor.on("on-ac", () =>
      this.sendToRenderer("desktop:powerOnAC"),
    );
    electron_1.powerMonitor.on("on-battery", () =>
      this.sendToRenderer("desktop:powerOnBattery"),
    );
  }
  // MARK: - App
  async quit() {
    electron_1.app.quit();
  }
  async relaunch() {
    electron_1.app.relaunch();
    electron_1.app.exit(0);
  }
  async getVersion() {
    return {
      version: electron_1.app.getVersion(),
      name: electron_1.app.getName(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    };
  }
  async isPackaged() {
    return { packaged: electron_1.app.isPackaged };
  }
  async getPath(options) {
    return {
      path: electron_1.app.getPath(options.name),
    };
  }
  // MARK: - Clipboard
  async writeToClipboard(options) {
    if (options.text) {
      electron_1.clipboard.writeText(options.text);
    } else if (options.html) {
      electron_1.clipboard.writeHTML(options.html);
    } else if (options.rtf) {
      electron_1.clipboard.writeRTF(options.rtf);
    } else if (options.image) {
      const img = electron_1.nativeImage.createFromDataURL(options.image);
      electron_1.clipboard.writeImage(img);
    }
  }
  async readFromClipboard() {
    return {
      text: electron_1.clipboard.readText(),
      html: electron_1.clipboard.readHTML(),
      rtf: electron_1.clipboard.readRTF(),
      hasImage: !electron_1.clipboard.readImage().isEmpty(),
    };
  }
  async clearClipboard() {
    electron_1.clipboard.clear();
  }
  // SECURITY: restrict to http/https to prevent the renderer from opening
  // arbitrary protocol handlers (file://, smb://, custom schemes) that could
  // execute code or access local resources.
  async openExternal(options) {
    const url = typeof options.url === "string" ? options.url.trim() : "";
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(
          `Blocked openExternal for non-http(s) URL: ${parsed.protocol}`,
        );
      }
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error(`Invalid URL passed to openExternal: ${url}`);
      }
      throw err;
    }
    await electron_1.shell.openExternal(url);
  }
  // SECURITY: require an absolute path to prevent relative path confusion.
  // shell.showItemInFolder reveals the item in the OS file manager (no execution).
  async showItemInFolder(options) {
    const p = typeof options.path === "string" ? options.path.trim() : "";
    if (!p || !node_path_1.default.isAbsolute(p)) {
      throw new Error("showItemInFolder requires an absolute path");
    }
    electron_1.shell.showItemInFolder(p);
  }
  async beep() {
    electron_1.shell.beep();
  }
  // MARK: - Helpers
  resolveIconPath(iconPath) {
    if (node_path_1.default.isAbsolute(iconPath)) {
      return iconPath;
    }
    // Try relative to app resources
    const resourcePath = node_path_1.default.join(
      electron_1.app.getAppPath(),
      iconPath,
    );
    if (node_fs_1.default.existsSync(resourcePath)) {
      return resourcePath;
    }
    // Try relative to electron assets
    const assetsPath = node_path_1.default.join(
      electron_1.app.getAppPath(),
      "assets",
      iconPath,
    );
    if (node_fs_1.default.existsSync(assetsPath)) {
      return assetsPath;
    }
    return iconPath;
  }
  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
  /**
   * Clean up resources
   */
  dispose() {
    this.unregisterAllShortcuts();
    this.destroyTray();
    for (const notification of this.notifications.values()) {
      notification.close();
    }
    this.notifications.clear();
  }
}
exports.DesktopManager = DesktopManager;
// Singleton instance
let desktopManager = null;
function getDesktopManager() {
  if (!desktopManager) {
    desktopManager = new DesktopManager();
  }
  return desktopManager;
}
/**
 * Register all Desktop IPC handlers
 */
function registerDesktopIPC() {
  const manager = getDesktopManager();
  // Tray
  electron_1.ipcMain.handle("desktop:createTray", (_e, options) =>
    manager.createTray(options),
  );
  electron_1.ipcMain.handle("desktop:updateTray", (_e, options) =>
    manager.updateTray(options),
  );
  electron_1.ipcMain.handle("desktop:destroyTray", () => manager.destroyTray());
  electron_1.ipcMain.handle("desktop:setTrayMenu", (_e, options) =>
    manager.setTrayMenu(options),
  );
  // Shortcuts
  electron_1.ipcMain.handle("desktop:registerShortcut", (_e, options) =>
    manager.registerShortcut(options),
  );
  electron_1.ipcMain.handle("desktop:unregisterShortcut", (_e, options) =>
    manager.unregisterShortcut(options),
  );
  electron_1.ipcMain.handle("desktop:unregisterAllShortcuts", () =>
    manager.unregisterAllShortcuts(),
  );
  electron_1.ipcMain.handle("desktop:isShortcutRegistered", (_e, options) =>
    manager.isShortcutRegistered(options),
  );
  // Auto Launch
  electron_1.ipcMain.handle("desktop:setAutoLaunch", (_e, options) =>
    manager.setAutoLaunch(options),
  );
  electron_1.ipcMain.handle("desktop:getAutoLaunchStatus", () =>
    manager.getAutoLaunchStatus(),
  );
  // Window
  electron_1.ipcMain.handle("desktop:setWindowOptions", (_e, options) =>
    manager.setWindowOptions(options),
  );
  electron_1.ipcMain.handle("desktop:getWindowBounds", () =>
    manager.getWindowBounds(),
  );
  electron_1.ipcMain.handle("desktop:setWindowBounds", (_e, options) =>
    manager.setWindowBounds(options),
  );
  electron_1.ipcMain.handle("desktop:minimizeWindow", () =>
    manager.minimizeWindow(),
  );
  electron_1.ipcMain.handle("desktop:maximizeWindow", () =>
    manager.maximizeWindow(),
  );
  electron_1.ipcMain.handle("desktop:unmaximizeWindow", () =>
    manager.unmaximizeWindow(),
  );
  electron_1.ipcMain.handle("desktop:closeWindow", () => manager.closeWindow());
  electron_1.ipcMain.handle("desktop:showWindow", () => manager.showWindow());
  electron_1.ipcMain.handle("desktop:hideWindow", () => manager.hideWindow());
  electron_1.ipcMain.handle("desktop:focusWindow", () => manager.focusWindow());
  electron_1.ipcMain.handle("desktop:isWindowMaximized", () =>
    manager.isWindowMaximized(),
  );
  electron_1.ipcMain.handle("desktop:isWindowMinimized", () =>
    manager.isWindowMinimized(),
  );
  electron_1.ipcMain.handle("desktop:isWindowVisible", () =>
    manager.isWindowVisible(),
  );
  electron_1.ipcMain.handle("desktop:isWindowFocused", () =>
    manager.isWindowFocused(),
  );
  electron_1.ipcMain.handle("desktop:setAlwaysOnTop", (_e, options) =>
    manager.setAlwaysOnTop(options),
  );
  electron_1.ipcMain.handle("desktop:setFullscreen", (_e, options) =>
    manager.setFullscreen(options),
  );
  electron_1.ipcMain.handle("desktop:setOpacity", (_e, options) =>
    manager.setOpacity(options),
  );
  // Notifications
  electron_1.ipcMain.handle("desktop:showNotification", (_e, options) =>
    manager.showNotification(options),
  );
  electron_1.ipcMain.handle("desktop:closeNotification", (_e, options) =>
    manager.closeNotification(options),
  );
  // Power
  electron_1.ipcMain.handle("desktop:getPowerState", () =>
    manager.getPowerState(),
  );
  // App
  electron_1.ipcMain.handle("desktop:quit", () => manager.quit());
  electron_1.ipcMain.handle("desktop:relaunch", () => manager.relaunch());
  electron_1.ipcMain.handle("desktop:getVersion", () => manager.getVersion());
  electron_1.ipcMain.handle("desktop:isPackaged", () => manager.isPackaged());
  electron_1.ipcMain.handle("desktop:getPath", (_e, options) =>
    manager.getPath(options),
  );
  // Clipboard
  electron_1.ipcMain.handle("desktop:writeToClipboard", (_e, options) =>
    manager.writeToClipboard(options),
  );
  electron_1.ipcMain.handle("desktop:readFromClipboard", () =>
    manager.readFromClipboard(),
  );
  electron_1.ipcMain.handle("desktop:clearClipboard", () =>
    manager.clearClipboard(),
  );
  // Shell
  electron_1.ipcMain.handle("desktop:openExternal", (_e, options) =>
    manager.openExternal(options),
  );
  electron_1.ipcMain.handle("desktop:showItemInFolder", (_e, options) =>
    manager.showItemInFolder(options),
  );
  electron_1.ipcMain.handle("desktop:beep", () => manager.beep());
}
