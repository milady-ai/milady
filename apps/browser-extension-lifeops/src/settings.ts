/**
 * Persistent extension settings stored in chrome.storage.local.
 *
 * Settings are loaded once at service-worker start and re-read on demand
 * when the options page writes an update.
 */

import { DEFAULT_SETTINGS, type ExtensionSettings } from "./types.js";

const STORAGE_KEY = "lifeops.extension.settings";

export async function loadSettings(): Promise<ExtensionSettings> {
  const record = await chrome.storage.local.get(STORAGE_KEY);
  const stored = record[STORAGE_KEY];
  if (!stored || typeof stored !== "object") {
    return DEFAULT_SETTINGS;
  }
  const s = stored as Partial<ExtensionSettings>;
  return {
    wsUrl:
      typeof s.wsUrl === "string" && s.wsUrl.length > 0
        ? s.wsUrl
        : DEFAULT_SETTINGS.wsUrl,
    flushIntervalMs:
      typeof s.flushIntervalMs === "number" && s.flushIntervalMs >= 1_000
        ? s.flushIntervalMs
        : DEFAULT_SETTINGS.flushIntervalMs,
    activityReportingEnabled:
      typeof s.activityReportingEnabled === "boolean"
        ? s.activityReportingEnabled
        : DEFAULT_SETTINGS.activityReportingEnabled,
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

export function subscribeToSettings(
  onChange: (settings: ExtensionSettings) => void,
): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: chrome.storage.AreaName,
  ): void => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) {
      return;
    }
    void loadSettings().then(onChange);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

export async function getOrCreateDeviceId(): Promise<string> {
  const key = "lifeops.extension.deviceId";
  const existing = await chrome.storage.local.get(key);
  const current = existing[key];
  if (typeof current === "string" && current.length > 0) {
    return current;
  }
  const created = crypto.randomUUID();
  await chrome.storage.local.set({ [key]: created });
  return created;
}
