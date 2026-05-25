import { BrowserWindow } from "electrobun/bun";
import { createMainViewRPC } from "./rpc/handlers";
import { installApplicationMenu, installTray } from "./system/tray-and-menu";
import { installDeepLinks } from "./system/deep-links";
import { saveStateBeforeQuit } from "./system/lifecycle";

const mainRpc = createMainViewRPC();

const mainWindow = new BrowserWindow({
  title: "Agentic Electrobun App",
  url: "views://mainview/index.html",
  frame: { width: 1200, height: 800, x: 80, y: 80 },
  titleBarStyle: "default",
  rpc: mainRpc,
});

mainWindow.webview.setNavigationRules([
  "^http://*",
  "views://*",
  "https://trusted.example.com/*",
]);

installApplicationMenu(mainWindow);
installTray(mainWindow);
installDeepLinks(mainWindow);
saveStateBeforeQuit();

mainWindow.webview.on("will-navigate", (event) => {
  // Navigation decisions are made by setNavigationRules in native code.
  // Use this listener for audit/telemetry only, not for enforcement.
  if (!event.data?.allowed) {
    console.warn("Blocked navigation", event.data?.url ?? event.data?.detail);
  }
});
