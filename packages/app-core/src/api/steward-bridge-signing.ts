/**
 * Steward vault signing operations.
 *
 * Split from steward-bridge.ts to stay within LOC limits.
 * @module api/steward-bridge-signing
 */

import type {
  StewardSignRequest,
  StewardSignResponse,
} from "@miladyai/shared/contracts/wallet";
import {
  type PolicyResult,
  type SignTransactionInput,
  StewardApiError,
  type StewardClient,
} from "@stwd/sdk";
import { normalizeEnvValueOrNull } from "../utils/env";
import {
  buildStewardHeaders,
  createStewardClient,
  resolveStewardAgentId,
  type StewardBridgeOptions,
  type StewardExecutionResult,
} from "./steward-bridge-core";

const normalizeEnvValue = normalizeEnvValueOrNull;

/**
 * Sign a transaction through steward, returning either an executed result or
 * a pending-approval result with policy violations.
 */
export async function signTransactionWithOptionalSteward(params: {
  tx: SignTransactionInput;
  env?: NodeJS.ProcessEnv;
  evmAddress?: string | null;
  agentId?: string | null;
  client?: StewardClient | null;
}): Promise<StewardExecutionResult> {
  const env = params.env ?? process.env;
  const evmAddress = params.evmAddress ?? null;
  const agentId =
    params.agentId ?? resolveStewardAgentId(env, evmAddress) ?? null;
  const client = createStewardClient({
    env,
    evmAddress,
    agentId,
    client: params.client,
  });

  if (!client || !agentId) {
    throw new Error(
      "Steward credentials and agent ID must be provided to sign transactions.",
    );
  }

  // Basic tx shape validation before sending to steward.
  const tx = params.tx;
  if (!tx || typeof tx !== "object") {
    throw new Error("Transaction input is required and must be an object.");
  }
  if (!("to" in tx) || typeof tx.to !== "string" || !tx.to.trim()) {
    throw new Error("Transaction must include a valid 'to' address.");
  }

  const result = await client.signTransaction(agentId, tx);
  if ("txHash" in result) {
    return {
      mode: "steward",
      pendingApproval: false,
      txHash: result.txHash,
    };
  }

  if ("results" in result) {
    return {
      mode: "steward",
      pendingApproval: true,
      policyResults: result.results,
    };
  }

  throw new Error("Steward returned an unsigned transaction unexpectedly");
}

function normalizeViolations(
  raw: unknown,
): Array<{ policy: string; reason: string }> | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter(
      (v): v is { policy: string; reason: string } =>
        !!v &&
        typeof v === "object" &&
        typeof (v as Record<string, unknown>).policy === "string" &&
        typeof (v as Record<string, unknown>).reason === "string",
    )
    .map((v) => ({ policy: v.policy, reason: v.reason }));
}

/**
 * Sign (and optionally broadcast) a transaction through the Steward vault.
 *
 * This calls `POST /vault/:agentId/sign` directly. The three possible outcomes
 * are mapped to a unified {@link StewardSignResponse}:
 *
 * - **Approved** (HTTP 200): `{ approved: true, txHash }`.
 * - **Pending approval** (HTTP 202): `{ approved: false, pending: true, txId }`.
 * - **Denied** (HTTP 403): `{ approved: false, denied: true, violations }`.
 */
export async function signViaSteward(
  request: StewardSignRequest,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StewardSignResponse> {
  const baseUrl = normalizeEnvValue(env.STEWARD_API_URL);
  if (!baseUrl) throw new Error("Steward not configured");

  const evmAddress =
    normalizeEnvValue(env.EVM_ADDRESS) ??
    normalizeEnvValue(env.MILADY_EVM_ADDRESS) ??
    null;
  const agentId = resolveStewardAgentId(env, evmAddress);
  if (!agentId) throw new Error("Steward agent ID not resolved");

  const headers = buildStewardHeaders(env);
  const res = await fetch(
    `${baseUrl}/vault/${encodeURIComponent(agentId)}/sign`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: request.to,
        value: request.value,
        chainId: request.chainId,
        data: request.data,
        broadcast: request.broadcast ?? true,
        description: request.description,
      }),
    },
  );

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  // Approved — HTTP 200
  if (res.ok && body.ok === true) {
    const data = (body.data ?? {}) as Record<string, unknown>;
    return {
      approved: true,
      txHash: typeof data.txHash === "string" ? data.txHash : undefined,
    };
  }

  // Pending approval — HTTP 202
  if (res.status === 202) {
    const data = (body.data ?? {}) as Record<string, unknown>;
    return {
      approved: false,
      pending: true,
      txId: typeof data.txId === "string" ? data.txId : undefined,
      violations: normalizeViolations(data.violations),
    };
  }

  // Denied — HTTP 403
  if (res.status === 403) {
    const data = (body.data ?? {}) as Record<string, unknown>;
    return {
      approved: false,
      denied: true,
      violations: normalizeViolations(data.violations),
    };
  }

  // Unexpected error
  const errMsg =
    typeof body.error === "string"
      ? body.error
      : `Steward sign failed (${res.status})`;
  throw new Error(errMsg);
}
