/**
 * Steward bridge — core client creation, status, auth helpers, and types.
 *
 * This is the foundational module that other steward-bridge-* modules import.
 * @module api/steward-bridge-core
 */

import { StewardApiError, StewardClient } from "@stwd/sdk";
import { resolveEffectiveStewardConfig } from "../services/steward-credentials";
import { normalizeEnvValueOrNull } from "../utils/env";

// ── Types ────────────────────────────────────────────────────────────────────

export interface StewardBridgeOptions {
  env?: NodeJS.ProcessEnv;
  evmAddress?: string | null;
  agentId?: string | null;
  client?: StewardClient | null;
}

export interface StewardBridgeStatus {
  configured: boolean;
  available: boolean;
  connected: boolean;
  baseUrl: string | null;
  agentId: string | null;
  evmAddress: string | null;
  error: string | null;
  walletAddresses?: { evm: string | null; solana: string | null };
  agentName?: string;
  vaultHealth?: "ok" | "degraded" | "error";
}

export interface StewardPendingApprovalResult {
  mode: "steward";
  pendingApproval: true;
  policyResults: import("@stwd/sdk").PolicyResult[];
}

export interface StewardSignedTransactionResult {
  mode: "steward";
  pendingApproval: false;
  txHash: string;
}

export type StewardExecutionResult =
  | StewardPendingApprovalResult
  | StewardSignedTransactionResult;

export interface StewardWalletAddresses {
  evmAddress: string | null;
  solanaAddress: string | null;
}

export interface StewardBalanceResult {
  balance: string;
  formatted: string;
  symbol: string;
  chainId: number;
}

export interface StewardTokenBalancesResult {
  native: {
    balance: string;
    formatted: string;
    symbol: string;
    chainId: number;
  };
  tokens: Array<{
    address: string;
    symbol: string;
    name: string;
    balance: string;
    formatted: string;
    decimals: number;
    valueUsd?: string;
    logoUrl?: string;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Alias for steward-specific env resolution. */
const normalizeEnvValue = normalizeEnvValueOrNull;

export function resolveStewardAgentId(
  env: NodeJS.ProcessEnv = process.env,
  evmAddress?: string | null,
): string | null {
  return (
    normalizeEnvValue(env.STEWARD_AGENT_ID) ??
    normalizeEnvValue(env.MILADY_STEWARD_AGENT_ID) ??
    normalizeEnvValue(env.ELIZA_STEWARD_AGENT_ID) ??
    evmAddress?.trim() ??
    null
  );
}

export function createStewardClient(
  options: StewardBridgeOptions = {},
): StewardClient | null {
  if (options.client !== undefined) {
    return options.client;
  }

  const env = options.env ?? process.env;
  const baseUrl = normalizeEnvValue(env.STEWARD_API_URL);
  if (!baseUrl) {
    return null;
  }

  return new StewardClient({
    baseUrl,
    bearerToken: normalizeEnvValue(env.STEWARD_AGENT_TOKEN) ?? undefined,
    apiKey: normalizeEnvValue(env.STEWARD_API_KEY) ?? undefined,
    tenantId: normalizeEnvValue(env.STEWARD_TENANT_ID) ?? undefined,
  });
}

/** Check if Steward env vars are configured (synchronous, no network). */
export function isStewardConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const url = normalizeEnvValue(env.STEWARD_API_URL);
  const agentId = resolveStewardAgentId(env);
  return Boolean(url && agentId);
}

export function formatStewardError(error: unknown): string {
  if (error instanceof StewardApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Build auth headers for direct steward API calls.
 * Used for endpoints not yet exposed in the SDK (pending, approve, deny).
 */
export function buildStewardHeaders(
  env: NodeJS.ProcessEnv = process.env,
): Headers {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");

  const bearerToken = normalizeEnvValue(env.STEWARD_AGENT_TOKEN);
  const apiKey = normalizeEnvValue(env.STEWARD_API_KEY);
  const tenantId = normalizeEnvValue(env.STEWARD_TENANT_ID);

  if (bearerToken) {
    headers.set("Authorization", `Bearer ${bearerToken}`);
  } else if (apiKey) {
    headers.set("X-Steward-Key", apiKey);
  }
  if (tenantId) {
    headers.set("X-Steward-Tenant", tenantId);
  }
  return headers;
}

// ── Status ───────────────────────────────────────────────────────────────────

export async function getStewardBridgeStatus(
  options: StewardBridgeOptions = {},
): Promise<StewardBridgeStatus> {
  const env = options.env ?? process.env;
  const baseUrl = normalizeEnvValue(env.STEWARD_API_URL);
  const evmAddress = options.evmAddress ?? null;
  const agentId = options.agentId ?? resolveStewardAgentId(env, evmAddress);
  const client = createStewardClient(options);

  if (!baseUrl || !client) {
    // Check persisted credentials as fallback
    const persisted = resolveEffectiveStewardConfig(env);
    if (!persisted || !persisted.apiUrl) {
      return {
        configured: false,
        available: false,
        connected: false,
        baseUrl,
        agentId,
        evmAddress,
        error: null,
      };
    }

    // Re-derive from persisted credentials
    const fallbackClient = new StewardClient({
      baseUrl: persisted.apiUrl,
      bearerToken: persisted.agentToken || undefined,
      apiKey: persisted.apiKey || undefined,
      tenantId: persisted.tenantId || undefined,
    });
    const fallbackAgentId = persisted.agentId || agentId;

    if (!fallbackClient || !fallbackAgentId) {
      return {
        configured: false,
        available: false,
        connected: false,
        baseUrl: persisted.apiUrl,
        agentId: fallbackAgentId,
        evmAddress,
        error: null,
      };
    }

    // Use persisted values for the rest of this function
    try {
      type AgentDataShape = {
        walletAddress?: string;
        walletAddresses?: { evm?: string; solana?: string };
        name?: string;
      };
      let agentData: AgentDataShape | null = null;

      if (fallbackAgentId) {
        try {
          agentData = (await fallbackClient.getAgent(
            fallbackAgentId,
          )) as unknown as AgentDataShape;
        } catch (error: unknown) {
          if (
            !(error instanceof StewardApiError) ||
            ((error as StewardApiError).status !== 404 &&
              (error as StewardApiError).status !== 400)
          ) {
            throw error;
          }
        }
      }

      const walletAddresses = agentData
        ? {
            evm:
              agentData.walletAddresses?.evm?.trim() ||
              agentData.walletAddress?.trim() ||
              null,
            solana: agentData.walletAddresses?.solana?.trim() || null,
          }
        : undefined;

      return {
        configured: true,
        available: true,
        connected: true,
        baseUrl: persisted.apiUrl,
        agentId: fallbackAgentId,
        evmAddress: walletAddresses?.evm ?? evmAddress,
        error: null,
        walletAddresses,
        agentName: agentData?.name || undefined,
        vaultHealth: fallbackAgentId && !agentData ? "degraded" : "ok",
      };
    } catch (error) {
      return {
        configured: true,
        available: false,
        connected: false,
        baseUrl: persisted.apiUrl,
        agentId: fallbackAgentId,
        evmAddress,
        error: formatStewardError(error),
        vaultHealth: "error",
      };
    }
  }

  try {
    type AgentDataShape = {
      walletAddress?: string;
      walletAddresses?: { evm?: string; solana?: string };
      name?: string;
    };
    let agentData: AgentDataShape | null = null;

    if (agentId) {
      try {
        agentData = (await client.getAgent(
          agentId,
        )) as unknown as AgentDataShape;
      } catch (error: unknown) {
        if (
          !(error instanceof StewardApiError) ||
          ((error as StewardApiError).status !== 404 &&
            (error as StewardApiError).status !== 400)
        ) {
          throw error;
        }
      }
    } else {
      await client.listAgents();
    }

    const walletAddresses = agentData
      ? {
          evm:
            agentData.walletAddresses?.evm?.trim() ||
            agentData.walletAddress?.trim() ||
            null,
          solana: agentData.walletAddresses?.solana?.trim() || null,
        }
      : undefined;

    const agentName = agentData?.name || undefined;

    let vaultHealth: "ok" | "degraded" | "error" = "ok";
    if (agentId && !agentData) {
      vaultHealth = "degraded";
    }

    return {
      configured: true,
      available: true,
      connected: true,
      baseUrl,
      agentId,
      evmAddress: walletAddresses?.evm ?? evmAddress,
      error: null,
      walletAddresses,
      agentName,
      vaultHealth,
    };
  } catch (error) {
    return {
      configured: true,
      available: false,
      connected: false,
      baseUrl,
      agentId,
      evmAddress,
      error: formatStewardError(error),
      vaultHealth: "error",
    };
  }
}

// ── Wallet address / balance / token helpers ─────────────────────────────────

/**
 * Fetch steward-managed wallet addresses for the configured agent.
 */
export async function getStewardWalletAddresses(
  options: StewardBridgeOptions = {},
): Promise<StewardWalletAddresses> {
  const env = options.env ?? process.env;
  const evmAddr = options.evmAddress ?? null;
  const agentId =
    options.agentId ?? resolveStewardAgentId(env, evmAddr) ?? null;
  const client = createStewardClient(options);

  if (!client || !agentId) {
    return { evmAddress: null, solanaAddress: null };
  }

  const agent = (await client.getAgent(agentId)) as unknown as {
    walletAddress?: string;
    walletAddresses?: { evm?: string; solana?: string };
  };

  const evmAddress =
    agent.walletAddresses?.evm?.trim() || agent.walletAddress?.trim() || null;
  const solanaAddress = agent.walletAddresses?.solana?.trim() || null;

  return { evmAddress, solanaAddress };
}

/**
 * Fetch the native balance for a steward-managed agent wallet.
 */
export async function getStewardBalance(
  agentId: string,
  chainId?: number,
  options: StewardBridgeOptions = {},
): Promise<StewardBalanceResult> {
  const client = createStewardClient(options);
  if (!client) throw new Error("Steward not configured");

  const result = await client.getBalance(agentId, chainId);
  return {
    balance: result.balances.native,
    formatted: result.balances.nativeFormatted,
    symbol: result.balances.symbol,
    chainId: result.balances.chainId,
  };
}

/**
 * Fetch token balances for a steward-managed agent wallet.
 */
export async function getStewardTokenBalances(
  agentId: string,
  chainId?: number,
  options: StewardBridgeOptions = {},
): Promise<StewardTokenBalancesResult> {
  const env = options.env ?? process.env;
  const baseUrl = normalizeEnvValue(env.STEWARD_API_URL);
  if (!baseUrl) throw new Error("Steward not configured");

  const headers = buildStewardHeaders(env);
  const qs = chainId != null ? `?chainId=${encodeURIComponent(chainId)}` : "";
  const res = await fetch(
    `${baseUrl}/agents/${encodeURIComponent(agentId)}/tokens${qs}`,
    { headers },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(
      `Steward token balances failed (${res.status}): ${errText}`,
    );
  }

  const body = (await res.json()) as {
    ok?: boolean;
    data?: StewardTokenBalancesResult;
  };
  return (
    body.data ?? {
      native: {
        balance: "0",
        formatted: "0",
        symbol: "???",
        chainId: chainId ?? 0,
      },
      tokens: [],
    }
  );
}
