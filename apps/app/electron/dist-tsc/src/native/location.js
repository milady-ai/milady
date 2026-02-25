"use strict";
/**
 * Location Native Module for Electron
 *
 * Provides geolocation services on desktop platforms using IP-based lookup.
 *
 * LIMITATION: Native platform location services (CoreLocation on macOS,
 * Windows.Devices.Geolocation on Windows) require native Node.js addons
 * which are not currently implemented. This module uses IP-based geolocation
 * as the primary method, which provides ~5km accuracy.
 *
 * For higher accuracy, the renderer should use the browser's Geolocation API
 * which can access native location services through Chromium.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationManager = void 0;
exports.getLocationManager = getLocationManager;
exports.registerLocationIPC = registerLocationIPC;
const tslib_1 = require("tslib");
const node_https_1 = tslib_1.__importDefault(require("node:https"));
const electron_1 = require("electron");
/**
 * Location Manager
 */
class LocationManager {
  constructor() {
    this.mainWindow = null;
    this.watches = new Map();
    this.watchIdCounter = 0;
    this.lastKnownLocation = null;
  }
  setMainWindow(window) {
    this.mainWindow = window;
  }
  /**
   * Get current position using IP-based geolocation.
   *
   * Note: This uses IP geolocation which provides ~5km accuracy.
   * For higher accuracy on desktop, use the browser's Geolocation API
   * in the renderer process, which can access native location services.
   */
  async getCurrentPosition(_options) {
    const ipLocation = await this.getIPLocation();
    this.lastKnownLocation = ipLocation;
    return ipLocation;
  }
  /**
   * Get location from IP address
   */
  async getIPLocation() {
    return new Promise((resolve, reject) => {
      // Use a free IP geolocation service
      const services = [
        "http://ip-api.com/json/",
        "https://ipapi.co/json/",
        "https://freegeoip.app/json/",
      ];
      const tryService = (index) => {
        if (index >= services.length) {
          reject(new Error("All IP geolocation services failed"));
          return;
        }
        const url = new URL(services[index]);
        const protocol =
          url.protocol === "https:"
            ? node_https_1.default
            : require("node:http");
        const req = protocol.get(url.href, (res) => {
          if (res.statusCode !== 200) {
            tryService(index + 1);
            return;
          }
          let data = "";
          res.on("data", (chunk) => {
            data += chunk.toString();
          });
          res.on("end", () => {
            var _a, _b;
            try {
              const json = JSON.parse(data);
              const lat =
                (_a = json.lat) !== null && _a !== void 0 ? _a : json.latitude;
              const lon =
                (_b = json.lon) !== null && _b !== void 0 ? _b : json.longitude;
              if (lat !== undefined && lon !== undefined) {
                resolve({
                  coords: {
                    latitude: lat,
                    longitude: lon,
                    // IP-based geolocation typically has ~5km accuracy
                    // This is an estimate; actual accuracy varies by ISP and location
                    accuracy: 5000,
                    timestamp: Date.now(),
                  },
                  cached: false,
                });
              } else {
                console.warn(
                  `[Location] Service ${services[index]} returned no coordinates, trying next`,
                );
                tryService(index + 1);
              }
            } catch (parseError) {
              console.warn(
                `[Location] Failed to parse response from ${services[index]}:`,
                parseError,
              );
              tryService(index + 1);
            }
          });
        });
        req.on("error", (err) => {
          console.warn(
            `[Location] Request to ${services[index]} failed:`,
            err.message,
          );
          tryService(index + 1);
        });
        req.setTimeout(5000, () => {
          req.destroy();
          tryService(index + 1);
        });
      };
      tryService(0);
    });
  }
  /**
   * Watch position changes
   */
  async watchPosition(options) {
    var _a;
    const watchId =
      (_a =
        options === null || options === void 0 ? void 0 : options.watchId) !==
        null && _a !== void 0
        ? _a
        : `watch_${++this.watchIdCounter}`;
    // Poll for location changes
    const interval =
      (options === null || options === void 0 ? void 0 : options.maxAge) ||
      10000;
    const check = async () => {
      try {
        const location = await this.getCurrentPosition(options);
        this.sendToRenderer("location:update", { watchId, location });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Location error";
        console.error(`[Location] Watch ${watchId} error:`, message);
        this.sendToRenderer("location:error", { watchId, error: message });
      }
    };
    // Initial check - errors are handled inside check()
    check().catch((err) => {
      console.error(`[Location] Initial check failed for ${watchId}:`, err);
    });
    // Set up interval
    const timer = setInterval(check, interval);
    this.watches.set(watchId, timer);
    return { watchId };
  }
  /**
   * Stop watching position
   */
  async clearWatch(watchId) {
    const timer = this.watches.get(watchId);
    if (timer) {
      clearInterval(timer);
      this.watches.delete(watchId);
    }
  }
  /**
   * Get last known location
   */
  getLastKnownLocation() {
    return this.lastKnownLocation;
  }
  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
  /**
   * Clean up
   */
  dispose() {
    for (const timer of this.watches.values()) {
      clearInterval(timer);
    }
    this.watches.clear();
  }
}
exports.LocationManager = LocationManager;
// Singleton instance
let locationManager = null;
function getLocationManager() {
  if (!locationManager) {
    locationManager = new LocationManager();
  }
  return locationManager;
}
/**
 * Register Location IPC handlers
 */
function registerLocationIPC() {
  const manager = getLocationManager();
  electron_1.ipcMain.handle(
    "location:getCurrentPosition",
    async (_e, options) => {
      return manager.getCurrentPosition(options);
    },
  );
  electron_1.ipcMain.handle("location:watchPosition", async (_e, options) => {
    return manager.watchPosition(options);
  });
  electron_1.ipcMain.handle("location:clearWatch", async (_e, options) => {
    return manager.clearWatch(options.watchId);
  });
  electron_1.ipcMain.handle("location:getLastKnownLocation", () => {
    return { location: manager.getLastKnownLocation() };
  });
}
