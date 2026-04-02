/**
 * Auto-enable plugin-plugin-manager in the user's config so the dashboard
 * "Install Plugin" button works. Upstream has it commented out of CORE_PLUGINS.
 *
 * Skipped when `MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE=1` is set.
 */

import { logger } from "@elizaos/core";
import {
  loadElizaConfig,
  saveElizaConfig,
} from "@miladyai/agent/config/config";

let _checked = false;
let _lastResult: PluginManagerGuardResult = "error";

export const PLUGIN_MANAGER_UNAVAILABLE_ERROR =
  "Plugin manager service not found";

export type PluginManagerGuardResult =
  | "enabled"
  | "already-enabled"
  | "disabled-by-user"
  | "disabled-by-env"
  | "error";

export function getPluginManagerBlockReason(
  result: PluginManagerGuardResult,
): string | null {
  if (result === "disabled-by-user") {
    return "plugin-manager is explicitly disabled in config";
  }
  if (result === "disabled-by-env") {
    return "plugin-manager auto-enable is disabled by MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE=1";
  }
  return null;
}

export function ensurePluginManagerAllowed(): PluginManagerGuardResult {
  if (_checked) return _lastResult;
  if (process.env.MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE === "1") {
    _checked = true;
    _lastResult = "disabled-by-env";
    return _lastResult;
  }
  try {
    const config = loadElizaConfig();
    const entries =
      config.plugins?.entries ?? ({} as Record<string, { enabled?: boolean }>);
    const id = "plugin-manager";
    if (entries[id]?.enabled === false) {
      _checked = true;
      _lastResult = "disabled-by-user";
      return _lastResult;
    }
    if (entries[id]) {
      _checked = true;
      _lastResult = "already-enabled";
      return _lastResult;
    }
    // The upstream ElizaConfig type marks `plugins` as a complex branded type
    // that doesn't allow direct property assignment. We know the runtime shape
    // is a plain object with an `entries` record, so we cast through unknown.
    config.plugins ??= {} as unknown as typeof config.plugins;
    (config.plugins as Record<string, unknown>).entries = {
      ...entries,
      [id]: { enabled: true },
    };
    saveElizaConfig(config);
    logger.info(
      "[milady] Auto-enabled plugin-manager for dashboard plugin installs. " +
        "Set MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE=1 to prevent this.",
    );
    _checked = true;
    _lastResult = "enabled";
    return _lastResult;
  } catch {
    // Non-fatal — plugin install button won't work but everything else is fine
    _checked = true;
    _lastResult = "error";
    return _lastResult;
  }
}

/** Reset the in-process guard (for testing only). @internal */
export function _resetPluginManagerChecked(): void {
  _checked = false;
  _lastResult = "error";
}
