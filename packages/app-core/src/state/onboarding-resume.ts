import {
  inferOnboardingConnectionFromConfig,
  type OnboardingConnection,
} from "@miladyai/shared/contracts/onboarding";
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

  const cloud = asRecord(config?.cloud);
  if (!cloud) {
    return false;
  }

  return [
    cloud.enabled,
    cloud.provider,
    cloud.inferenceMode,
    cloud.remoteApiBase,
    cloud.remoteAccessToken,
  ].some(hasConfigValue);
}

export function inferOnboardingResumeStep(args: {
  config?: Record<string, unknown> | null;
  persistedStep?: OnboardingStep | null;
}): OnboardingStep {
  if (args.persistedStep) {
    return args.persistedStep;
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
        onboardingApiKey: connection.apiKey ?? "",
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
