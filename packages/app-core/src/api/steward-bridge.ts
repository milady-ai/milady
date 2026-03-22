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

export interface LocalFallbackResult<TLocal> {
  mode: "local";
  pendingApproval: false;
  fallbackUsed: boolean;
  stewardError: string | null;
  result: TLocal;
}

export type StewardExecutionResult<TLocal> =
  | StewardPendingApprovalResult
  | StewardSignedTransactionResult
  | LocalFallbackResult<TLocal>;

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
      } catch (error) {
        if (
          !(error instanceof StewardApiError) ||
          (error.status !== 404 && error.status !== 400)
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

export async function signTransactionWithOptionalSteward<TLocal>(params: {
  tx: SignTransactionInput;
  env?: NodeJS.ProcessEnv;
  evmAddress?: string | null;
  agentId?: string | null;
  client?: StewardClient | null;
  fallback: () => Promise<TLocal>;
}): Promise<StewardExecutionResult<TLocal>> {
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
    return {
      mode: "local",
      pendingApproval: false,
      fallbackUsed: false,
      stewardError: null,
      result: await params.fallback(),
    };
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

    return {
      mode: "steward",
      pendingApproval: true,
      policyResults: result.results,
    };
  } catch (error) {
    console.warn('[steward-bridge] Steward unreachable, falling back to local signing');
    return {
      mode: "local",
      pendingApproval: false,
      fallbackUsed: true,
      stewardError: formatStewardError(error),
      result: await params.fallback(),
    };
  }
}
