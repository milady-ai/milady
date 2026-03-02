/**
 * Desktop Native Module — Electrobun
 *
 * Provides native desktop features using Electrobun APIs.
 * Adapted from apps/app/electron/src/native/desktop.ts.
 *
 * Covered: tray, global shortcuts, auto-launch (login items), window
 *          management, notifications, clipboard, shell operations.
 * Not available in Electrobun yet: power monitor events.
 */

import { exec, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  ApplicationMenu,
  BrowserWindow,
  type MenuItemConfig,
  ContextMenu,
  GlobalShortcut,
  Tray,
  Utils,
} from "electrobun";
import { pushToRenderer } from "../ipc-server";
import type { IpcValue } from "./ipc-types";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Types (kept identical to Electron version for API compatibility)
// ---------------------------------------------------------------------------

interface TrayMenuItem {
  id: string;
  label?: string;
  type?: "normal" | "separator" | "checkbox" | "radio";
  checked?: boolean;
  enabled?: boolean;
  visible?: boolean;
  icon?: string;
  accelerator?: string;
  submenu?: TrayMenuItem[];
}

interface TrayOptions {
  icon: string;
  tooltip?: string;
  title?: string;
  menu?: TrayMenuItem[];
}

interface ShortcutOptions {
  id: string;
  accelerator: string;
  enabled?: boolean;
}

interface NotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  silent?: boolean;
}

interface WindowOptions {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  resizable?: boolean;
  alwaysOnTop?: boolean;
  fullscreen?: boolean;
  opacity?: number;
  title?: string;
}

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ClipboardWriteOptions {
  text?: string;
  html?: string;
  image?: string;
}

// ---------------------------------------------------------------------------
// DesktopManager
// ---------------------------------------------------------------------------

export class DesktopManager {
  private mainWindow: InstanceType<typeof BrowserWindow> | null = null;
  private tray: InstanceType<typeof Tray> | null = null;
  private shortcuts = new Map<string, ShortcutOptions>();
  private notificationCounter = 0;

  /** Set main window reference (used for window management methods). */
  setMainWindow(win: unknown): void {
    this.mainWindow = win as InstanceType<typeof BrowserWindow>;
  }

  // MARK: Tray

  async createTray(options: TrayOptions): Promise<void> {
    if (this.tray) {
      this.tray.remove();
      this.tray = null;
    }

    this.tray = new Tray({
      image: this.resolveIconPath(options.icon),
      title: options.title,
    });

    if (options.menu) {
      this.setTrayMenu({ menu: options.menu });
    }

    this.tray.on("tray-clicked", () => {
      this.send("desktop:trayClick", { button: "left" });
    });
  }

  async updateTray(options: Partial<TrayOptions>): Promise<void> {
    if (!this.tray) return;
    if (options.icon) this.tray.setImage(this.resolveIconPath(options.icon));
    if (options.title !== undefined) this.tray.setTitle(options.title ?? "");
    if (options.menu) this.setTrayMenu({ menu: options.menu });
  }

  async destroyTray(): Promise<void> {
    if (this.tray) {
      this.tray.remove();
      this.tray = null;
    }
  }

  setTrayMenu(options: { menu: TrayMenuItem[] }): void {
    if (!this.tray) return;
    this.tray.setMenu(this.buildMenuItems(options.menu));
  }

  private buildMenuItems(items: TrayMenuItem[]): MenuItemConfig[] {
    return items.map((item): MenuItemConfig => {
      if (item.type === "separator") return { type: "separator" };
      return {
        type: "normal",
        label: item.label ?? "",
        checked: item.checked,
        enabled: item.enabled !== false,
        action: item.id,
        submenu: item.submenu ? this.buildMenuItems(item.submenu) : undefined,
      };
    });
  }

  // MARK: Global Shortcuts

  async registerShortcut(options: ShortcutOptions): Promise<{ success: boolean }> {
    if (this.shortcuts.has(options.id)) {
      // Unregister previous binding for this id
      const prev = this.shortcuts.get(options.id)!;
      GlobalShortcut.unregister(prev.accelerator);
    }

    const success = GlobalShortcut.register(options.accelerator, () => {
      this.send("desktop:shortcutPressed", {
        id: options.id,
        accelerator: options.accelerator,
      });
    });

    if (success) {
      this.shortcuts.set(options.id, options);
    }

    return { success };
  }

  async unregisterShortcut(options: { id: string }): Promise<void> {
    const shortcut = this.shortcuts.get(options.id);
    if (shortcut) {
      GlobalShortcut.unregister(shortcut.accelerator);
      this.shortcuts.delete(options.id);
    }
  }

  async unregisterAllShortcuts(): Promise<void> {
    GlobalShortcut.unregisterAll();
    this.shortcuts.clear();
  }

  async isShortcutRegistered(options: { accelerator: string }): Promise<{ registered: boolean }> {
    return { registered: GlobalShortcut.isRegistered(options.accelerator) };
  }

  // MARK: Auto-launch

  async setAutoLaunch(options: { enabled: boolean; openAsHidden?: boolean }): Promise<void> {
    // Platform-specific auto-launch — best-effort
    if (process.platform === "darwin") {
      const flag = options.enabled ? "--background" : "";
      const appPath = process.execPath;
      const script = options.enabled
        ? `osascript -e 'tell application "System Events" to make login item at end with properties {path:"${appPath}", hidden:${options.openAsHidden ? "true" : "false"}}'`
        : `osascript -e 'tell application "System Events" to delete login item "Milady"'`;
      await execAsync(script).catch(() => {});
    } else if (process.platform === "linux") {
      const autostartDir = path.join(process.env.HOME ?? "", ".config", "autostart");
      const desktopFile = path.join(autostartDir, "milady.desktop");
      if (options.enabled) {
        fs.mkdirSync(autostartDir, { recursive: true });
        fs.writeFileSync(
          desktopFile,
          `[Desktop Entry]\nType=Application\nName=Milady\nExec=${process.execPath}\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\n`,
        );
      } else {
        try { fs.unlinkSync(desktopFile); } catch { /* ignore */ }
      }
    }
    // Windows: registry-based (omitted for now)
  }

  async getAutoLaunchStatus(): Promise<{ enabled: boolean; openAsHidden: boolean }> {
    // Simplified: always return false on non-darwin platforms
    if (process.platform === "darwin") {
      try {
        const { stdout } = await execAsync(
          `osascript -e 'tell application "System Events" to get login item "Milady"'`,
          { timeout: 3000 },
        );
        return { enabled: stdout.trim().length > 0, openAsHidden: false };
      } catch {
        return { enabled: false, openAsHidden: false };
      }
    }
    if (process.platform === "linux") {
      const desktopFile = path.join(
        process.env.HOME ?? "",
        ".config",
        "autostart",
        "milady.desktop",
      );
      return { enabled: fs.existsSync(desktopFile), openAsHidden: false };
    }
    return { enabled: false, openAsHidden: false };
  }

  // MARK: Window management

  async setWindowOptions(options: WindowOptions): Promise<void> {
    const win = this.mainWindow;
    if (!win) return;
    if (options.width !== undefined || options.height !== undefined) {
      const size = win.getSize();
      win.setSize(
        options.width ?? size.width,
        options.height ?? size.height,
      );
    }
    if (options.x !== undefined || options.y !== undefined) {
      const pos = win.getPosition();
      win.setPosition(options.x ?? pos.x, options.y ?? pos.y);
    }
    if (options.alwaysOnTop !== undefined) win.setAlwaysOnTop(options.alwaysOnTop);
    if (options.fullscreen !== undefined) win.setFullScreen(options.fullscreen);
    if (options.title !== undefined) win.setTitle(options.title);
  }

  async getWindowBounds(): Promise<WindowBounds> {
    const win = this.mainWindow;
    if (!win) return { x: 0, y: 0, width: 1200, height: 800 };
    const pos = win.getPosition();
    const size = win.getSize();
    return { x: pos.x, y: pos.y, width: size.width, height: size.height };
  }

  async setWindowBounds(options: WindowBounds): Promise<void> {
    const win = this.mainWindow;
    if (!win) return;
    win.setPosition(options.x, options.y);
    win.setSize(options.width, options.height);
  }

  async minimizeWindow(): Promise<void> { this.mainWindow?.minimize(); }
  async maximizeWindow(): Promise<void> { this.mainWindow?.maximize(); }
  async unmaximizeWindow(): Promise<void> { this.mainWindow?.unmaximize(); }
  async closeWindow(): Promise<void> { this.mainWindow?.close(); }
  async showWindow(): Promise<void> { this.mainWindow?.show(); }
  async hideWindow(): Promise<void> {
    // Electrobun: minimize to tray instead of hide if no hide method
    this.mainWindow?.minimize();
  }
  async focusWindow(): Promise<void> { this.mainWindow?.focus(); }

  async isWindowMaximized(): Promise<{ maximized: boolean }> {
    return { maximized: this.mainWindow?.isMaximized() ?? false };
  }
  async isWindowMinimized(): Promise<{ minimized: boolean }> {
    return { minimized: this.mainWindow?.isMinimized() ?? false };
  }
  async isWindowVisible(): Promise<{ visible: boolean }> {
    // Electrobun doesn't expose isVisible — approximate via non-minimized
    return { visible: !(this.mainWindow?.isMinimized() ?? false) };
  }
  async isWindowFocused(): Promise<{ focused: boolean }> {
    // Not directly available in Electrobun; approximate as true
    return { focused: true };
  }

  async setAlwaysOnTop(options: { flag: boolean; level?: string }): Promise<void> {
    this.mainWindow?.setAlwaysOnTop(options.flag);
  }
  async setFullscreen(options: { flag: boolean }): Promise<void> {
    this.mainWindow?.setFullScreen(options.flag);
  }
  async setOpacity(_options: { opacity: number }): Promise<void> {
    // Not available in Electrobun — no-op
  }

  // MARK: Notifications

  async showNotification(options: NotificationOptions): Promise<{ id: string }> {
    const id = `notification_${++this.notificationCounter}`;
    Utils.showNotification({
      title: options.title,
      body: options.body ?? "",
      silent: options.silent,
    });
    return { id };
  }

  async closeNotification(_options: { id: string }): Promise<void> {
    // Electrobun doesn't support dismissing notifications programmatically
  }

  // MARK: Power state (stub — Electrobun has no powerMonitor equivalent)

  async getPowerState(): Promise<{
    onBattery: boolean;
    idleState: "active" | "idle" | "locked" | "unknown";
    idleTime: number;
  }> {
    return { onBattery: false, idleState: "unknown", idleTime: 0 };
  }

  // MARK: App

  async quit(): Promise<void> {
    Utils.quit();
  }

  async relaunch(): Promise<void> {
    // Electrobun doesn't expose relaunch directly — spawn a detached child
    const child = spawn(process.execPath, [], { detached: true, stdio: "ignore" });
    child.unref();
    Utils.quit();
  }

  async getVersion(): Promise<{
    version: string;
    name: string;
    electron: string;
    chrome: string;
    node: string;
    arch: string;
  }> {
    return {
      version: process.env.npm_package_version ?? "2.0.0-alpha",
      name: "Milady",
      electron: "",
      chrome: "",
      node: process.versions.node,
      arch: process.arch,
    };
  }

  async isPackaged(): Promise<{ packaged: boolean }> {
    return { packaged: process.env.NODE_ENV === "production" };
  }

  async getPath(options: { name: string }): Promise<{ path: string }> {
    const paths = Utils.paths ?? {};
    const nameMap: Record<string, string> = {
      home: paths.home ?? process.env.HOME ?? "",
      appData: paths.appData ?? "",
      userData: paths.appData ?? "",
      temp: paths.temp ?? "/tmp",
      documents: paths.documents ?? "",
      downloads: paths.downloads ?? "",
      desktop: paths.desktop ?? "",
      logs: paths.logs ?? "",
    };
    return { path: nameMap[options.name] ?? "" };
  }

  // MARK: Clipboard

  async writeToClipboard(options: ClipboardWriteOptions): Promise<void> {
    if (options.text !== undefined) {
      Utils.clipboardWriteText(options.text);
    } else if (options.image) {
      // Convert data URL to buffer for clipboard
      const base64 = options.image.replace(/^data:[^;]+;base64,/, "");
      const buf = Buffer.from(base64, "base64");
      Utils.clipboardWriteImage(buf as unknown as Uint8Array);
    }
  }

  async readFromClipboard(): Promise<{
    text?: string;
    hasImage: boolean;
  }> {
    const text = Utils.clipboardReadText() ?? "";
    const formats = Utils.clipboardAvailableFormats();
    return { text, hasImage: formats.includes("image/png") || formats.includes("image/tiff") };
  }

  async clearClipboard(): Promise<void> {
    Utils.clipboardClear();
  }

  // MARK: Shell

  async openExternal(options: { url: string }): Promise<void> {
    const url = typeof options.url === "string" ? options.url.trim() : "";
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`Blocked openExternal for non-http(s) URL: ${parsed.protocol}`);
      }
    } catch (err) {
      if (err instanceof TypeError) throw new Error(`Invalid URL: ${url}`);
      throw err;
    }
    await Utils.openExternal(url);
  }

  async showItemInFolder(options: { path: string }): Promise<void> {
    const p = typeof options.path === "string" ? options.path.trim() : "";
    if (!p || !path.isAbsolute(p)) {
      throw new Error("showItemInFolder requires an absolute path");
    }
    await Utils.showItemInFolder(p);
  }

  async beep(): Promise<void> {
    // Best-effort system beep
    process.stdout.write("\x07");
  }

  // MARK: Helpers

  private resolveIconPath(iconPath: string): string {
    if (path.isAbsolute(iconPath)) return iconPath;
    const assetsPath = path.join(process.cwd(), "assets", iconPath);
    if (fs.existsSync(assetsPath)) return assetsPath;
    return iconPath;
  }

  private send(channel: string, data?: IpcValue): void {
    pushToRenderer(channel, data ?? null);
  }

  dispose(): void {
    this.unregisterAllShortcuts().catch(() => {});
    this.destroyTray().catch(() => {});
  }
}

let desktopManager: DesktopManager | null = null;

export function getDesktopManager(): DesktopManager {
  if (!desktopManager) desktopManager = new DesktopManager();
  return desktopManager;
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

export const desktopHandlers: Record<string, (args: unknown[]) => Promise<unknown>> = {
  "desktop:createTray": ([options]) => getDesktopManager().createTray(options as TrayOptions),
  "desktop:updateTray": ([options]) => getDesktopManager().updateTray(options as Partial<TrayOptions>),
  "desktop:destroyTray": () => getDesktopManager().destroyTray(),
  "desktop:setTrayMenu": ([options]) => Promise.resolve(getDesktopManager().setTrayMenu(options as { menu: TrayMenuItem[] })),
  "desktop:registerShortcut": ([options]) => getDesktopManager().registerShortcut(options as ShortcutOptions),
  "desktop:unregisterShortcut": ([options]) => getDesktopManager().unregisterShortcut(options as { id: string }),
  "desktop:unregisterAllShortcuts": () => getDesktopManager().unregisterAllShortcuts(),
  "desktop:isShortcutRegistered": ([options]) => getDesktopManager().isShortcutRegistered(options as { accelerator: string }),
  "desktop:setAutoLaunch": ([options]) => getDesktopManager().setAutoLaunch(options as { enabled: boolean; openAsHidden?: boolean }),
  "desktop:getAutoLaunchStatus": () => getDesktopManager().getAutoLaunchStatus(),
  "desktop:setWindowOptions": ([options]) => getDesktopManager().setWindowOptions(options as WindowOptions),
  "desktop:getWindowBounds": () => getDesktopManager().getWindowBounds(),
  "desktop:setWindowBounds": ([options]) => getDesktopManager().setWindowBounds(options as WindowBounds),
  "desktop:minimizeWindow": () => getDesktopManager().minimizeWindow(),
  "desktop:maximizeWindow": () => getDesktopManager().maximizeWindow(),
  "desktop:unmaximizeWindow": () => getDesktopManager().unmaximizeWindow(),
  "desktop:closeWindow": () => getDesktopManager().closeWindow(),
  "desktop:showWindow": () => getDesktopManager().showWindow(),
  "desktop:hideWindow": () => getDesktopManager().hideWindow(),
  "desktop:focusWindow": () => getDesktopManager().focusWindow(),
  "desktop:isWindowMaximized": () => getDesktopManager().isWindowMaximized(),
  "desktop:isWindowMinimized": () => getDesktopManager().isWindowMinimized(),
  "desktop:isWindowVisible": () => getDesktopManager().isWindowVisible(),
  "desktop:isWindowFocused": () => getDesktopManager().isWindowFocused(),
  "desktop:setAlwaysOnTop": ([options]) => getDesktopManager().setAlwaysOnTop(options as { flag: boolean; level?: string }),
  "desktop:setFullscreen": ([options]) => getDesktopManager().setFullscreen(options as { flag: boolean }),
  "desktop:setOpacity": ([options]) => getDesktopManager().setOpacity(options as { opacity: number }),
  "desktop:showNotification": ([options]) => getDesktopManager().showNotification(options as NotificationOptions),
  "desktop:closeNotification": ([options]) => getDesktopManager().closeNotification(options as { id: string }),
  "desktop:getPowerState": () => getDesktopManager().getPowerState(),
  "desktop:quit": () => getDesktopManager().quit(),
  "desktop:relaunch": () => getDesktopManager().relaunch(),
  "desktop:getVersion": () => getDesktopManager().getVersion(),
  "desktop:isPackaged": () => getDesktopManager().isPackaged(),
  "desktop:getPath": ([options]) => getDesktopManager().getPath(options as { name: string }),
  "desktop:writeToClipboard": ([options]) => getDesktopManager().writeToClipboard(options as ClipboardWriteOptions),
  "desktop:readFromClipboard": () => getDesktopManager().readFromClipboard(),
  "desktop:clearClipboard": () => getDesktopManager().clearClipboard(),
  "desktop:openExternal": ([options]) => getDesktopManager().openExternal(options as { url: string }),
  "desktop:showItemInFolder": ([options]) => getDesktopManager().showItemInFolder(options as { path: string }),
  "desktop:beep": () => getDesktopManager().beep(),
};
