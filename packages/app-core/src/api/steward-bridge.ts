import {
  StewardApiError,
  StewardClient,
  type PolicyResult,
  type SignTransactionInput,
} from "@stwd/sdk";

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
}

export interface StewardPendingApprovalResult {
  mode: "steward";
  pendingApproval: true;
  policyResults: PolicyResult[];
}

export interface StewardSignedTransactionResult {
  mode: "steward";
  pendingApproval: false;
  txHash: string;
}

export type StewardExecutionResult =
  | StewardPendingApprovalResult
  | StewardSignedTransactionResult;

function normalizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

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

export async function getStewardBridgeStatus(
  options: StewardBridgeOptions = {},
): Promise<StewardBridgeStatus> {
  const env = options.env ?? process.env;
  const baseUrl = normalizeEnvValue(env.STEWARD_API_URL);
  const evmAddress = options.evmAddress ?? null;
  const agentId = options.agentId ?? resolveStewardAgentId(env, evmAddress);
  const client = createStewardClient(options);

  if (!baseUrl || !client) {
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

  try {
    if (agentId) {
      try {
        await client.getAgent(agentId);
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

    return {
      configured: true,
      available: true,
      connected: true,
      baseUrl,
      agentId,
      evmAddress,
      error: null,
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
    };
  }
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
    throw new Error("Steward credentials and agent ID must be provided to sign transactions.");
  }

  try {
    const result = await client.signTransaction(agentId, params.tx);
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
  } catch (error) {
    throw error;
  }
}
