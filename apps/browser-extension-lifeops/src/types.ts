/**
 * Shared types for the LifeOps browser extension.
 *
 * These types describe the cross-component message protocol and the
 * payload shape shipped to the local agent via WebSocket.
 */

export interface DomainBucket {
  readonly domain: string;
  /** Cumulative focus time in milliseconds. */
  readonly focusMs: number;
  /** Number of distinct focus sessions folded into this bucket. */
  readonly sessionCount: number;
  /** ISO timestamp of the first observation folded into this bucket. */
  readonly firstObservedAt: string;
  /** ISO timestamp of the most recent observation folded into this bucket. */
  readonly lastObservedAt: string;
}

export interface TimeReport {
  readonly deviceId: string;
  readonly generatedAt: string;
  /** ISO timestamp marking the start of the reporting window. */
  readonly windowStart: string;
  /** ISO timestamp marking the end of the reporting window. */
  readonly windowEnd: string;
  readonly domains: readonly DomainBucket[];
}

export interface RegisterBrowserSessionPayload {
  readonly deviceId: string;
  readonly userAgent: string;
  readonly extensionVersion: string;
  readonly browserVendor: "chrome" | "safari" | "unknown";
}

export type OutboundMessage =
  | {
      readonly type: "register-session";
      readonly payload: RegisterBrowserSessionPayload;
    }
  | { readonly type: "time-report"; readonly payload: TimeReport }
  | {
      readonly type: "heartbeat";
      readonly payload: { readonly deviceId: string; readonly ts: string };
    };

export type InboundMessage =
  | { readonly type: "ack"; readonly correlationId?: string }
  | { readonly type: "ping" };

export interface ExtensionSettings {
  /** WebSocket URL for the desktop Milady agent endpoint. */
  readonly wsUrl: string;
  /** Flush interval in milliseconds. */
  readonly flushIntervalMs: number;
  /** Opt-in flag for the privacy-controlled activity reporting. */
  readonly activityReportingEnabled: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  wsUrl: "ws://127.0.0.1:31339/ext",
  flushIntervalMs: 60_000,
  activityReportingEnabled: true,
};

/** Internal messages between content scripts and the background worker. */
export type InternalMessage =
  | {
      readonly kind: "focus-changed";
      readonly payload: {
        readonly domain: string;
        readonly visible: boolean;
        readonly observedAt: number;
      };
    }
  | {
      readonly kind: "field-probe-result";
      readonly payload: {
        readonly domain: string;
        readonly fields: readonly {
          readonly name: string;
          readonly type: string;
          readonly autocomplete: string | null;
        }[];
      };
    };
