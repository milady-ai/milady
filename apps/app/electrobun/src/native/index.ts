import type { BrowserWindow } from "electrobun/bun";
import { getAgentManager } from "./agent";
import { getCameraManager } from "./camera";
import { getCanvasManager } from "./canvas";
import { getDesktopManager } from "./desktop";
import { getGatewayDiscovery } from "./gateway";
import { getGpuWindowManager } from "./gpu-window";
import { getLocationManager } from "./location";
import { getPermissionManager } from "./permissions";
import { getScreenCaptureManager } from "./screencapture";
import { getSwabbleManager } from "./swabble";
import { getTalkModeManager } from "./talkmode";

type SendToWebview = (message: string, payload?: unknown) => void;

export function initializeNativeModules(
  mainWindow: BrowserWindow,
  sendToWebview: SendToWebview,
): void {
  const desktop = getDesktopManager();
  desktop.setMainWindow(mainWindow);
  desktop.setSendToWebview(sendToWebview);

  getAgentManager().setSendToWebview(sendToWebview);
  getCameraManager().setSendToWebview(sendToWebview);
  getCanvasManager().setSendToWebview(sendToWebview);
  getGatewayDiscovery().setSendToWebview(sendToWebview);
  getGpuWindowManager().setSendToWebview(sendToWebview);
  getLocationManager().setSendToWebview(sendToWebview);
  getPermissionManager().setSendToWebview(sendToWebview);
  const screencapture = getScreenCaptureManager();
  screencapture.setSendToWebview(sendToWebview);
  screencapture.setMainWebview(mainWindow.webview);
  getSwabbleManager().setSendToWebview(sendToWebview);
  getTalkModeManager().setSendToWebview(sendToWebview);
}

export function disposeNativeModules(): void {
  getAgentManager().dispose();
  getCameraManager().dispose();
  getCanvasManager().dispose();
  getDesktopManager().dispose();
  getGatewayDiscovery().dispose();
  getGpuWindowManager().dispose();
  getLocationManager().dispose();
  getPermissionManager().dispose();
  getScreenCaptureManager().dispose();
  getSwabbleManager().dispose();
  getTalkModeManager().dispose();
}
