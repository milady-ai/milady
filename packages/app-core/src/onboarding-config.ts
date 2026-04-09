import {
  normalizeOnboardingProviderId,
  requiresAdditionalRuntimeProvider,
  type OnboardingCredentialInputs,
  type OnboardingLocalProviderId,
} from "@miladyai/shared/contracts/onboarding";
import type {
  DeploymentTargetConfig,
  ServiceRouteConfig,
  LinkedAccountsConfig,
  ServiceRoutingConfig,
} from "@miladyai/shared/contracts/service-routing";
import {
  buildDefaultElizaCloudServiceRouting,
  buildElizaCloudServiceRoute,
} from "@miladyai/shared/contracts/service-routing";
import { type OnboardingServerTarget } from "./onboarding/server-target";

export interface BuildOnboardingConnectionArgs {
  onboardingServerTarget?: OnboardingServerTarget;
  onboardingCloudApiKey: string;
  onboardingProvider: string;
  onboardingApiKey: string;
  omitRuntimeProvider?: boolean;
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
  deploymentTarget: DeploymentTargetConfig;
  linkedAccounts: LinkedAccountsConfig | undefined;
  serviceRouting: ServiceRoutingConfig | undefined;
  credentialInputs: OnboardingCredentialInputs | undefined;
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

function resolveArgsServerTarget(
  args: Pick<BuildOnboardingConnectionArgs, "onboardingServerTarget">,
): OnboardingServerTarget {
  return args.onboardingServerTarget ?? "";
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

export function buildOnboardingRuntimeConfig(
  args: BuildOnboardingConnectionArgs,
): BuildOnboardingRuntimeConfigResult {
  const serverTarget = resolveArgsServerTarget(args);
  const smallModel = trimToUndefined(args.onboardingSmallModel);
  const largeModel = trimToUndefined(args.onboardingLargeModel);
  const linkedAccounts: LinkedAccountsConfig = {};
  const cloudApiKey = trimToUndefined(args.onboardingCloudApiKey);
  if (cloudApiKey) {
    linkedAccounts.elizacloud = {
      status: "linked",
      source: "api-key",
    };
  }

  const localProviderId = resolveLocalProviderId(args.onboardingProvider);
  if (
    localProviderId === "anthropic-subscription" ||
    localProviderId === "openai-subscription"
  ) {
    linkedAccounts[localProviderId] = {
      status: "linked",
      source: "subscription",
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
  let llmTextRoute: ServiceRouteConfig | undefined;
  const shouldConfigureRuntimeProvider =
    !args.omitRuntimeProvider &&
    !requiresAdditionalRuntimeProvider(args.onboardingProvider);

  if (
    args.onboardingProvider === "elizacloud" &&
    shouldConfigureRuntimeProvider
  ) {
    llmTextRoute = buildElizaCloudServiceRoute({
      smallModel,
      largeModel,
    });
  } else if (shouldConfigureRuntimeProvider && localProviderId) {
    const primaryModel = resolveOnboardingPrimaryModel({
      providerId: localProviderId,
      onboardingPrimaryModel: args.onboardingPrimaryModel,
      onboardingOpenRouterModel: args.onboardingOpenRouterModel,
    });
    llmTextRoute =
      serverTarget === "remote"
        ? {
            backend: localProviderId,
            transport: "remote",
            remoteApiBase: args.onboardingRemoteApiBase.trim(),
            ...(primaryModel ? { primaryModel } : {}),
          }
        : {
            backend: localProviderId,
            transport: "direct",
            ...(primaryModel ? { primaryModel } : {}),
          };
  }

  if (llmTextRoute) {
    serviceRouting.llmText = llmTextRoute;
  }

  const cloudDefaultsSelected =
    args.onboardingProvider === "elizacloud" ||
    (deploymentTarget.runtime === "cloud" &&
      deploymentTarget.provider === "elizacloud");
  if (cloudDefaultsSelected) {
    Object.assign(
      serviceRouting,
      buildDefaultElizaCloudServiceRouting({
        base: serviceRouting,
        includeInference:
          shouldConfigureRuntimeProvider &&
          args.onboardingProvider === "elizacloud",
        smallModel,
        largeModel,
      }),
    );
  }

  const hasLinkedAccounts = Object.keys(linkedAccounts).length > 0;
  const hasServiceRouting = Object.keys(serviceRouting).length > 0;
  const credentialInputs: OnboardingCredentialInputs = {};

  if (cloudApiKey) {
    credentialInputs.cloudApiKey = cloudApiKey;
  }

  const llmApiKey = trimToUndefined(args.onboardingApiKey);
  if (
    llmApiKey &&
    llmTextRoute?.backend &&
    llmTextRoute.backend !== "elizacloud"
  ) {
    credentialInputs.llmApiKey = llmApiKey;
  }

  const hasCredentialInputs = Object.keys(credentialInputs).length > 0;

  return {
    deploymentTarget,
    linkedAccounts: hasLinkedAccounts ? linkedAccounts : undefined,
    serviceRouting: hasServiceRouting ? serviceRouting : undefined,
    credentialInputs: hasCredentialInputs ? credentialInputs : undefined,
    needsProviderSetup: !serviceRouting.llmText,
  };
}
