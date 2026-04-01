import { describe, expect, it } from "vitest";
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
      config: { cloud: { enabled: true } },
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
      expected: false,
      name: "does not treat cloud api key capability alone as active selection",
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
    expect(
      deriveOnboardingResumeConnection({
        cloud: { enabled: true, apiKey: "[REDACTED]" },
        models: {
          small: "openai/gpt-5-mini",
          large: "anthropic/claude-sonnet-4.5",
        },
      }),
    ).toEqual({
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
