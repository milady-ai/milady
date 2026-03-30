/**
 * Steward webhook event buffer and registration.
 *
 * Split from steward-bridge.ts to stay within LOC limits.
 * @module api/steward-bridge-webhooks
 */

import { normalizeEnvValueOrNull } from "../utils/env";
import {
  buildStewardHeaders,
  isStewardConfigured,
} from "./steward-bridge-core";

const normalizeEnvValue = normalizeEnvValueOrNull;

// ── Webhook Types ────────────────────────────────────────────────────────────

export type StewardWebhookEventType =
  | "tx.pending"
  | "tx.approved"
  | "tx.denied"
  | "tx.confirmed";

export interface StewardWebhookEvent {
  event: StewardWebhookEventType;
  data: Record<string, unknown>;
  timestamp?: string;
}

// ── Ring Buffer ──────────────────────────────────────────────────────────────

const MAX_WEBHOOK_EVENTS = 200;

/**
 * In-memory ring buffer for recent webhook events from steward.
 * The UI can poll these to get near-real-time updates without WebSocket.
 */
const recentWebhookEvents: StewardWebhookEvent[] = [];

/** Push a webhook event into the in-memory buffer. */
export function pushWebhookEvent(event: StewardWebhookEvent): void {
  recentWebhookEvents.push(event);
  if (recentWebhookEvents.length > MAX_WEBHOOK_EVENTS) {
    recentWebhookEvents.splice(
      0,
      recentWebhookEvents.length - MAX_WEBHOOK_EVENTS,
    );
  }
}

/** Read recent webhook events, optionally filtered by event type. */
export function getRecentWebhookEvents(
  eventType?: StewardWebhookEventType,
  sinceIndex = 0,
): { events: StewardWebhookEvent[]; nextIndex: number } {
  const all = eventType
    ? recentWebhookEvents.filter((e) => e.event === eventType)
    : recentWebhookEvents;
  const events = all.slice(sinceIndex);
  return { events, nextIndex: recentWebhookEvents.length };
}

// ── Webhook Registration ─────────────────────────────────────────────────────

/**
 * Register a webhook URL with steward so it pushes tx events to milady.
 * Calls PUT /tenants/:tenantId with { webhookUrl }.
 */
export async function registerStewardWebhook(
  webhookUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const baseUrl = normalizeEnvValue(env.STEWARD_API_URL);
  if (!baseUrl) throw new Error("Steward not configured");

  const tenantId = normalizeEnvValue(env.STEWARD_TENANT_ID);
  if (!tenantId)
    throw new Error("STEWARD_TENANT_ID not set — cannot register webhook");

  const headers = buildStewardHeaders(env);
  const res = await fetch(
    `${baseUrl}/tenants/${encodeURIComponent(tenantId)}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ webhookUrl }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(
      `Steward webhook registration failed (${res.status}): ${errText}`,
    );
  }
}

/**
 * Attempt to register the local webhook endpoint with steward.
 * Logs but does not throw on failure (best-effort).
 */
export async function tryRegisterStewardWebhook(
  port = 31337,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!isStewardConfigured(env)) return;

  const webhookUrl = `http://127.0.0.1:${port}/api/wallet/steward-webhook`;
  try {
    await registerStewardWebhook(webhookUrl, env);
    console.info(`[steward] Webhook registered: ${webhookUrl}`);
  } catch (err) {
    console.warn(
      `[steward] Webhook registration failed (non-fatal): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
