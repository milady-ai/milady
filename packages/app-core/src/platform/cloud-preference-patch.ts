import {
  resolveDeploymentTargetInConfig,
  resolveServiceRoutingInConfig,
} from "@miladyai/shared/contracts/onboarding";
import {
  getOnboardingProviderOption,
  isElizaCloudLinkedInConfig,
  resolveElizaCloudTopology,
} from "@miladyai/shared/contracts";
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

function hasRemoteConnection(
  config: StorageConfig | null | undefined,
): boolean {
  return (
    resolveDeploymentTargetInConfig(config as Record<string, unknown>)
      .runtime === "remote"
  );
}

function cloudHandlesInference(
  config: StorageConfig | null | undefined,
): boolean {
  return resolveElizaCloudTopology(config as Record<string, unknown>).services
    .inference;
}

function hasInactiveCloudSignals(
  config: StorageConfig | null | undefined,
): boolean {
  return isElizaCloudLinkedInConfig(config as Record<string, unknown>);
}

export function shouldPreferLocalProviderConfig(
  config: StorageConfig | null | undefined,
): boolean {
  const llmText = resolveServiceRoutingInConfig(
    config as Record<string, unknown>,
  )?.llmText;
  const directProvider = getOnboardingProviderOption(llmText?.backend)?.id;
  if (llmText?.transport !== "direct" || !directProvider) {
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
  const nextCloud: Record<string, unknown> = { ...cloud };
  delete nextCloud.enabled;
  delete nextCloud.provider;
  delete nextCloud.inferenceMode;
  delete nextCloud.runtime;
  delete nextCloud.remoteApiBase;
  delete nextCloud.remoteAccessToken;

  const services = asRecord(nextCloud.services);
  if (services) {
    delete services.inference;
    delete services.tts;
    delete services.media;
    delete services.embeddings;
    delete services.rpc;
    if (Object.keys(services).length === 0) {
      delete nextCloud.services;
    } else {
      nextCloud.services = services;
    }
  }

  const nextConfig: StorageConfig = { ...config, cloud: nextCloud };

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
