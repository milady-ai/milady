/**
 * ProtonPass browser-extension bridge.
 *
 * Mirrors `onepassword-bridge.ts`: the agent names the field to fill, this
 * bridge asks ProtonPass to resolve the secret and inject it. The agent
 * never sees credential material.
 */
import { createLogger } from "../logger.js";
import type {
  AutofillBridge,
  AutofillBridgeRequest,
  AutofillBridgeResponse,
} from "./autofill-engine.js";

const log = createLogger("autofill.protonpass");

/** Published ProtonPass Chrome extension ID. */
export const PROTONPASS_EXTENSION_ID = "ghmbeldphafepmbegfdlkpapeffhfhoj";

type ChromeRuntimeLike = Pick<typeof chrome.runtime, "sendMessage">;

export interface ProtonPassBridgeOptions {
  readonly runtime?: ChromeRuntimeLike;
  readonly extensionId?: string;
}

interface ProtonPassResponse {
  readonly ok?: boolean;
  readonly reason?: string;
  readonly filled?: readonly string[];
}

export function createProtonPassBridge(
  options: ProtonPassBridgeOptions = {},
): AutofillBridge {
  const runtime: ChromeRuntimeLike =
    options.runtime ??
    (typeof chrome !== "undefined" && chrome?.runtime
      ? chrome.runtime
      : {
          sendMessage: () =>
            Promise.reject(new Error("chrome.runtime unavailable")),
        });
  const extensionId = options.extensionId ?? PROTONPASS_EXTENSION_ID;

  return {
    name: "protonpass",
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
        const response = raw as ProtonPassResponse | undefined;
        if (!response || response.ok !== true) {
          const reason = response?.reason ?? "password-manager-refused";
          log.warn("ProtonPass refused autofill", { reason });
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
        log.error("ProtonPass bridge failure", { message });
        return { success: false, reason: "password-manager-error" };
      }
    },
  };
}
