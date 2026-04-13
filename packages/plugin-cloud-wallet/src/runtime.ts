import { normalizeCloudSiteUrl } from "../../agent/src/cloud/base-url.ts";
import { ElizaCloudClient } from "../../agent/src/cloud/bridge-client.ts";
import type { CloudRpcExecutor, RuntimeLike } from "./types.ts";

export interface CreateRuntimeCloudRpcExecutorOptions {
  apiKey?: string;
  baseUrl?: string;
}

export function getRuntimeSetting(
  runtime: RuntimeLike,
  key: string,
  override?: string,
): string | undefined {
  const value =
    override ?? runtime.getSetting(key) ?? process.env[key] ?? undefined;
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function requireRuntimeSetting(
  runtime: RuntimeLike,
  key: string,
  override?: string,
): string {
  const value = getRuntimeSetting(runtime, key, override);
  if (!value) {
    throw new Error(`[cloud-wallet] missing setting ${key}`);
  }
  return value;
}

export function createRuntimeCloudRpcExecutor(
  runtime: RuntimeLike,
  options: CreateRuntimeCloudRpcExecutorOptions = {},
): CloudRpcExecutor {
  const apiKey = requireRuntimeSetting(
    runtime,
    "ELIZAOS_CLOUD_API_KEY",
    options.apiKey,
  );
  const baseUrl = normalizeCloudSiteUrl(
    getRuntimeSetting(runtime, "ELIZAOS_CLOUD_BASE_URL", options.baseUrl),
  );
  const client = new ElizaCloudClient(baseUrl, apiKey);

  return {
    executeRpc(envelope, execOptions) {
      if (execOptions?.correlationId) {
        return client.executeRpc({
          ...envelope,
          correlationId: execOptions.correlationId,
        });
      }
      return client.executeRpc(envelope);
    },
  };
}
