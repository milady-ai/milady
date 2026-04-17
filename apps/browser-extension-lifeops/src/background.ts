/**
 * Background service worker.
 *
 * Responsibilities:
 *   1. Maintain the WebSocket channel to the local agent.
 *   2. Listen to focus signals (tab/window/visibility) and feed them into
 *      the TimeAggregator.
 *   3. Flush per-domain focus time to the agent every `flushIntervalMs`.
 *   4. Respect `chrome.privacy` — if activity reporting is disabled the
 *      flush loop stays idle.
 */

import { createLogger } from "./logger.js";
import { AgentChannel } from "./messaging/native-messaging.js";
import {
  getOrCreateDeviceId,
  loadSettings,
  subscribeToSettings,
} from "./settings.js";
import { installFocusTracker } from "./tracker/focus-tracker.js";
import { registrableDomain, TimeAggregator } from "./tracker/time-on-site.js";
import type {
  ExtensionSettings,
  InternalMessage,
  OutboundMessage,
} from "./types.js";

const log = createLogger("background");
const FLUSH_ALARM = "lifeops.flush";

interface RuntimeState {
  readonly aggregator: TimeAggregator;
  readonly channel: AgentChannel;
  deviceId: string;
  settings: ExtensionSettings;
}

let state: RuntimeState | null = null;

async function bootstrap(): Promise<RuntimeState> {
  const settings = await loadSettings();
  const deviceId = await getOrCreateDeviceId();
  const aggregator = new TimeAggregator(Date.now());
  const channel = new AgentChannel({ url: settings.wsUrl });

  const next: RuntimeState = { aggregator, channel, deviceId, settings };

  installFocusTracker({ aggregator, now: () => Date.now() });
  channel.start();

  // Announce our presence to the agent.
  const vendor = detectBrowserVendor();
  const manifest = chrome.runtime.getManifest();
  const registration: OutboundMessage = {
    type: "register-session",
    payload: {
      deviceId,
      userAgent: navigator.userAgent,
      extensionVersion: manifest.version,
      browserVendor: vendor,
    },
  };
  channel.send(registration);

  await ensureFlushAlarm(settings.flushIntervalMs);
  log.info("bootstrapped", { deviceId, wsUrl: settings.wsUrl });

  return next;
}

async function ensureFlushAlarm(flushIntervalMs: number): Promise<void> {
  const periodInMinutes = Math.max(1, Math.round(flushIntervalMs / 60_000));
  await chrome.alarms.clear(FLUSH_ALARM);
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes });
}

function detectBrowserVendor(): "chrome" | "safari" | "unknown" {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("safari") && !ua.includes("chrome")) {
    return "safari";
  }
  if (ua.includes("chrome")) {
    return "chrome";
  }
  return "unknown";
}

async function isPrivacyAllowed(): Promise<boolean> {
  if (!state) {
    return false;
  }
  if (!state.settings.activityReportingEnabled) {
    return false;
  }
  // chrome.privacy is only present in desktop Chromium; Safari lacks it.
  // When present, honor the global "do not track" signal as a soft opt-out.
  const networkPredictionEnabled =
    chrome.privacy?.network?.networkPredictionEnabled;
  if (!networkPredictionEnabled) {
    return true;
  }
  const details = await new Promise<chrome.types.ChromeSettingGetResultDetails>(
    (resolve) => {
      networkPredictionEnabled.get({}, (d) =>
        resolve(d as chrome.types.ChromeSettingGetResultDetails),
      );
    },
  );
  // If the user has explicitly disabled network prediction, treat it as a
  // signal to be conservative — reporting stays off.
  return (details as { value?: unknown }).value !== false;
}

async function flush(): Promise<void> {
  if (!state) {
    return;
  }
  if (!(await isPrivacyAllowed())) {
    log.debug("flush skipped due to privacy opt-out");
    return;
  }
  const report = state.aggregator.flush(state.deviceId, Date.now());
  state.channel.send({ type: "time-report", payload: report });
  state.channel.send({
    type: "heartbeat",
    payload: { deviceId: state.deviceId, ts: new Date().toISOString() },
  });
  log.debug("flushed", { domains: report.domains.length });
}

function handleInternalMessage(msg: InternalMessage): void {
  if (!state) {
    return;
  }
  if (msg.kind === "focus-changed") {
    const domain = msg.payload.visible ? msg.payload.domain : "";
    state.aggregator.recordFocusChange(
      domain,
      msg.payload.visible,
      msg.payload.observedAt,
    );
  }
}

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (isInternalMessage(message)) {
      handleInternalMessage(message);
      sendResponse({ ok: true });
    }
    return false;
  },
);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM) {
    void flush();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  void bootstrap().then((next) => {
    state = next;
  });
});

chrome.runtime.onStartup.addListener(() => {
  void bootstrap().then((next) => {
    state = next;
  });
});

// Service workers may be evicted and re-instantiated; ensure we bootstrap on
// the first tick when state is absent.
void bootstrap().then((next) => {
  state = next;
  // React to settings changes (options page writes).
  subscribeToSettings(async (settings) => {
    if (!state) {
      return;
    }
    const changed = state.settings.wsUrl !== settings.wsUrl;
    state.settings = settings;
    if (changed) {
      state.channel.setUrl(settings.wsUrl);
    }
    await ensureFlushAlarm(settings.flushIntervalMs);
  });
});

chrome.tabs.onActivated.addListener(async (info) => {
  const tab = await chrome.tabs.get(info.tabId).catch(() => null);
  if (!tab?.url) {
    return;
  }
  const domain = registrableDomain(tab.url);
  log.debug("active tab domain", { domain });
});

function isInternalMessage(value: unknown): value is InternalMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const kind = (value as { kind?: unknown }).kind;
  return kind === "focus-changed" || kind === "field-probe-result";
}
