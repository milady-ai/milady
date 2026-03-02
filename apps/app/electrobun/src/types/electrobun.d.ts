/**
 * Electrobun type shim — redirected via tsconfig paths.
 *
 * Electrobun 1.14.4 exports raw .ts source files whose Updater.ts has
 * internal type errors (TS2554) that are upstream bugs, not ours.
 * This shim lets TypeScript use our declarations instead of following
 * into the package source, while Bun's runtime still uses the real package.
 *
 * IMPORTANT: keep in sync with electrobun version. Check on upgrades.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Shared types ────────────────────────────────────────────────────────────

export interface ElectrobunConfig {
  app: {
    name: string;
    identifier: string;
    version: string;
    description?: string;
    urlSchemes?: string[];
  };
  build?: {
    bun?: { entrypoint?: string; [key: string]: any };
    views?: Record<string, { entrypoint: string; [key: string]: any }>;
    copy?: Record<string, string>;
    buildFolder?: string;
    artifactFolder?: string;
    targets?: string;
    useAsar?: boolean;
    asarUnpack?: string[];
    cefVersion?: string;
    bunVersion?: string;
    mac?: { codesign?: boolean; notarize?: boolean; bundleCEF?: boolean; defaultRenderer?: "native" | "cef"; icons?: string; [key: string]: any };
    win?: { bundleCEF?: boolean; icon?: string; [key: string]: any };
    linux?: { bundleCEF?: boolean; icon?: string; chromiumFlags?: Record<string, string | true>; [key: string]: any };
  };
  runtime?: { exitOnLastWindowClosed?: boolean; [key: string]: any };
  release?: { baseUrl?: string; generatePatch?: boolean; [key: string]: any };
}

export type MenuItemConfig =
  | { type: "divider" | "separator" }
  | {
      type: "normal";
      label: string;
      tooltip?: string;
      action?: string;
      data?: any;
      submenu?: MenuItemConfig[];
      enabled?: boolean;
      checked?: boolean;
      hidden?: boolean;
    };

export type ApplicationMenuItemConfig =
  | { type: "divider" | "separator" }
  | {
      type?: "normal";
      label: string;
      tooltip?: string;
      action?: string;
      data?: any;
      submenu?: ApplicationMenuItemConfig[];
      enabled?: boolean;
      checked?: boolean;
      hidden?: boolean;
      accelerator?: string;
    };

export interface WindowOptionsType {
  title: string;
  frame: { x: number; y: number; width: number; height: number };
  url: string | null;
  html?: string | null;
  preload?: string | null;
  renderer?: "native" | "cef";
  titleBarStyle?: "hidden" | "hiddenInset" | "default";
  transparent?: boolean;
  navigationRules?: string | null;
  sandbox?: boolean;
  rpc?: any;
}

export type UpdateStatusType = "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
export interface UpdateStatusEntry { status: UpdateStatusType; timestamp: number; details?: any }
export type UpdateStatusDetails = any;

export interface TrayOptions {
  title?: string;
  image?: string;
  template?: boolean;
  width?: number;
  height?: number;
}

export interface NotificationOptions { title: string; body?: string; subtitle?: string; silent?: boolean }
export interface MessageBoxOptions { type?: string; buttons?: string[]; defaultId?: number; title?: string; message: string; detail?: string }
export interface MessageBoxResponse { response: number; checkboxChecked?: boolean }
export type Display = any;
export type Rectangle = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };
export type Cookie = any;
export type CookieFilter = any;
export type StorageType = any;

// ─── BrowserWindow ────────────────────────────────────────────────────────────

export declare class BrowserWindow {
  id: number;
  constructor(options: Partial<WindowOptionsType>);
  show(): void;
  hide(): void;
  focus(): void;
  close(): void;
  minimize(): void;
  unminimize(): void;
  maximize(): void;
  unmaximize(): void;
  setAlwaysOnTop(flag: boolean): void;
  setPosition(x: number, y: number): void;
  setSize(width: number, height: number): void;
  getSize(): { width: number; height: number };
  getPosition(): { x: number; y: number };
  setTitle(title: string): void;
  setFullScreen(flag: boolean): void;
  isMinimized(): boolean;
  isMaximized(): boolean;
  loadURL(url: string): void;
  static getById(id: number): BrowserWindow | undefined;
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

export declare class Tray {
  id: number;
  constructor(options?: TrayOptions);
  setTitle(title: string): void;
  setImage(imgPath: string): void;
  setMenu(menu: MenuItemConfig[]): void;
  on(name: "tray-clicked", handler: (event: unknown) => void): void;
  remove(): void;
  static getAll(): Tray[];
}

// ─── GlobalShortcut ───────────────────────────────────────────────────────────

export declare const GlobalShortcut: {
  register(accelerator: string, handler: () => void): boolean;
  unregister(accelerator: string): boolean;
  unregisterAll(): void;
  isRegistered(accelerator: string): boolean;
};

// ─── Updater ──────────────────────────────────────────────────────────────────

export declare const Updater: {
  checkForUpdate(): Promise<{ version: string; hash: string; updateAvailable: boolean }>;
  updateInfo(): { version: string; hash: string; updateAvailable: boolean; updateReady: boolean; error: string };
  getStatusHistory(): UpdateStatusEntry[];
  onStatusChange(cb: ((entry: UpdateStatusEntry) => void) | null): void;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
};

// ─── Utils ────────────────────────────────────────────────────────────────────

export declare const Utils: {
  quit(): void;
  openExternal(url: string): boolean;
  openPath(path: string): boolean;
  showItemInFolder(path: string): void;
  moveToTrash(path: string): void;
  showNotification(options: NotificationOptions): void;
  showMessageBox(options: MessageBoxOptions): Promise<MessageBoxResponse>;
  clipboardReadText(): string | null;
  clipboardWriteText(text: string): void;
  clipboardReadImage(): Uint8Array | null;
  clipboardWriteImage(pngData: Uint8Array): void;
  clipboardClear(): void;
  clipboardAvailableFormats(): string[];
  paths: {
    home: string;
    appData: string;
    config: string;
    cache: string;
    temp: string;
    logs: string;
    documents: string;
    downloads: string;
    desktop: string;
  };
};

// ─── ApplicationMenu ──────────────────────────────────────────────────────────

export declare namespace ApplicationMenu {
  function setMenu(menu: ApplicationMenuItemConfig[]): void;
}

// ─── ContextMenu ──────────────────────────────────────────────────────────────

export declare namespace ContextMenu {
  function show(items: MenuItemConfig[]): void;
}

// ─── RPC (minimal) ───────────────────────────────────────────────────────────

export type RPCSchema = any;
export type ElectrobunRPCSchema = any;
export declare function createRPC(...args: any[]): any;
export declare function defineElectrobunRPC(...args: any[]): any;

// ─── PATHS ────────────────────────────────────────────────────────────────────

export declare namespace PATHS {
  const app: string;
  const resources: string;
}

// ─── Socket ───────────────────────────────────────────────────────────────────

export declare namespace Socket {
  function connect(...args: any[]): any;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export declare const Screen: any;
export declare const Session: any;

// ─── BuildConfig ──────────────────────────────────────────────────────────────

export declare const BuildConfig: { get(): Promise<{ defaultRenderer: "native" | "cef"; [key: string]: any }> };
export type BuildConfigType = any;

// ─── BrowserView ─────────────────────────────────────────────────────────────

export declare class BrowserView {
  windowId: number;
  remove(): void;
  static getAll(): BrowserView[];
}
