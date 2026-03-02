/**
 * Permission Manager — Electrobun
 *
 * Adapted from apps/app/electron/src/native/permissions.ts.
 * Removed Electron ipcMain and BrowserWindow dependencies.
 * Push events now use pushToRenderer from ipc-server.
 */

import { pushToRenderer } from "../ipc-server";
import * as darwin from "./permissions-darwin";
import * as linux from "./permissions-linux";
import type {
  AllPermissionsState,
  PermissionCheckResult,
  PermissionState,
  SystemPermissionId,
} from "./permissions-shared";
import {
  isPermissionApplicable,
  SYSTEM_PERMISSIONS,
} from "./permissions-shared";
import * as win32 from "./permissions-win32";

const platform = process.platform as "darwin" | "win32" | "linux";
const DEFAULT_CACHE_TIMEOUT_MS = 30000;

export class PermissionManager {
  private cache = new Map<SystemPermissionId, PermissionState>();
  private cacheTimeoutMs = DEFAULT_CACHE_TIMEOUT_MS;
  private shellEnabled = true;

  // API-compat shim
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setMainWindow(_win: unknown): void {}

  setCacheTimeout(ms: number): void {
    this.cacheTimeoutMs = ms;
  }

  setShellEnabled(enabled: boolean): void {
    this.shellEnabled = enabled;
    this.cache.delete("shell");
    pushToRenderer("permissions:changed", { id: "shell" });
  }

  isShellEnabled(): boolean {
    return this.shellEnabled;
  }

  private isCacheValid(id: SystemPermissionId): boolean {
    const cached = this.cache.get(id);
    if (!cached) return false;
    return Date.now() - cached.lastChecked < this.cacheTimeoutMs;
  }

  private getFromCache(id: SystemPermissionId): PermissionState | null {
    if (!this.isCacheValid(id)) return null;
    return this.cache.get(id) ?? null;
  }

  private setCache(id: SystemPermissionId, state: PermissionState): void {
    this.cache.set(id, state);
  }

  clearCache(): void {
    this.cache.clear();
  }

  async checkPermission(
    id: SystemPermissionId,
    forceRefresh = false,
  ): Promise<PermissionState> {
    if (!isPermissionApplicable(id, platform)) {
      const state: PermissionState = {
        id,
        status: "not-applicable",
        lastChecked: Date.now(),
        canRequest: false,
      };
      this.setCache(id, state);
      return state;
    }

    if (id === "shell" && !this.shellEnabled) {
      const state: PermissionState = {
        id,
        status: "denied",
        lastChecked: Date.now(),
        canRequest: false,
      };
      this.setCache(id, state);
      return state;
    }

    if (!forceRefresh) {
      const cached = this.getFromCache(id);
      if (cached) return cached;
    }

    let result: PermissionCheckResult;
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

    const state: PermissionState = {
      id,
      status: result.status,
      lastChecked: Date.now(),
      canRequest: result.canRequest,
    };
    this.setCache(id, state);
    return state;
  }

  async checkAllPermissions(
    forceRefresh = false,
  ): Promise<AllPermissionsState> {
    const results = await Promise.all(
      SYSTEM_PERMISSIONS.map((p) => this.checkPermission(p.id, forceRefresh)),
    );
    return results.reduce((acc, s) => {
      acc[s.id] = s;
      return acc;
    }, {} as AllPermissionsState);
  }

  async requestPermission(id: SystemPermissionId): Promise<PermissionState> {
    if (!isPermissionApplicable(id, platform)) {
      return {
        id,
        status: "not-applicable",
        lastChecked: Date.now(),
        canRequest: false,
      };
    }

    let result: PermissionCheckResult;
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

    const state: PermissionState = {
      id,
      status: result.status,
      lastChecked: Date.now(),
      canRequest: result.canRequest,
    };
    this.setCache(id, state);
    pushToRenderer("permissions:changed", { id });
    return state;
  }

  async openSettings(id: SystemPermissionId): Promise<void> {
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

  async checkFeaturePermissions(
    featureId: string,
  ): Promise<{ granted: boolean; missing: SystemPermissionId[] }> {
    const requiredPerms = SYSTEM_PERMISSIONS.filter((p) =>
      p.requiredForFeatures.includes(featureId),
    ).map((p) => p.id);
    const states = await Promise.all(
      requiredPerms.map((id) => this.checkPermission(id)),
    );
    const missing = states
      .filter((s) => s.status !== "granted" && s.status !== "not-applicable")
      .map((s) => s.id);
    return { granted: missing.length === 0, missing };
  }

  dispose(): void {
    this.cache.clear();
  }
}

let permissionManager: PermissionManager | null = null;

export function getPermissionManager(): PermissionManager {
  if (!permissionManager) permissionManager = new PermissionManager();
  return permissionManager;
}

export const permissionsHandlers: Record<
  string,
  (args: unknown[]) => Promise<unknown>
> = {
  "permissions:getAll": ([forceRefresh]) =>
    getPermissionManager().checkAllPermissions(Boolean(forceRefresh)),
  "permissions:check": ([id, forceRefresh]) =>
    getPermissionManager().checkPermission(
      id as SystemPermissionId,
      Boolean(forceRefresh),
    ),
  "permissions:request": ([id]) =>
    getPermissionManager().requestPermission(id as SystemPermissionId),
  "permissions:openSettings": ([id]) =>
    getPermissionManager().openSettings(id as SystemPermissionId),
  "permissions:checkFeature": ([featureId]) =>
    getPermissionManager().checkFeaturePermissions(featureId as string),
  "permissions:setShellEnabled": ([enabled]) => {
    getPermissionManager().setShellEnabled(Boolean(enabled));
    return getPermissionManager().checkPermission("shell", true);
  },
  "permissions:isShellEnabled": () =>
    Promise.resolve(getPermissionManager().isShellEnabled()),
  "permissions:clearCache": () => {
    getPermissionManager().clearCache();
    return Promise.resolve();
  },
  "permissions:getPlatform": () => Promise.resolve(platform),
};
