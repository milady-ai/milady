/**
 * 1Password browser-extension bridge.
 *
 * Communicates with the published 1Password extension via
 * `chrome.runtime.sendMessage` + externally_connectable messaging. No
 * credential material ever enters the agent's LLM context — the agent only
 * specifies which field to fill; the password manager resolves the secret
 * and injects it itself (or hands us the value just long enough to call
 * the React-patched setter and drop the reference).
 *
 * If 1Password is not installed, `sendMessage` rejects with "Could not
 * establish connection"; we translate that into a structured refusal so
 * callers can degrade gracefully.
 */
import { createLogger } from "../logger.js";
import type {
  AutofillBridge,
  AutofillBridgeRequest,
  AutofillBridgeResponse,
} from "./autofill-engine.js";

const log = createLogger("autofill.onepassword");

/**
 * Published 1Password Chrome extension ID. Stable — used for
 * externally_connectable messaging.
 */
export const ONEPASSWORD_EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

type ChromeRuntimeLike = Pick<typeof chrome.runtime, "sendMessage">;

export interface OnePasswordBridgeOptions {
  readonly runtime?: ChromeRuntimeLike;
  readonly extensionId?: string;
}

interface OnePasswordResponse {
  readonly ok?: boolean;
  readonly reason?: string;
  readonly filled?: readonly string[];
}

export function createOnePasswordBridge(
  options: OnePasswordBridgeOptions = {},
): AutofillBridge {
  const runtime: ChromeRuntimeLike =
    options.runtime ??
    (typeof chrome !== "undefined" && chrome?.runtime
      ? chrome.runtime
      : {
          sendMessage: () =>
            Promise.reject(new Error("chrome.runtime unavailable")),
        });
  const extensionId = options.extensionId ?? ONEPASSWORD_EXTENSION_ID;

  return {
    name: "1password",
    async requestFill(
      request: AutofillBridgeRequest,
    ): Promise<AutofillBridgeResponse> {
      try {
        const raw = await runtime.sendMessage(extensionId, {
          type: "lifeops.autofill.requestFill",
          tabUrl: request.tabUrl,
          fieldPurpose: request.fieldPurpose,
          fieldSelector: request.fieldSelector ?? null,
          customKey: request.customKey ?? null,
        });
        const response = raw as OnePasswordResponse | undefined;
        if (!response || response.ok !== true) {
          const reason = response?.reason ?? "password-manager-refused";
          log.warn("1Password refused autofill", { reason });
          return { success: false, reason };
        }
        return { success: true, filledFields: response.filled ?? [] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes("Could not establish connection") ||
          message.includes("Receiving end does not exist") ||
          message.includes("chrome.runtime unavailable")
        ) {
          return { success: false, reason: "password-manager-not-installed" };
        }
        log.error("1Password bridge failure", { message });
        return { success: false, reason: "password-manager-error" };
      }
    },
  };
}
