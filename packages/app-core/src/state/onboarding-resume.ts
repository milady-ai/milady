import {
  inferOnboardingConnectionFromConfig,
  isElizaCloudLinkedInConfig,
  resolveDeploymentTargetInConfig,
  type OnboardingConnection,
} from "@miladyai/shared/contracts";
import type { BuildOnboardingConnectionArgs } from "../onboarding-config";
import { asRecord } from "./config-readers";
import type { OnboardingStep } from "./types";

function hasConfigValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value === true;
}

export function hasPartialOnboardingConnectionConfig(
  config: Record<string, unknown> | null | undefined,
): boolean {
  if (inferOnboardingConnectionFromConfig(config)) {
    return true;
  }

  const root =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : null;
  if (
    root &&
    (Object.hasOwn(root, "deploymentTarget") ||
      Object.hasOwn(root, "linkedAccounts") ||
      Object.hasOwn(root, "serviceRouting"))
  ) {
    return true;
  }

  return isElizaCloudLinkedInConfig(config);
}

export function inferOnboardingResumeStep(args: {
  config?: Record<string, unknown> | null;
  persistedStep?: OnboardingStep | null;
}): OnboardingStep {
  if (args.persistedStep) {
    return args.persistedStep;
  }

  if (hasPartialOnboardingConnectionConfig(args.config)) {
    return "hosting";
  }

  return "identity";
}

export function deriveOnboardingResumeConnection(
  config: Record<string, unknown> | null | undefined,
): OnboardingConnection | null {
  return inferOnboardingConnectionFromConfig(config);
}

export function deriveOnboardingResumeFields(
  connection: OnboardingConnection | null | undefined,
): Partial<BuildOnboardingConnectionArgs> {
  if (!connection) {
    return {};
  }

  switch (connection.kind) {
    case "cloud-managed":
      return {
        onboardingRunMode: "cloud",
        onboardingCloudProvider: "elizacloud",
        onboardingCloudApiKey: connection.apiKey ?? "",
        onboardingVoiceProvider: "",
        onboardingVoiceApiKey: "",
        onboardingSmallModel: connection.smallModel ?? "",
        onboardingLargeModel: connection.largeModel ?? "",
        onboardingRemoteConnected: false,
        onboardingRemoteApiBase: "",
        onboardingRemoteToken: "",
        onboardingProvider: "",
        onboardingPrimaryModel: "",
        onboardingOpenRouterModel: "",
      };
    case "local-provider":
      return {
        onboardingRunMode: "local",
        onboardingCloudProvider: "",
        onboardingProvider: connection.provider,
        onboardingApiKey: connection.apiKey ?? "",
        onboardingVoiceProvider: "",
        onboardingVoiceApiKey: "",
        onboardingPrimaryModel:
          connection.provider === "openrouter"
            ? ""
            : (connection.primaryModel ?? ""),
        onboardingOpenRouterModel:
          connection.provider === "openrouter"
            ? (connection.primaryModel ?? "")
            : "",
        onboardingRemoteConnected: false,
        onboardingRemoteApiBase: "",
        onboardingRemoteToken: "",
      };
    case "remote-provider":
      return {
        onboardingRunMode: "cloud",
        onboardingCloudProvider: "remote",
        onboardingProvider: connection.provider ?? "",
        onboardingApiKey: connection.apiKey ?? "",
        onboardingVoiceProvider: "",
        onboardingVoiceApiKey: "",
        onboardingPrimaryModel:
          connection.provider === "openrouter"
            ? ""
            : (connection.primaryModel ?? ""),
        onboardingOpenRouterModel:
          connection.provider === "openrouter"
            ? (connection.primaryModel ?? "")
            : "",
        onboardingRemoteConnected: true,
        onboardingRemoteApiBase: connection.remoteApiBase,
        onboardingRemoteToken: connection.remoteAccessToken ?? "",
      };
  }
}

export function deriveOnboardingResumeFieldsFromConfig(
  config: Record<string, unknown> | null | undefined,
): Partial<BuildOnboardingConnectionArgs> {
  const connection = deriveOnboardingResumeConnection(config);
  if (!connection) {
    const deploymentTarget = resolveDeploymentTargetInConfig(config);
    if (deploymentTarget.runtime === "remote") {
      return {
        onboardingRunMode: "cloud",
        onboardingCloudProvider: "remote",
        onboardingRemoteConnected: Boolean(deploymentTarget.remoteApiBase),
        onboardingRemoteApiBase: deploymentTarget.remoteApiBase ?? "",
        onboardingRemoteToken: deploymentTarget.remoteAccessToken ?? "",
      };
    }
    if (deploymentTarget.runtime === "cloud") {
      return {
        onboardingRunMode: "cloud",
        onboardingCloudProvider: "elizacloud",
      };
    }
    return {};
  }
  return deriveOnboardingResumeFields(connection);
}
