/**
 * Auto-enable plugin-plugin-manager in the user's config so the dashboard
 * "Install Plugin" button works. Upstream has it commented out of CORE_PLUGINS.
 *
 * Skipped when `MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE=1` is set.
 */

import { logger } from "@elizaos/core";
import { loadElizaConfig, saveElizaConfig } from "../config/config.js";

let _checked = false;

export function ensurePluginManagerAllowed(): void {
  if (_checked) return;
  if (process.env.MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE === "1") {
    _checked = true;
    return;
  }
  try {
    const config = loadElizaConfig();
    const entries =
      config.plugins?.entries ?? ({} as Record<string, { enabled?: boolean }>);
    const id = "plugin-manager";
    if (entries[id]?.enabled === false) {
      _checked = true;
      return; // explicitly disabled by user
    }
    if (entries[id]) {
      _checked = true;
      return; // already present
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
  } catch {
    // Non-fatal — plugin install button won't work but everything else is fine
  }
}

/** Reset the in-process guard (for testing only). @internal */
export function _resetPluginManagerChecked(): void {
  _checked = false;
}
