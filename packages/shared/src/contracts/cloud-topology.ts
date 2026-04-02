import {
  isCloudInferenceSelectedInConfig,
  normalizeOnboardingProviderId,
} from "./onboarding.js";

export type ElizaCloudService =
  | "inference"
  | "tts"
  | "media"
  | "embeddings"
  | "rpc";

export type ResolvedElizaCloudTopology = {
  linked: boolean;
  provider: "elizacloud" | null;
  runtime: "cloud" | "local";
  services: Record<ElizaCloudService, boolean>;
  shouldLoadPlugin: boolean;
};

const CLOUD_SERVICES = [
  "inference",
  "tts",
  "media",
  "embeddings",
  "rpc",
] as const satisfies readonly ElizaCloudService[];

const REDACTED_SECRET = "[REDACTED]";

function asConfigRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readConfigString(
  source: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  const value = source?.[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeSecretString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.toUpperCase() === REDACTED_SECRET) {
    return undefined;
  }
  return trimmed;
}

function readServiceOverride(
  services: Record<string, unknown> | null,
  service: ElizaCloudService,
): boolean | undefined {
  const value = services?.[service];
  return typeof value === "boolean" ? value : undefined;
}

export function isElizaCloudLinkedInConfig(
  config: Record<string, unknown> | null | undefined,
): boolean {
  const cloud = asConfigRecord(config?.cloud);
  return Boolean(normalizeSecretString(cloud?.apiKey));
}

export function resolveElizaCloudTopology(
  config: Record<string, unknown> | null | undefined,
): ResolvedElizaCloudTopology {
  const cloud = asConfigRecord(config?.cloud);
  const services = asConfigRecord(cloud?.services);
  const provider = normalizeOnboardingProviderId(readConfigString(cloud, "provider"));
  const runtime = readConfigString(cloud, "runtime") === "cloud" ? "cloud" : "local";
  const inferenceSelected = isCloudInferenceSelectedInConfig(config);
  const cloudDeploymentSelected =
    provider === "elizacloud" && runtime === "cloud";
  const cloudContextSelected = inferenceSelected || cloudDeploymentSelected;

  const resolvedServices = Object.fromEntries(
    CLOUD_SERVICES.map((service) => {
      if (service === "inference") {
        return [service, inferenceSelected];
      }

      const explicitOverride = readServiceOverride(services, service);
      return [service, explicitOverride ?? cloudContextSelected];
    }),
  ) as Record<ElizaCloudService, boolean>;

  return {
    linked: isElizaCloudLinkedInConfig(config),
    provider: provider === "elizacloud" ? "elizacloud" : null,
    runtime,
    services: resolvedServices,
    shouldLoadPlugin:
      cloudDeploymentSelected ||
      Object.values(resolvedServices).some(Boolean),
  };
}

export function isElizaCloudServiceSelectedInConfig(
  config: Record<string, unknown> | null | undefined,
  service: ElizaCloudService,
): boolean {
  return resolveElizaCloudTopology(config).services[service];
}

export function shouldLoadElizaCloudPluginInConfig(
  config: Record<string, unknown> | null | undefined,
): boolean {
  return resolveElizaCloudTopology(config).shouldLoadPlugin;
}
