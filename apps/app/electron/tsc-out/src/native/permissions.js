"use strict";
/**
 * Permission Manager for Electron
 *
 * Provides a unified interface for checking and requesting system permissions
 * across macOS, Windows, and Linux. Manages permission state caching and
 * exposes IPC handlers for the renderer process.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionManager = void 0;
exports.getPermissionManager = getPermissionManager;
exports.registerPermissionsIPC = registerPermissionsIPC;
const tslib_1 = require("tslib");
const electron_1 = require("electron");
const darwin = tslib_1.__importStar(require("./permissions-darwin"));
const linux = tslib_1.__importStar(require("./permissions-linux"));
const permissions_shared_1 = require("./permissions-shared");
const win32 = tslib_1.__importStar(require("./permissions-win32"));
const platform = process.platform;
/** Default cache timeout: 30 seconds */
const DEFAULT_CACHE_TIMEOUT_MS = 30000;
/**
 * Permission Manager class
 *
 * Handles permission checking, requesting, and caching with platform-specific
 * implementations for macOS, Windows, and Linux.
 */
class PermissionManager {
  constructor() {
    this.mainWindow = null;
    this.cache = new Map();
    this.cacheTimeoutMs = DEFAULT_CACHE_TIMEOUT_MS;
    this.shellEnabled = true;
  }
  /**
   * Set the main window reference for sending events.
   */
  setMainWindow(window) {
    this.mainWindow = window;
  }
  /**
   * Set the cache timeout in milliseconds.
   */
  setCacheTimeout(ms) {
    this.cacheTimeoutMs = ms;
  }
  /**
   * Enable or disable shell access.
   * This is a soft toggle - the actual permission is always granted,
   * but we can disable the feature in the UI.
   */
  setShellEnabled(enabled) {
    this.shellEnabled = enabled;
    // Clear cache entry to reflect new state
    this.cache.delete("shell");
    // Notify renderer of change
    this.notifyPermissionChange("shell");
  }
  /**
   * Get whether shell access is enabled.
   */
  isShellEnabled() {
    return this.shellEnabled;
  }
  /**
   * Check if a cached permission is still valid.
   */
  isCacheValid(id) {
    const cached = this.cache.get(id);
    if (!cached) return false;
    return Date.now() - cached.lastChecked < this.cacheTimeoutMs;
  }
  /**
   * Get a permission from cache, or null if not cached/expired.
   */
  getFromCache(id) {
    if (!this.isCacheValid(id)) return null;
    return this.cache.get(id) || null;
  }
  /**
   * Store a permission state in cache.
   */
  setCache(id, state) {
    this.cache.set(id, state);
  }
  /**
   * Clear the entire permission cache.
   */
  clearCache() {
    this.cache.clear();
  }
  /**
   * Notify the renderer process of a permission change.
   */
  notifyPermissionChange(id) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("permissions:changed", { id });
    }
  }
  /**
   * Check a single permission, using cache if available.
   */
  async checkPermission(id, forceRefresh = false) {
    // Check if permission is applicable to this platform
    if (!(0, permissions_shared_1.isPermissionApplicable)(id, platform)) {
      const state = {
        id,
        status: "not-applicable",
        lastChecked: Date.now(),
        canRequest: false,
      };
      this.setCache(id, state);
      return state;
    }
    // Check shell toggle
    if (id === "shell" && !this.shellEnabled) {
      const state = {
        id,
        status: "denied",
        lastChecked: Date.now(),
        canRequest: false,
      };
      this.setCache(id, state);
      return state;
    }
    // Return cached value if valid and not forcing refresh
    if (!forceRefresh) {
      const cached = this.getFromCache(id);
      if (cached) return cached;
    }
    // Perform platform-specific check
    let result;
    switch (platform) {
      case "darwin":
        result = await darwin.checkPermission(id);
        break;
      case "win32":
        result = await win32.checkPermission(id);
        break;
      case "linux":
        result = await linux.checkPermission(id);
        break;
      default:
        result = { status: "not-applicable", canRequest: false };
    }
    const state = {
      id,
      status: result.status,
      lastChecked: Date.now(),
      canRequest: result.canRequest,
    };
    this.setCache(id, state);
    return state;
  }
  /**
   * Check all permissions at once.
   */
  async checkAllPermissions(forceRefresh = false) {
    const results = await Promise.all(
      permissions_shared_1.SYSTEM_PERMISSIONS.map((p) =>
        this.checkPermission(p.id, forceRefresh),
      ),
    );
    return results.reduce((acc, state) => {
      acc[state.id] = state;
      return acc;
    }, {});
  }
  /**
   * Request a specific permission.
   */
  async requestPermission(id) {
    // Check if permission is applicable
    if (!(0, permissions_shared_1.isPermissionApplicable)(id, platform)) {
      return {
        id,
        status: "not-applicable",
        lastChecked: Date.now(),
        canRequest: false,
      };
    }
    // Perform platform-specific request
    let result;
    switch (platform) {
      case "darwin":
        result = await darwin.requestPermission(id);
        break;
      case "win32":
        result = await win32.requestPermission(id);
        break;
      case "linux":
        result = await linux.requestPermission(id);
        break;
      default:
        result = { status: "not-applicable", canRequest: false };
    }
    const state = {
      id,
      status: result.status,
      lastChecked: Date.now(),
      canRequest: result.canRequest,
    };
    this.setCache(id, state);
    this.notifyPermissionChange(id);
    return state;
  }
  /**
   * Open system settings for a specific permission.
   */
  async openSettings(id) {
    switch (platform) {
      case "darwin":
        await darwin.openPrivacySettings(id);
        break;
      case "win32":
        await win32.openPrivacySettings(id);
        break;
      case "linux":
        await linux.openPrivacySettings(id);
        break;
    }
  }
  /**
   * Check if all required permissions for a feature are granted.
   */
  async checkFeaturePermissions(featureId) {
    const requiredPerms = permissions_shared_1.SYSTEM_PERMISSIONS.filter((p) =>
      p.requiredForFeatures.includes(featureId),
    ).map((p) => p.id);
    const states = await Promise.all(
      requiredPerms.map((id) => this.checkPermission(id)),
    );
    const missing = states
      .filter((s) => s.status !== "granted" && s.status !== "not-applicable")
      .map((s) => s.id);
    return {
      granted: missing.length === 0,
      missing,
    };
  }
  /**
   * Clean up resources.
   */
  dispose() {
    this.cache.clear();
    this.mainWindow = null;
  }
}
exports.PermissionManager = PermissionManager;
// Singleton instance
let permissionManager = null;
function getPermissionManager() {
  if (!permissionManager) {
    permissionManager = new PermissionManager();
  }
  return permissionManager;
}
/**
 * Register all Permission IPC handlers.
 * Call this once during app initialization.
 */
function registerPermissionsIPC() {
  const manager = getPermissionManager();
  // Get all permissions
  electron_1.ipcMain.handle("permissions:getAll", async (_e, forceRefresh) => {
    return manager.checkAllPermissions(
      forceRefresh !== null && forceRefresh !== void 0 ? forceRefresh : false,
    );
  });
  // Check a single permission
  electron_1.ipcMain.handle(
    "permissions:check",
    async (_e, id, forceRefresh) => {
      return manager.checkPermission(
        id,
        forceRefresh !== null && forceRefresh !== void 0 ? forceRefresh : false,
      );
    },
  );
  // Request a permission
  electron_1.ipcMain.handle("permissions:request", async (_e, id) => {
    return manager.requestPermission(id);
  });
  // Open settings for a permission
  electron_1.ipcMain.handle("permissions:openSettings", async (_e, id) => {
    await manager.openSettings(id);
  });
  // Check feature permissions
  electron_1.ipcMain.handle(
    "permissions:checkFeature",
    async (_e, featureId) => {
      return manager.checkFeaturePermissions(featureId);
    },
  );
  // Toggle shell access
  electron_1.ipcMain.handle(
    "permissions:setShellEnabled",
    async (_e, enabled) => {
      manager.setShellEnabled(enabled);
      return manager.checkPermission("shell", true);
    },
  );
  // Get shell enabled status
  electron_1.ipcMain.handle("permissions:isShellEnabled", async () => {
    return manager.isShellEnabled();
  });
  // Clear cache
  electron_1.ipcMain.handle("permissions:clearCache", async () => {
    manager.clearCache();
  });
  // Get platform info
  electron_1.ipcMain.handle("permissions:getPlatform", async () => {
    return platform;
  });
}
