/**
 * Steward agent auto-setup and credential persistence.
 *
 * Split from steward-bridge.ts to stay within LOC limits.
 * @module api/steward-bridge-setup
 */

import crypto from "node:crypto";
import { StewardApiError } from "@stwd/sdk";
import {
  loadStewardCredentials,
  saveStewardCredentials,
} from "../services/steward-credentials";
import { normalizeEnvValueOrNull } from "../utils/env";
import {
  buildStewardHeaders,
  createStewardClient,
  resolveStewardAgentId,
} from "./steward-bridge-core";

const normalizeEnvValue = normalizeEnvValueOrNull;

// ── Types ────────────────────────────────────────────────────────────────────

export interface EnsureStewardAgentResult {
  agentId: string;
  agentName: string;
  walletAddresses: { evm: string | null; solana: string | null };
  created: boolean;
}

// ── Promise lock ─────────────────────────────────────────────────────────────

/** Promise-based lock to prevent concurrent ensureStewardAgent calls. */
let ensureStewardAgentPromise: Promise<EnsureStewardAgentResult | null> | null =
  null;

/**
 * Ensure the configured steward agent exists. If it doesn't, create it.
 *
 * This is a lazy-init function — call it on first request to steward-status,
 * not on server startup. It's idempotent and will only run once per process.
 *
 * If steward setup fails, logs a warning and returns null (does not throw).
 */
export function ensureStewardAgent(
  options: {
    agentId?: string;
    agentName?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<EnsureStewardAgentResult | null> {
  if (!ensureStewardAgentPromise) {
    ensureStewardAgentPromise = doEnsureStewardAgent(options);
  }
  return ensureStewardAgentPromise;
}

/** Reset the ensured flag (for testing). */
export function __resetStewardAgentEnsured(): void {
  ensureStewardAgentPromise = null;
}

// ── Implementation ───────────────────────────────────────────────────────────

async function doEnsureStewardAgent(
  options: {
    agentId?: string;
    agentName?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<EnsureStewardAgentResult | null> {
  const env = options.env ?? process.env;
  const baseUrl = normalizeEnvValue(env.STEWARD_API_URL);
  if (!baseUrl) {
    return null;
  }

  const agentId = options.agentId ?? resolveStewardAgentId(env) ?? null;

  if (!agentId) {
    return null;
  }

  const agentName = options.agentName ?? agentId;

  try {
    const client = createStewardClient({ env });
    if (!client) {
      return null;
    }

    // Check if agent exists
    try {
      const agent = (await client.getAgent(agentId)) as unknown as {
        id: string;
        name?: string;
        walletAddress?: string;
        walletAddresses?: { evm?: string; solana?: string };
      };

      const result: EnsureStewardAgentResult = {
        agentId,
        agentName: agent.name || agentName,
        walletAddresses: {
          evm:
            agent.walletAddresses?.evm?.trim() ||
            agent.walletAddress?.trim() ||
            null,
          solana: agent.walletAddresses?.solana?.trim() || null,
        },
        created: false,
      };

      // Update persisted credentials with wallet addresses
      persistAgentCredentials(baseUrl, env, result);

      return result;
    } catch (err: unknown) {
      if (
        !(err instanceof StewardApiError) ||
        (err as StewardApiError).status !== 404
      ) {
        throw err;
      }
    }

    // Agent doesn't exist — try to create it
    console.info(`[steward] Agent "${agentId}" not found, creating...`);

    const tenantId = normalizeEnvValue(env.STEWARD_TENANT_ID);
    const apiKey = normalizeEnvValue(env.STEWARD_API_KEY);

    // Try to create tenant first (may already exist, that's ok)
    if (tenantId && apiKey) {
      try {
        const tenantRes = await fetch(`${baseUrl}/tenants`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": normalizeEnvValue(env.STEWARD_MASTER_PASSWORD) ?? "",
          },
          body: JSON.stringify({
            id: tenantId,
            name: "Milady Desktop",
            apiKeyHash: crypto
              .createHash("sha256")
              .update(apiKey)
              .digest("hex"),
          }),
        });

        if (!tenantRes.ok) {
          const body = (await tenantRes.json().catch(() => ({}))) as {
            error?: string;
          };
          if (!body.error?.includes("already exists")) {
            console.warn(
              `[steward] Tenant creation returned ${tenantRes.status}: ${body.error}`,
            );
          }
        }
      } catch (tenantErr) {
        console.warn(
          `[steward] Tenant creation failed (non-fatal): ${
            tenantErr instanceof Error ? tenantErr.message : String(tenantErr)
          }`,
        );
      }
    }

    // Create agent
    const headers = buildStewardHeaders(env);
    const agentRes = await fetch(`${baseUrl}/agents`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: agentId, name: agentName }),
    });

    if (!agentRes.ok) {
      const errText = await agentRes.text().catch(() => "Unknown error");
      console.warn(
        `[steward] Agent creation failed (${agentRes.status}): ${errText}`,
      );
      return null;
    }

    const agentBody = (await agentRes.json()) as {
      ok: boolean;
      data?: {
        id: string;
        walletAddress?: string;
        walletAddresses?: { evm?: string; solana?: string };
      };
    };

    if (!agentBody.ok || !agentBody.data) {
      console.warn("[steward] Agent creation returned unexpected response");
      return null;
    }

    // Get agent token
    let agentToken = "";
    try {
      const tokenRes = await fetch(
        `${baseUrl}/agents/${encodeURIComponent(agentId)}/token`,
        { method: "POST", headers },
      );
      if (tokenRes.ok) {
        const tokenBody = (await tokenRes.json()) as {
          ok: boolean;
          data?: { token: string };
        };
        agentToken = tokenBody.data?.token ?? "";
      }
    } catch {
      console.warn("[steward] Token generation failed (non-fatal)");
    }

    const result: EnsureStewardAgentResult = {
      agentId,
      agentName,
      walletAddresses: {
        evm:
          agentBody.data.walletAddresses?.evm?.trim() ||
          agentBody.data.walletAddress?.trim() ||
          null,
        solana: agentBody.data.walletAddresses?.solana?.trim() || null,
      },
      created: true,
    };

    console.info(
      `[steward] Agent "${agentId}" created with wallet ${result.walletAddresses.evm ?? "(none)"}`,
    );

    // Persist credentials
    persistAgentCredentials(baseUrl, env, result, agentToken);

    return result;
  } catch (err) {
    console.warn(
      `[steward] Auto-setup failed (non-fatal): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

function persistAgentCredentials(
  apiUrl: string,
  env: NodeJS.ProcessEnv,
  result: EnsureStewardAgentResult,
  agentToken?: string,
): void {
  try {
    const existing = loadStewardCredentials();
    saveStewardCredentials({
      apiUrl,
      tenantId:
        normalizeEnvValue(env.STEWARD_TENANT_ID) ?? existing?.tenantId ?? "",
      agentId: result.agentId,
      apiKey: normalizeEnvValue(env.STEWARD_API_KEY) ?? existing?.apiKey ?? "",
      agentToken:
        agentToken ??
        normalizeEnvValue(env.STEWARD_AGENT_TOKEN) ??
        existing?.agentToken ??
        "",
      walletAddresses: {
        evm: result.walletAddresses.evm ?? undefined,
        solana: result.walletAddresses.solana ?? undefined,
      },
      agentName: result.agentName,
    });
  } catch (credErr) {
    console.warn(
      `[steward] Failed to persist credentials (non-fatal): ${
        credErr instanceof Error ? credErr.message : String(credErr)
      }`,
    );
  }
}
