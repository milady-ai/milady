/**
 * Vision-consent gate (client-side complement of A-7).
 *
 * Product rules (per `feedback_plugin_vision_cost.md`):
 *   - Vision/screen-capture is OFF by default.
 *   - Never auto-capture; an explicit user action is always required.
 *   - For remote vision models, surface a cost warning before consent.
 *   - Consent is persisted in SecureStore (tamper-resistant) and revocable
 *     from a settings panel.
 *
 * SOC2 refs: CC6.1.
 */

import { emitClientAudit } from "../secure-store/audit.js";
import type { SecureStore } from "../secure-store/types.js";

export const VISION_CONSENT_STORAGE_KEY = "eliza.security.vision-consent.v1";

export type VisionProvider = "local" | "remote";

export interface VisionConsentRecord {
  decision: "granted" | "denied";
  /** Provider class at the moment of the decision. */
  provider: VisionProvider;
  /** ISO-8601 timestamp. */
  decidedAt: string;
  /** Optional opaque session id from the requesting plugin. */
  sessionId?: string;
}

export interface VisionConsentStore {
  get(): Promise<VisionConsentRecord | null>;
  grant(input: {
    provider: VisionProvider;
    sessionId?: string;
  }): Promise<VisionConsentRecord>;
  revoke(reason?: string): Promise<void>;
  /**
   * Returns true if a current grant authorizes the requested provider class.
   * Always false on a missing record — consent is explicit, never inferred.
   */
  isAllowed(provider: VisionProvider): Promise<boolean>;
}

export function createVisionConsentStore(
  store: SecureStore,
): VisionConsentStore {
  return {
    async get() {
      const raw = await store.get(VISION_CONSENT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as VisionConsentRecord;
      if (parsed.decision !== "granted" && parsed.decision !== "denied") {
        return null;
      }
      return parsed;
    },

    async grant({ provider, sessionId }) {
      const record: VisionConsentRecord = {
        decision: "granted",
        provider,
        decidedAt: new Date().toISOString(),
        sessionId,
      };
      await store.set(VISION_CONSENT_STORAGE_KEY, JSON.stringify(record));
      emitClientAudit({
        action: "vision.allowed",
        result: "success",
        metadata: {
          provider,
          ...(sessionId ? { session_id: sessionId } : {}),
        },
      });
      return record;
    },

    async revoke(reason) {
      const record: VisionConsentRecord = {
        decision: "denied",
        provider: "local",
        decidedAt: new Date().toISOString(),
      };
      await store.set(VISION_CONSENT_STORAGE_KEY, JSON.stringify(record));
      emitClientAudit({
        action: "vision.denied",
        result: "success",
        metadata: reason ? { reason } : {},
      });
    },

    async isAllowed(provider) {
      const raw = await store.get(VISION_CONSENT_STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as VisionConsentRecord;
      if (parsed.decision !== "granted") return false;
      // Remote consent implies the user accepted the cost warning; we treat
      // remote as a superset of local for permission purposes.
      if (provider === "local") return true;
      return parsed.provider === "remote";
    },
  };
}
