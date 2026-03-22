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
      name: "returns false when cloud config is missing",
    },
    {
      config: { cloud: { enabled: true } },
      expected: true,
      name: "returns true when cloud is enabled",
    },
    {
      config: { cloud: { apiKey: "sk-test" } },
      expected: true,
      name: "returns true when api key is present",
    },
    {
      config: { cloud: { apiKey: "   " } },
      expected: false,
      name: "ignores blank strings",
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
  it("defaults to welcome with no persisted step and no config", () => {
    expect(inferOnboardingResumeStep({})).toBe("welcome");
  });

  it("defaults to welcome with empty config and no persisted step", () => {
    expect(inferOnboardingResumeStep({ config: {} })).toBe("welcome");
  });

  it("defaults to welcome with null config and no persisted step", () => {
    expect(inferOnboardingResumeStep({ config: null })).toBe("welcome");
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
        config: { cloud: { enabled: true } },
      }),
    ).toBe("providers");
  });

  it("returns persisted step 'hosting' when persisted", () => {
    expect(inferOnboardingResumeStep({ persistedStep: "hosting" })).toBe(
      "hosting",
    );
  });

  it("returns persisted step 'permissions' when persisted", () => {
    expect(inferOnboardingResumeStep({ persistedStep: "permissions" })).toBe(
      "permissions",
    );
  });

  it("returns persisted step 'launch' when persisted", () => {
    expect(inferOnboardingResumeStep({ persistedStep: "launch" })).toBe(
      "launch",
    );
  });

  it("does not return old step names as defaults", () => {
    const result = inferOnboardingResumeStep({ config: {} });
    expect(result).toBe("welcome");
  });

  it("falls back to welcome when nothing is persisted yet", () => {
    expect(
      inferOnboardingResumeStep({
        config: {},
      }),
    ).toBe("welcome");
  });
});

describe("deriveOnboardingResumeConnection", () => {
  it("reconstructs an eliza cloud connection from partial saved config", () => {
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
    });
  });
});
