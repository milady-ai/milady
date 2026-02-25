"use strict";
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const node_buffer_1 = require("node:buffer");
const node_path_1 = tslib_1.__importDefault(require("node:path"));
const electron_1 = require("@capacitor-community/electron");
const electron_2 = require("electron");
const electron_is_dev_1 = tslib_1.__importDefault(require("electron-is-dev"));
const electron_unhandled_1 = tslib_1.__importDefault(
  require("electron-unhandled"),
);
const electron_updater_1 = require("electron-updater");
const api_base_1 = require("./api-base");
const native_1 = require("./native");
const setup_1 = require("./setup");
// Graceful handling of unhandled errors.
(0, electron_unhandled_1.default)();
// Allow overriding Electron userData during automated E2E runs.
const userDataOverride =
  (_a = process.env.MILADY_ELECTRON_USER_DATA_DIR) === null || _a === void 0
    ? void 0
    : _a.trim();
if (userDataOverride) {
  electron_2.app.setPath("userData", userDataOverride);
}
// Electron 26 (Node 18) can miss global File, which breaks undici-based deps.
const globalWithFile = globalThis;
if (
  typeof globalWithFile.File === "undefined" &&
  typeof node_buffer_1.File === "function"
) {
  globalWithFile.File = node_buffer_1.File;
}
// Define our menu templates (these are optional)
const trayMenuTemplate = [
  new electron_2.MenuItem({ label: "Quit App", role: "quit" }),
];
const appMenuBarMenuTemplate = [
  { role: process.platform === "darwin" ? "appMenu" : "fileMenu" },
  { role: "editMenu" },
  { role: "viewMenu" },
];
let pendingSharePayloads = [];
function parseShareUrl(rawUrl) {
  var _a, _b, _c;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_d) {
    return null;
  }
  if (parsed.protocol !== "milady:") return null;
  const sharePath = (parsed.pathname || parsed.host || "").replace(/^\/+/, "");
  if (sharePath !== "share") return null;
  const title =
    ((_a = parsed.searchParams.get("title")) === null || _a === void 0
      ? void 0
      : _a.trim()) || undefined;
  const text =
    ((_b = parsed.searchParams.get("text")) === null || _b === void 0
      ? void 0
      : _b.trim()) || undefined;
  const sharedUrl =
    ((_c = parsed.searchParams.get("url")) === null || _c === void 0
      ? void 0
      : _c.trim()) || undefined;
  const files = parsed.searchParams
    .getAll("file")
    .map((filePath) => filePath.trim())
    .filter((filePath) => filePath.length > 0)
    .map((filePath) => ({
      name: node_path_1.default.basename(filePath),
      path: filePath,
    }));
  return {
    source: "electron-open-url",
    title,
    text,
    url: sharedUrl,
    files,
  };
}
function dispatchShareToRenderer(payload) {
  const mainWindow = myCapacitorApp.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingSharePayloads.push(payload);
    return;
  }
  const eventName = JSON.stringify("milady:share-target");
  const detail = JSON.stringify(payload).replace(/</g, "\\u003c");
  mainWindow.webContents
    .executeJavaScript(
      `window.__MILADY_SHARE_QUEUE__ = Array.isArray(window.__MILADY_SHARE_QUEUE__) ? window.__MILADY_SHARE_QUEUE__ : [];` +
        `window.__MILADY_SHARE_QUEUE__.push(${detail});` +
        `document.dispatchEvent(new CustomEvent(${eventName}, { detail: ${detail} }));`,
    )
    .catch(() => {
      pendingSharePayloads.push(payload);
    });
}
function flushPendingSharePayloads() {
  if (pendingSharePayloads.length === 0) return;
  const toFlush = pendingSharePayloads;
  pendingSharePayloads = [];
  for (const payload of toFlush) {
    dispatchShareToRenderer(payload);
  }
}
function revealMainWindow() {
  const mainWindow = myCapacitorApp.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}
electron_2.app.on("open-file", (event, filePath) => {
  event.preventDefault();
  dispatchShareToRenderer({
    source: "electron-open-file",
    files: [{ name: node_path_1.default.basename(filePath), path: filePath }],
  });
  revealMainWindow();
});
electron_2.app.on("open-url", (event, url) => {
  const payload = parseShareUrl(url);
  if (!payload) return;
  event.preventDefault();
  dispatchShareToRenderer(payload);
  revealMainWindow();
});
for (const arg of process.argv) {
  const payload = parseShareUrl(arg);
  if (payload) pendingSharePayloads.push(payload);
}
// Get Config options from capacitor.config
const capacitorFileConfig = (0, electron_1.getCapacitorElectronConfig)();
// Initialize our app. You can pass menu templates into the app here.
// const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig);
const myCapacitorApp = new setup_1.ElectronCapacitorApp(
  capacitorFileConfig,
  trayMenuTemplate,
  appMenuBarMenuTemplate,
);
// If deeplinking is enabled then we will set it up here.
if (
  (_b = capacitorFileConfig.electron) === null || _b === void 0
    ? void 0
    : _b.deepLinkingEnabled
) {
  (0, electron_1.setupElectronDeepLinking)(myCapacitorApp, {
    customProtocol:
      (_c = capacitorFileConfig.electron.deepLinkingCustomProtocol) !== null &&
      _c !== void 0
        ? _c
        : "mycapacitorapp",
  });
}
// If we are in Dev mode, use the file watcher components.
if (electron_is_dev_1.default) {
  (0, setup_1.setupReloadWatcher)(myCapacitorApp);
}
// Run Application
(async () => {
  var _a;
  // Wait for electron app to be ready.
  await electron_2.app.whenReady();
  // Security - Set Content-Security-Policy based on whether or not we are in dev mode.
  (0, setup_1.setupContentSecurityPolicy)(myCapacitorApp.getCustomURLScheme());
  // Initialize our app, build windows, and load content.
  await myCapacitorApp.init();
  const mainWindow = myCapacitorApp.getMainWindow();
  (0, native_1.initializeNativeModules)(mainWindow);
  (0, native_1.registerAllIPC)();
  // Start the embedded agent runtime and pass the API port to the renderer.
  // The UI's api-client reads window.__MILADY_API_BASE__ to know where to connect.
  const externalApiBaseResolution = (0, api_base_1.resolveExternalApiBase)(
    process.env,
  );
  const externalApiBase = externalApiBaseResolution.base;
  if (externalApiBaseResolution.invalidSources.length > 0) {
    console.warn(
      `[Milady] Ignoring invalid API base URL from ${externalApiBaseResolution.invalidSources.join(", ")}`,
    );
  }
  const skipEmbeddedAgent =
    process.env.MILADY_ELECTRON_SKIP_EMBEDDED_AGENT === "1" ||
    Boolean(externalApiBase);
  const agentManager = (0, native_1.getAgentManager)();
  agentManager.setMainWindow(mainWindow);
  const apiBaseInjector = (0, api_base_1.createApiBaseInjector)(
    {
      isDestroyed: () => mainWindow.isDestroyed(),
      executeJavaScript: (script) =>
        mainWindow.webContents.executeJavaScript(script),
    },
    {
      getApiToken: () => process.env.MILADY_API_TOKEN,
      onInjected: flushPendingSharePayloads,
    },
  );
  const injectApiBase = (base) => {
    void apiBaseInjector.inject(base);
  };
  const injectApiEndpoint = (port) => {
    if (!port) return;
    injectApiBase(`http://localhost:${port}`);
  };
  // Always inject on renderer reload/navigation once we know the port.
  mainWindow.webContents.on("did-finish-load", () => {
    if (externalApiBase) {
      injectApiBase(externalApiBase);
    } else {
      injectApiEndpoint(agentManager.getPort());
    }
    flushPendingSharePayloads();
  });
  if (externalApiBase) {
    const source =
      (_a = externalApiBaseResolution.source) !== null && _a !== void 0
        ? _a
        : "unknown";
    console.info(
      `[Milady] Using external API base for renderer (${source}): ${externalApiBase}`,
    );
    injectApiBase(externalApiBase);
  } else if (!skipEmbeddedAgent) {
    // Start in background and inject API base as soon as the port is available,
    // without waiting for the full runtime/plugin initialization path.
    const startPromise = agentManager.start();
    void (async () => {
      const startedAt = Date.now();
      const timeoutMs = 30000;
      while (Date.now() - startedAt < timeoutMs) {
        const port = agentManager.getPort();
        if (port) {
          injectApiEndpoint(port);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    })();
    startPromise.catch((err) => {
      console.error("[Milady] Agent startup failed:", err);
    });
  } else {
    console.info("[Milady] Embedded agent startup disabled by configuration");
  }
  // Check for updates if we are in a packaged app.
  if (process.env.MILADY_ELECTRON_DISABLE_AUTO_UPDATER !== "1") {
    electron_updater_1.autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn("[Milady] Update check failed (non-fatal):", err.message);
    });
  }
})();
// Handle when all of our windows are close (platforms have their own expectations).
electron_2.app.on("window-all-closed", () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    electron_2.app.quit();
  }
});
// When the dock icon is clicked.
electron_2.app.on("activate", async () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (myCapacitorApp.getMainWindow().isDestroyed()) {
    await myCapacitorApp.init();
  }
});
electron_2.app.on("before-quit", () => {
  (0, native_1.disposeNativeModules)();
});
// Place all ipc or other electron api calls and custom functionality under this line
