/**
 * Steward pending-approval queue, approve/deny, and history operations.
 *
 * Split from steward-bridge.ts to stay within LOC limits.
 * @module api/steward-bridge-approvals
 */

import type { TxRecord } from "@stwd/sdk";
import { normalizeEnvValueOrNull } from "../utils/env";
import { buildStewardHeaders } from "./steward-bridge-core";

const normalizeEnvValue = normalizeEnvValueOrNull;

function getStewardBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return normalizeEnvValue(env.STEWARD_API_URL);
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface StewardPendingEntry {
  queueId: string;
  status: string;
  requestedAt: string;
  transaction: TxRecord;
}

// ── Pending Approvals ────────────────────────────────────────────────────────

/**
 * Fetch pending approval queue from steward.
 * Returns empty array if the endpoint is not available (404).
 */
export async function getStewardPendingApprovals(
  agentId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StewardPendingEntry[]> {
  const baseUrl = getStewardBaseUrl(env);
  if (!baseUrl) throw new Error("Steward not configured");

  const headers = buildStewardHeaders(env);
  const res = await fetch(
    `${baseUrl}/vault/${encodeURIComponent(agentId)}/pending`,
    { headers },
  );

  if (res.status === 404) return [];

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(
      `Steward pending approvals failed (${res.status}): ${errText}`,
    );
  }

  const body = await res.json();
  return body.data ?? body ?? [];
}

// ── Approve / Deny ───────────────────────────────────────────────────────────

/**
 * Approve a pending transaction on steward.
 */
export async function approveStewardTransaction(
  agentId: string,
  txId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ txId: string; txHash?: string }> {
  const baseUrl = getStewardBaseUrl(env);
  if (!baseUrl) throw new Error("Steward not configured");

  const headers = buildStewardHeaders(env);
  const res = await fetch(
    `${baseUrl}/vault/${encodeURIComponent(agentId)}/approve/${encodeURIComponent(txId)}`,
    { method: "POST", headers },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Steward approve failed (${res.status}): ${errText}`);
  }

  const body = await res.json();
  return body.data ?? body;
}

/**
 * Deny/reject a pending transaction on steward.
 * Uses POST /vault/:agentId/reject/:txId
 */
export async function denyStewardTransaction(
  agentId: string,
  txId: string,
  reason?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ txId: string }> {
  const baseUrl = getStewardBaseUrl(env);
  if (!baseUrl) throw new Error("Steward not configured");

  const headers = buildStewardHeaders(env);
  const reqBody: Record<string, string> = {};
  if (reason) reqBody.reason = reason;

  const res = await fetch(
    `${baseUrl}/vault/${encodeURIComponent(agentId)}/reject/${encodeURIComponent(txId)}`,
    { method: "POST", headers, body: JSON.stringify(reqBody) },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Steward deny failed (${res.status}): ${errText}`);
  }

  const body = await res.json().catch(() => ({}));
  return body.data ?? body ?? { txId };
}

// ── History ──────────────────────────────────────────────────────────────────

/**
 * Fetch transaction history from steward.
 * Uses GET /vault/:agentId/history for full transaction records.
 */
export async function getStewardHistory(
  agentId: string,
  opts?: { limit?: number; offset?: number },
  env: NodeJS.ProcessEnv = process.env,
): Promise<TxRecord[]> {
  const baseUrl = getStewardBaseUrl(env);
  if (!baseUrl) throw new Error("Steward not configured");

  const headers = buildStewardHeaders(env);
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  const qs = params.toString() ? `?${params.toString()}` : "";

  const res = await fetch(
    `${baseUrl}/vault/${encodeURIComponent(agentId)}/history${qs}`,
    { headers },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Steward history failed (${res.status}): ${errText}`);
  }

  const body = await res.json();
  return body.data ?? body ?? [];
}
