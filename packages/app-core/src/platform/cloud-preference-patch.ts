import {
  inferOnboardingConnectionFromConfig,
  isLocalProviderConnection,
} from "@miladyai/shared/contracts/onboarding";
import type {
  CloudPreferenceClientLike as ClientLike,
  CloudPreferencePatchState as PatchState,
} from "./types";

const PATCH_STATE = Symbol.for("milady.cloudPreferencePatch");

type StorageConfig = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(
  source: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = source?.[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBoolean(
  source: Record<string, unknown> | null | undefined,
  key: string,
): boolean | null {
  const value = source?.[key];
  return typeof value === "boolean" ? value : null;
}

function hasRemoteConnection(
  config: StorageConfig | null | undefined,
): boolean {
  const cloud = asRecord(config?.cloud);
  return Boolean(
    readString(cloud, "remoteApiBase") ||
      readString(cloud, "remoteAccessToken"),
  );
}

function cloudHandlesInference(
  config: StorageConfig | null | undefined,
): boolean {
  const cloud = asRecord(config?.cloud);
  if (readBoolean(cloud, "enabled") !== true) {
    return false;
  }
  const services = asRecord(cloud?.services);
  const inferenceToggle = services?.inference !== false;
  const inferenceMode = readString(cloud, "inferenceMode") ?? "cloud";
  return inferenceMode === "cloud" && inferenceToggle;
}

function hasInactiveCloudSignals(
  config: StorageConfig | null | undefined,
): boolean {
  const cloud = asRecord(config?.cloud);
  const models = asRecord(config?.models);
  return Boolean(
    readString(cloud, "apiKey") ||
      readString(cloud, "provider") === "elizacloud" ||
      readString(cloud, "inferenceMode") === "cloud" ||
      readString(models, "small") ||
      readString(models, "large"),
  );
}

export function shouldPreferLocalProviderConfig(
  config: StorageConfig | null | undefined,
): boolean {
  const connection = inferOnboardingConnectionFromConfig(config);
  if (!connection || !isLocalProviderConnection(connection)) {
    return false;
  }

  // If cloud.enabled is explicitly true, the user has actively chosen cloud —
  // never override their preference even if a local provider is also configured.
  const cloud = asRecord(config?.cloud);
  if (readBoolean(cloud, "enabled") === true) {
    return false;
  }

  return Boolean(
    !hasRemoteConnection(config) &&
      !cloudHandlesInference(config) &&
      hasInactiveCloudSignals(config),
  );
}

export function normalizeConfigForLocalProviderPreference(
  config: StorageConfig | null | undefined,
): StorageConfig | null | undefined {
  if (!config || !shouldPreferLocalProviderConfig(config)) {
    return config;
  }

  const cloud = asRecord(config.cloud) ?? {};
  const models = asRecord(config.models);
  const nextCloud: Record<string, unknown> = { ...cloud };
  delete nextCloud.apiKey;

  if (readString(cloud, "provider") === "elizacloud") {
    delete nextCloud.provider;
  }

  if (readString(cloud, "inferenceMode") === "cloud") {
    nextCloud.inferenceMode = "byok";
  }

  const services = asRecord(cloud.services);
  if (services) {
    nextCloud.services = { ...services, inference: false };
  }
  nextCloud.enabled = false;

  const nextConfig: StorageConfig = { ...config, cloud: nextCloud };

  if (models) {
    const nextModels: Record<string, unknown> = { ...models };
    delete nextModels.small;
    delete nextModels.large;
    if (Object.keys(nextModels).length > 0) {
      nextConfig.models = nextModels;
    } else {
      delete nextConfig.models;
    }
  }

  return nextConfig;
}

export function shouldMaskInactiveCloudStatus(args: {
  config: StorageConfig | null | undefined;
  status: unknown;
}): boolean {
  if (!shouldPreferLocalProviderConfig(args.config)) {
    return false;
  }

  const status = asRecord(args.status);
  if (!status) {
    return false;
  }

  if (readString(status, "userId") || readString(status, "organizationId")) {
    return false;
  }

  return status.connected === true || status.hasApiKey === true;
}

export function installLocalProviderCloudPreferencePatch(
  client: ClientLike,
): () => void {
  const existingPatch = client[PATCH_STATE] as PatchState | undefined;
  if (existingPatch) {
    return () => {};
  }

  const originalGetConfig = client.getConfig.bind(client);
  const originalGetCloudStatus = client.getCloudStatus.bind(client);
  const originalGetCloudCredits =
    typeof client.getCloudCredits === "function"
      ? client.getCloudCredits.bind(client)
      : null;

  client[PATCH_STATE] = {
    getConfig: client.getConfig,
    getCloudStatus: client.getCloudStatus,
    getCloudCredits: client.getCloudCredits,
  } satisfies PatchState;

  client.getConfig = (async () => {
    const config = (await originalGetConfig()) as
      | StorageConfig
      | null
      | undefined;
    return normalizeConfigForLocalProviderPreference(config) as Record<
      string,
      unknown
    >;
  }) as typeof client.getConfig;

  client.getCloudStatus = async () => {
    const [status, config] = await Promise.all([
      originalGetCloudStatus(),
      originalGetConfig().catch(() => null),
    ]);

    if (shouldMaskInactiveCloudStatus({ config, status })) {
      return {
        ...status,
        connected: false,
        enabled: false,
        hasApiKey: false,
        reason: "inactive_local_provider",
      };
    }

    return status;
  };

  if (originalGetCloudCredits) {
    client.getCloudCredits = async () => {
      const [status, config] = await Promise.all([
        originalGetCloudStatus().catch(() => null),
        originalGetConfig().catch(() => null),
      ]);

      if (shouldMaskInactiveCloudStatus({ config, status })) {
        return { balance: null, connected: false };
      }

      return originalGetCloudCredits();
    };
  }

  return () => {
    const patchState = client[PATCH_STATE] as PatchState | undefined;
    if (!patchState) {
      return;
    }
    client.getConfig = patchState.getConfig;
    client.getCloudStatus = patchState.getCloudStatus;
    if (patchState.getCloudCredits) {
      client.getCloudCredits = patchState.getCloudCredits;
    } else {
      delete client.getCloudCredits;
    }
    delete client[PATCH_STATE];
  };
}
