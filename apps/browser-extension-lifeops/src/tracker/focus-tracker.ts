/**
 * Focus-tracker wiring for the background service worker.
 *
 * Subscribes to the Chrome extension events that signal a focus
 * transition — tab activation, window focus, and tab URL updates —
 * and forwards normalized focus-change events to a TimeAggregator.
 *
 * Content-script-side `visibilitychange` events are delivered via
 * `chrome.runtime.sendMessage` with kind `focus-changed`.
 */

import { createLogger } from "../logger.js";
import { registrableDomain, type TimeAggregator } from "./time-on-site.js";

const log = createLogger("focus-tracker");

export interface FocusTrackerDeps {
  readonly aggregator: TimeAggregator;
  readonly now: () => number;
}

export function installFocusTracker(deps: FocusTrackerDeps): void {
  const { aggregator, now } = deps;

  chrome.tabs.onActivated.addListener(async (info) => {
    const tab = await chrome.tabs.get(info.tabId).catch(() => null);
    const url = tab?.url ?? "";
    const domain = registrableDomain(url);
    log.debug("tab activated", { tabId: info.tabId, domain });
    aggregator.recordFocusChange(domain, true, now());
  });

  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (!tab.active) {
      return;
    }
    if (!changeInfo.url && changeInfo.status !== "complete") {
      return;
    }
    const domain = registrableDomain(tab.url ?? "");
    log.debug("tab updated", { tabId: _tabId, domain });
    aggregator.recordFocusChange(domain, true, now());
  });

  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      log.debug("window lost focus");
      aggregator.recordFocusChange("", false, now());
      return;
    }
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    const domain = registrableDomain(tab?.url ?? "");
    log.debug("window focused", { windowId, domain });
    aggregator.recordFocusChange(domain, true, now());
  });
}
