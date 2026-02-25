"use strict";
/**
 * Native Module Index for Electron
 *
 * Exports all native modules and provides a unified initialization function.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeNativeModules = initializeNativeModules;
exports.registerAllIPC = registerAllIPC;
exports.disposeNativeModules = disposeNativeModules;
const tslib_1 = require("tslib");
tslib_1.__exportStar(require("./agent"), exports);
tslib_1.__exportStar(require("./camera"), exports);
tslib_1.__exportStar(require("./canvas"), exports);
tslib_1.__exportStar(require("./desktop"), exports);
tslib_1.__exportStar(require("./gateway"), exports);
tslib_1.__exportStar(require("./location"), exports);
tslib_1.__exportStar(require("./permissions"), exports);
tslib_1.__exportStar(require("./screencapture"), exports);
tslib_1.__exportStar(require("./swabble"), exports);
tslib_1.__exportStar(require("./talkmode"), exports);
// Import all native modules
tslib_1.__exportStar(require("./whisper"), exports);
const agent_1 = require("./agent");
const camera_1 = require("./camera");
const canvas_1 = require("./canvas");
// Import registration functions
const desktop_1 = require("./desktop");
const gateway_1 = require("./gateway");
const location_1 = require("./location");
const permissions_1 = require("./permissions");
const screencapture_1 = require("./screencapture");
const swabble_1 = require("./swabble");
const talkmode_1 = require("./talkmode");
/**
 * Initialize all native modules with the main window
 */
function initializeNativeModules(mainWindow) {
  // Set main window on all managers
  (0, desktop_1.getDesktopManager)().setMainWindow(mainWindow);
  (0, gateway_1.getGatewayDiscovery)().setMainWindow(mainWindow);
  (0, talkmode_1.getTalkModeManager)().setMainWindow(mainWindow);
  (0, swabble_1.getSwabbleManager)().setMainWindow(mainWindow);
  (0, screencapture_1.getScreenCaptureManager)().setMainWindow(mainWindow);
  (0, location_1.getLocationManager)().setMainWindow(mainWindow);
  (0, camera_1.getCameraManager)().setMainWindow(mainWindow);
  (0, canvas_1.getCanvasManager)().setMainWindow(mainWindow);
  (0, permissions_1.getPermissionManager)().setMainWindow(mainWindow);
}
/**
 * Register all IPC handlers
 * Call this once during app initialization
 */
function registerAllIPC() {
  (0, desktop_1.registerDesktopIPC)();
  (0, gateway_1.registerGatewayIPC)();
  (0, talkmode_1.registerTalkModeIPC)();
  (0, swabble_1.registerSwabbleIPC)();
  (0, screencapture_1.registerScreenCaptureIPC)();
  (0, location_1.registerLocationIPC)();
  (0, camera_1.registerCameraIPC)();
  (0, canvas_1.registerCanvasIPC)();
  (0, agent_1.registerAgentIPC)();
  (0, permissions_1.registerPermissionsIPC)();
}
/**
 * Clean up all native modules
 */
function disposeNativeModules() {
  (0, agent_1.getAgentManager)().dispose();
  (0, desktop_1.getDesktopManager)().dispose();
  (0, gateway_1.getGatewayDiscovery)().dispose();
  (0, talkmode_1.getTalkModeManager)().dispose();
  (0, swabble_1.getSwabbleManager)().dispose();
  (0, screencapture_1.getScreenCaptureManager)().dispose();
  (0, location_1.getLocationManager)().dispose();
  (0, camera_1.getCameraManager)().dispose();
  (0, canvas_1.getCanvasManager)().dispose();
  (0, permissions_1.getPermissionManager)().dispose();
}
