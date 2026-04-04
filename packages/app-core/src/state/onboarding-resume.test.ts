import { describe, expect, it } from "vitest";
import {
  deriveOnboardingResumeFieldsFromConfig,
  hasPartialOnboardingConnectionConfig,
  inferOnboardingResumeStep,
} from "./onboarding-resume";

describe("hasPartialOnboardingConnectionConfig", () => {
  it.each([
    {
      config: null,
      expected: false,
      name: "returns false when config is missing",
    },
    {
      config: {},
      expected: false,
      name: "returns false when no provider selection signals exist",
    },
    {
      config: {
        serviceRouting: {
          llmText: {
            backend: "elizacloud",
            transport: "cloud-proxy",
          },
        },
      },
      expected: true,
      name: "returns true when cloud inference is enabled",
    },
    {
      config: {
        serviceRouting: {
          llmText: {
            backend: "openai",
            transport: "direct",
          },
        },
      },
      expected: true,
      name: "returns true when canonical provider routing is present",
    },
    {
      config: { cloud: { apiKey: "sk-test" } },
      expected: true,
      name: "treats a linked cloud account as partial onboarding progress",
    },
  ])("$name", ({ config, expected }) => {
    expect(
      hasPartialOnboardingConnectionConfig(
        config as Record<string, unknown> | null,
      ),
    ).toBe(expected);
  });
});

describe("inferOnboardingResumeStep", () => {
  it("defaults to identity with no persisted step and no config", () => {
    expect(inferOnboardingResumeStep({})).toBe("identity");
  });

  it("returns the persisted step when available", () => {
    expect(
      inferOnboardingResumeStep({ persistedStep: "providers", config: {} }),
    ).toBe("providers");
  });

  it("prefers the persisted step over inferred config", () => {
    expect(
      inferOnboardingResumeStep({
        persistedStep: "providers",
        config: {
          serviceRouting: {
            llmText: {
              backend: "elizacloud",
              transport: "cloud-proxy",
              accountId: "elizacloud",
            },
          },
        },
      }),
    ).toBe("providers");
  });

  it("resumes at providers when partial routing config already exists", () => {
    expect(
      inferOnboardingResumeStep({
        config: {
          linkedAccounts: {
            elizacloud: { status: "linked", source: "api-key" },
          },
        },
      }),
    ).toBe("providers");
  });
});

describe("deriveOnboardingResumeFieldsFromConfig", () => {
  it("keeps local hosting separate from elizacloud inference routing", () => {
    expect(
      deriveOnboardingResumeFieldsFromConfig({
        deploymentTarget: {
          runtime: "local",
        },
        linkedAccounts: {
          elizacloud: {
            status: "linked",
            source: "api-key",
          },
        },
        serviceRouting: {
          llmText: {
            backend: "elizacloud",
            transport: "cloud-proxy",
            smallModel: "openai/gpt-5-mini",
            largeModel: "anthropic/claude-sonnet-4.5",
          },
        },
        cloud: {
          apiKey: "ck-cloud-test",
        },
      }),
    ).toEqual({
      onboardingServerTarget: "local",
      onboardingCloudApiKey: "ck-cloud-test",
      onboardingProvider: "elizacloud",
      onboardingApiKey: "",
      onboardingVoiceProvider: "",
      onboardingVoiceApiKey: "",
      onboardingPrimaryModel: "",
      onboardingOpenRouterModel: "",
      onboardingRemoteConnected: false,
      onboardingRemoteApiBase: "",
      onboardingRemoteToken: "",
      onboardingSmallModel: "openai/gpt-5-mini",
      onboardingLargeModel: "anthropic/claude-sonnet-4.5",
    });
  });

  it("keeps cloud hosting separate from a direct provider selection", () => {
    expect(
      deriveOnboardingResumeFieldsFromConfig({
        deploymentTarget: {
          runtime: "cloud",
          provider: "elizacloud",
        },
        serviceRouting: {
          llmText: {
            backend: "openrouter",
            transport: "direct",
            primaryModel: "openai/gpt-5-mini",
          },
        },
        env: {
          vars: {
            OPENROUTER_API_KEY: "sk-or-test",
          },
        },
      }),
    ).toEqual({
      onboardingServerTarget: "elizacloud",
      onboardingCloudApiKey: "",
      onboardingProvider: "openrouter",
      onboardingApiKey: "sk-or-test",
      onboardingVoiceProvider: "",
      onboardingVoiceApiKey: "",
      onboardingPrimaryModel: "",
      onboardingOpenRouterModel: "openai/gpt-5-mini",
      onboardingRemoteConnected: false,
      onboardingRemoteApiBase: "",
      onboardingRemoteToken: "",
      onboardingSmallModel: "",
      onboardingLargeModel: "",
    });
  });
});
