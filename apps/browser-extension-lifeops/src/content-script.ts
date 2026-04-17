/**
 * Content script injected into every page.
 *
 * Responsibilities:
 *   1. Emit `focus-changed` events when the page's visibility state
 *      flips, so the background can credit/uncredit focus time even
 *      when tab/window events don't fire (e.g. switching focus within
 *      a single tab via browser chrome).
 *   2. Probe fillable fields on demand when the background requests
 *      them. The probe returns metadata only — no values, no content.
 */

import { probeFillableFields } from "./autofill/field-probe.js";
import type { InternalMessage } from "./types.js";

function currentDomain(): string {
  return location.hostname.toLowerCase();
}

function emitFocusChange(visible: boolean): void {
  const message: InternalMessage = {
    kind: "focus-changed",
    payload: {
      domain: currentDomain(),
      visible,
      observedAt: Date.now(),
    },
  };
  chrome.runtime.sendMessage(message).catch(() => {
    // Service worker may be asleep; the background re-wakes on the next
    // tab event. Dropping the occasional transition is acceptable.
  });
}

document.addEventListener("visibilitychange", () => {
  emitFocusChange(document.visibilityState === "visible");
});

window.addEventListener("focus", () => emitFocusChange(true));
window.addEventListener("blur", () => emitFocusChange(false));

// Initial probe: report the fields on this page so the agent knows what
// could be filled. This does not fill anything (T8f scope).
chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (!message || typeof message !== "object") {
      return false;
    }
    const kind = (message as { kind?: unknown }).kind;
    if (kind === "probe-fields") {
      const fields = probeFillableFields(document);
      const response: InternalMessage = {
        kind: "field-probe-result",
        payload: { domain: currentDomain(), fields },
      };
      sendResponse(response);
      return true;
    }
    return false;
  },
);

emitFocusChange(document.visibilityState === "visible");
