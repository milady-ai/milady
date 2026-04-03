import {
  normalizeOnboardingProviderId,
  type OnboardingCredentialInputs,
  type OnboardingLocalProviderId,
} from "@miladyai/shared/contracts/onboarding";
import type {
  DeploymentTargetConfig,
  ServiceRouteConfig,
  LinkedAccountsConfig,
  ServiceRoutingConfig,
} from "@miladyai/shared/contracts/service-routing";
import { type OnboardingServerTarget } from "./onboarding/server-target";

export interface BuildOnboardingConnectionArgs {
  onboardingServerTarget?: OnboardingServerTarget;
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
  let llmTextRoute: ServiceRouteConfig | undefined;

  if (args.onboardingProvider === "elizacloud") {
    llmTextRoute = {
      backend: "elizacloud",
      transport: "cloud-proxy",
      accountId: "elizacloud",
      ...(trimToUndefined(args.onboardingSmallModel)
        ? { smallModel: trimToUndefined(args.onboardingSmallModel) }
        : {}),
      ...(trimToUndefined(args.onboardingLargeModel)
        ? { largeModel: trimToUndefined(args.onboardingLargeModel) }
        : {}),
    };
  } else {
    const providerId = resolveLocalProviderId(args.onboardingProvider);
    if (providerId) {
      const primaryModel = resolveOnboardingPrimaryModel({
        providerId,
        onboardingPrimaryModel: args.onboardingPrimaryModel,
        onboardingOpenRouterModel: args.onboardingOpenRouterModel,
      });
      llmTextRoute =
        serverTarget === "remote"
          ? {
              backend: providerId,
              transport: "remote",
              remoteApiBase: args.onboardingRemoteApiBase.trim(),
              ...(primaryModel ? { primaryModel } : {}),
            }
          : {
              backend: providerId,
              transport: "direct",
              ...(primaryModel ? { primaryModel } : {}),
            };
    }
  }

  if (llmTextRoute) {
    serviceRouting.llmText = llmTextRoute;
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
