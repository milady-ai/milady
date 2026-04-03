import { describe, expect, it } from "vitest";
import { migrateLegacyRuntimeConfig } from "@miladyai/shared/contracts";
import {
  deriveOnboardingResumeConnection,
  deriveOnboardingResumeFields,
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
        connection: {
          kind: "local-provider",
          provider: "openai",
        },
      },
      expected: true,
      name: "returns true when config.connection is present",
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
          connection: { kind: "cloud-managed", cloudProvider: "elizacloud" },
        },
      }),
    ).toBe("providers");
  });

  it("resumes at hosting when partial routing config already exists", () => {
    expect(
      inferOnboardingResumeStep({
        config: {
          linkedAccounts: {
            elizacloud: { status: "linked", source: "api-key" },
          },
        },
      }),
    ).toBe("hosting");
  });
});

describe("deriveOnboardingResumeConnection", () => {
  it("prefers explicit config.connection over compatibility inference", () => {
    expect(
      deriveOnboardingResumeConnection({
        connection: {
          kind: "local-provider",
          provider: "openrouter",
          primaryModel: "openai/gpt-5-mini",
        },
        env: {
          vars: {
            OPENAI_API_KEY: "sk-openai-test",
          },
        },
        cloud: {
          enabled: true,
          apiKey: "ck-cloud-test",
          inferenceMode: "cloud",
        },
      }),
    ).toEqual({
      kind: "local-provider",
      provider: "openrouter",
      primaryModel: "openai/gpt-5-mini",
    });
  });

  it("reconstructs an eliza cloud connection from compatibility config", () => {
    const migrated = migrateLegacyRuntimeConfig({
      cloud: { enabled: true, apiKey: "[REDACTED]" },
      models: {
        small: "openai/gpt-5-mini",
        large: "anthropic/claude-sonnet-4.5",
      },
    });

    expect(deriveOnboardingResumeConnection(migrated)).toEqual({
      kind: "cloud-managed",
      cloudProvider: "elizacloud",
      apiKey: undefined,
      smallModel: "openai/gpt-5-mini",
      largeModel: "anthropic/claude-sonnet-4.5",
    });
  });

  it("reconstructs ollama from OLLAMA_BASE_URL", () => {
    expect(
      deriveOnboardingResumeConnection({
        env: {
          vars: {
            OLLAMA_BASE_URL: "http://localhost:11434",
          },
        },
      }),
    ).toEqual({
      kind: "local-provider",
      provider: "ollama",
    });
  });

  it("treats MILADY_USE_PI_AI as the same selection as ELIZA_USE_PI_AI", () => {
    expect(
      deriveOnboardingResumeConnection({
        env: {
          vars: {
            MILADY_USE_PI_AI: "1",
          },
        },
        agents: {
          defaults: {
            model: { primary: "pi/default" },
          },
        },
      }),
    ).toEqual({
      kind: "local-provider",
      provider: "pi-ai",
      primaryModel: "pi/default",
    });
  });

  it("reconstructs a local provider connection from saved env config", () => {
    expect(
      deriveOnboardingResumeConnection({
        env: {
          vars: {
            OPENROUTER_API_KEY: "sk-or-test",
          },
        },
        agents: {
          defaults: {
            model: { primary: "openai/gpt-5-mini" },
          },
        },
      }),
    ).toEqual({
      kind: "local-provider",
      provider: "openrouter",
      apiKey: "sk-or-test",
      primaryModel: "openai/gpt-5-mini",
    });
  });
});

describe("deriveOnboardingResumeFields", () => {
  it("maps a cloud-managed connection back into the dedicated cloud api key field", () => {
    expect(
      deriveOnboardingResumeFields({
        kind: "cloud-managed",
        cloudProvider: "elizacloud",
        apiKey: "ck-cloud-test",
        smallModel: "openai/gpt-5-mini",
        largeModel: "anthropic/claude-sonnet-4.5",
      }),
    ).toEqual({
      onboardingRunMode: "cloud",
      onboardingCloudProvider: "elizacloud",
      onboardingCloudApiKey: "ck-cloud-test",
      onboardingVoiceProvider: "",
      onboardingVoiceApiKey: "",
      onboardingSmallModel: "openai/gpt-5-mini",
      onboardingLargeModel: "anthropic/claude-sonnet-4.5",
      onboardingRemoteConnected: false,
      onboardingRemoteApiBase: "",
      onboardingRemoteToken: "",
      onboardingProvider: "",
      onboardingPrimaryModel: "",
      onboardingOpenRouterModel: "",
    });
  });

  it("maps an openrouter connection back into onboarding state", () => {
    expect(
      deriveOnboardingResumeFields({
        kind: "local-provider",
        provider: "openrouter",
        apiKey: "sk-or-test",
        primaryModel: "openai/gpt-5-mini",
      }),
    ).toEqual({
      onboardingRunMode: "local",
      onboardingCloudProvider: "",
      onboardingProvider: "openrouter",
      onboardingApiKey: "sk-or-test",
      onboardingPrimaryModel: "",
      onboardingOpenRouterModel: "openai/gpt-5-mini",
      onboardingRemoteConnected: false,
      onboardingRemoteApiBase: "",
      onboardingRemoteToken: "",
      onboardingVoiceProvider: "",
      onboardingVoiceApiKey: "",
    });
  });
});
