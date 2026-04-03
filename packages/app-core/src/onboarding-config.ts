import {
  isCloudManagedConnection,
  normalizeOnboardingProviderId,
  type OnboardingConnection,
  type OnboardingLocalProviderId,
} from "@miladyai/shared/contracts/onboarding";
import type {
  DeploymentTargetConfig,
  LinkedAccountsConfig,
  ServiceRoutingConfig,
} from "@miladyai/shared/contracts/service-routing";
import { resolveOnboardingServerTarget } from "./onboarding/server-target";

export interface BuildOnboardingConnectionArgs {
  onboardingRunMode: "local" | "cloud" | "";
  onboardingCloudProvider: string;
  onboardingCloudApiKey: string;
  onboardingProvider: string;
  onboardingApiKey: string;
  onboardingVoiceProvider: string;
  onboardingVoiceApiKey: string;
  onboardingPrimaryModel: string;
  onboardingOpenRouterModel: string;
  onboardingRemoteConnected: boolean;
  onboardingRemoteApiBase: string;
  onboardingRemoteToken: string;
  onboardingSmallModel: string;
  onboardingLargeModel: string;
}

export interface BuildOnboardingRuntimeConfigResult {
  connection: OnboardingConnection | null;
  deploymentTarget: DeploymentTargetConfig;
  linkedAccounts: LinkedAccountsConfig | undefined;
  serviceRouting: ServiceRoutingConfig | undefined;
  needsProviderSetup: boolean;
}

function trimToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveLocalProviderId(
  provider: string,
): OnboardingLocalProviderId | null {
  const normalized = normalizeOnboardingProviderId(provider);
  return normalized && normalized !== "elizacloud" ? normalized : null;
}

export function resolveOnboardingPrimaryModel(args: {
  providerId: string;
  onboardingPrimaryModel: string;
  onboardingOpenRouterModel: string;
}): string | undefined {
  if (args.providerId === "openrouter") {
    return trimToUndefined(args.onboardingOpenRouterModel);
  }
  return trimToUndefined(args.onboardingPrimaryModel);
}

export function buildOnboardingConnectionConfig(
  args: BuildOnboardingConnectionArgs,
): OnboardingConnection | null {
  const serverTarget = resolveOnboardingServerTarget({
    runMode: args.onboardingRunMode,
    cloudProvider: args.onboardingCloudProvider,
  });

  if (args.onboardingProvider === "elizacloud") {
    return {
      kind: "cloud-managed",
      cloudProvider: "elizacloud",
      apiKey: trimToUndefined(args.onboardingCloudApiKey),
      ...(trimToUndefined(args.onboardingSmallModel)
        ? { smallModel: trimToUndefined(args.onboardingSmallModel) }
        : {}),
      ...(trimToUndefined(args.onboardingLargeModel)
        ? { largeModel: trimToUndefined(args.onboardingLargeModel) }
        : {}),
    };
  }

  const providerId = resolveLocalProviderId(args.onboardingProvider);
  if (!providerId) {
    if (serverTarget === "remote") {
      return {
        kind: "remote-provider",
        remoteApiBase: args.onboardingRemoteApiBase.trim(),
        remoteAccessToken: trimToUndefined(args.onboardingRemoteToken),
      };
    }
    return null;
  }

  const primaryModel = resolveOnboardingPrimaryModel({
    providerId,
    onboardingPrimaryModel: args.onboardingPrimaryModel,
    onboardingOpenRouterModel: args.onboardingOpenRouterModel,
  });

  if (serverTarget === "remote") {
    return {
      kind: "remote-provider",
      remoteApiBase: args.onboardingRemoteApiBase.trim(),
      remoteAccessToken: trimToUndefined(args.onboardingRemoteToken),
      provider: providerId,
      apiKey: trimToUndefined(args.onboardingApiKey),
      primaryModel,
    };
  }

  return {
    kind: "local-provider",
    provider: providerId,
    apiKey: trimToUndefined(args.onboardingApiKey),
    primaryModel,
  };
}

export function buildOnboardingRuntimeConfig(
  args: BuildOnboardingConnectionArgs,
): BuildOnboardingRuntimeConfigResult {
  const connection = buildOnboardingConnectionConfig(args);
  const serverTarget = resolveOnboardingServerTarget({
    runMode: args.onboardingRunMode,
    cloudProvider: args.onboardingCloudProvider,
  });
  const linkedAccounts: LinkedAccountsConfig = {};
  const cloudApiKey = trimToUndefined(args.onboardingCloudApiKey);
  if (cloudApiKey) {
    linkedAccounts.elizacloud = {
      status: "linked",
      source: "api-key",
    };
  }

  const deploymentTarget: DeploymentTargetConfig =
    serverTarget === "remote"
      ? {
          runtime: "remote",
          provider: "remote",
          remoteApiBase: args.onboardingRemoteApiBase.trim(),
          ...(trimToUndefined(args.onboardingRemoteToken)
            ? { remoteAccessToken: trimToUndefined(args.onboardingRemoteToken) }
            : {}),
        }
      : serverTarget === "elizacloud" && !args.onboardingRemoteConnected
        ? {
            runtime: "cloud",
            provider: "elizacloud",
          }
        : { runtime: "local" };

  const serviceRouting: ServiceRoutingConfig = {};

  if (connection?.kind === "cloud-managed") {
    serviceRouting.llmText = {
      backend: "elizacloud",
      transport: "cloud-proxy",
      accountId: "elizacloud",
      ...(connection.smallModel ? { smallModel: connection.smallModel } : {}),
      ...(connection.largeModel ? { largeModel: connection.largeModel } : {}),
    };
  } else if (connection?.kind === "local-provider") {
    serviceRouting.llmText = {
      backend: connection.provider,
      transport: "direct",
      ...(connection.primaryModel
        ? { primaryModel: connection.primaryModel }
        : {}),
    };
  } else if (connection?.kind === "remote-provider" && connection.provider) {
    serviceRouting.llmText = {
      backend: connection.provider,
      transport: "remote",
      remoteApiBase: connection.remoteApiBase,
      ...(connection.primaryModel
        ? { primaryModel: connection.primaryModel }
        : {}),
    };
  }

  const cloudContextSelected =
    (serviceRouting.llmText?.transport === "cloud-proxy" &&
      serviceRouting.llmText.backend === "elizacloud") ||
    (deploymentTarget.runtime === "cloud" &&
      deploymentTarget.provider === "elizacloud");

  if (cloudContextSelected) {
    for (const capability of ["tts", "media", "embeddings", "rpc"] as const) {
      serviceRouting[capability] = {
        backend: "elizacloud",
        transport: "cloud-proxy",
        accountId: "elizacloud",
      };
    }
  }

  const hasLinkedAccounts = Object.keys(linkedAccounts).length > 0;
  const hasServiceRouting = Object.keys(serviceRouting).length > 0;

  return {
    connection,
    deploymentTarget,
    linkedAccounts: hasLinkedAccounts ? linkedAccounts : undefined,
    serviceRouting: hasServiceRouting ? serviceRouting : undefined,
    needsProviderSetup: !serviceRouting.llmText,
  };
}

export function isElizaCloudConnectionReady(args: {
  connection: OnboardingConnection | null | undefined;
  elizaCloudConnected: boolean;
}): boolean {
  if (args.elizaCloudConnected) {
    return true;
  }
  return Boolean(
    isCloudManagedConnection(args.connection) &&
      args.connection.cloudProvider === "elizacloud" &&
      args.connection.apiKey?.trim(),
  );
}
