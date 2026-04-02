import { describe, expect, it } from "vitest";

import {
  buildOnboardingConnectionConfig,
  buildOnboardingRuntimeConfig,
  isElizaCloudConnectionReady,
} from "./onboarding-config";

describe("buildOnboardingConnectionConfig", () => {
  it("does not auto-select cloud inference when onboarding only chooses Eliza Cloud hosting", () => {
    expect(
      buildOnboardingConnectionConfig({
        onboardingRunMode: "cloud",
        onboardingCloudProvider: "elizacloud",
        onboardingProvider: "",
        onboardingApiKey: "ck-test",
        onboardingPrimaryModel: "",
        onboardingOpenRouterModel: "",
        onboardingRemoteConnected: false,
        onboardingRemoteApiBase: "",
        onboardingRemoteToken: "",
        onboardingSmallModel: "openai/gpt-5-mini",
        onboardingLargeModel: "anthropic/claude-sonnet-4.5",
        onboardingVoiceProvider: "",
        onboardingVoiceApiKey: "",
      }),
    ).toBeNull();
  });

  it("keeps cloud hosting and account linking separate from text provider selection", () => {
    expect(
      buildOnboardingRuntimeConfig({
        onboardingRunMode: "cloud",
        onboardingCloudProvider: "elizacloud",
        onboardingProvider: "",
        onboardingApiKey: "ck-test",
        onboardingPrimaryModel: "",
        onboardingOpenRouterModel: "",
        onboardingRemoteConnected: false,
        onboardingRemoteApiBase: "",
        onboardingRemoteToken: "",
        onboardingSmallModel: "openai/gpt-5-mini",
        onboardingLargeModel: "anthropic/claude-sonnet-4.5",
        onboardingVoiceProvider: "",
        onboardingVoiceApiKey: "",
      }),
    ).toEqual({
      connection: null,
      deploymentTarget: {
        runtime: "cloud",
        provider: "elizacloud",
      },
      linkedAccounts: {
        elizacloud: {
          status: "linked",
          source: "api-key",
        },
      },
      serviceRouting: {
        tts: {
          backend: "elizacloud",
          transport: "cloud-proxy",
          accountId: "elizacloud",
        },
        media: {
          backend: "elizacloud",
          transport: "cloud-proxy",
          accountId: "elizacloud",
        },
        embeddings: {
          backend: "elizacloud",
          transport: "cloud-proxy",
          accountId: "elizacloud",
        },
        rpc: {
          backend: "elizacloud",
          transport: "cloud-proxy",
          accountId: "elizacloud",
        },
      },
      needsProviderSetup: true,
    });
  });

  it("builds a local provider connection and carries the openrouter model override", () => {
    expect(
      buildOnboardingConnectionConfig({
        onboardingRunMode: "local",
        onboardingCloudProvider: "",
        onboardingProvider: "openrouter",
        onboardingApiKey: "sk-or-test",
        onboardingPrimaryModel: "",
        onboardingOpenRouterModel: "openai/gpt-5-mini",
        onboardingRemoteConnected: false,
        onboardingRemoteApiBase: "",
        onboardingRemoteToken: "",
        onboardingSmallModel: "",
        onboardingLargeModel: "",
      }),
    ).toEqual({
      kind: "local-provider",
      provider: "openrouter",
      apiKey: "sk-or-test",
      primaryModel: "openai/gpt-5-mini",
    });
  });

  it("builds a remote-provider connection when a remote backend is selected", () => {
    expect(
      buildOnboardingConnectionConfig({
        onboardingRunMode: "cloud",
        onboardingCloudProvider: "remote",
        onboardingProvider: "anthropic-subscription",
        onboardingApiKey: "sk-ant-oat01-test",
        onboardingPrimaryModel: "",
        onboardingOpenRouterModel: "",
        onboardingRemoteConnected: true,
        onboardingRemoteApiBase: "https://example.com/api",
        onboardingRemoteToken: "remote-key",
        onboardingSmallModel: "",
        onboardingLargeModel: "",
      }),
    ).toEqual({
      kind: "remote-provider",
      remoteApiBase: "https://example.com/api",
      remoteAccessToken: "remote-key",
      provider: "anthropic-subscription",
      apiKey: "sk-ant-oat01-test",
      primaryModel: undefined,
    });
  });
});

describe("isElizaCloudConnectionReady", () => {
  it("treats an existing Eliza Cloud login as ready", () => {
    expect(
      isElizaCloudConnectionReady({
        connection: null,
        elizaCloudConnected: true,
      }),
    ).toBe(true);
  });

  it("treats a cloud-managed API key connection as ready", () => {
    expect(
      isElizaCloudConnectionReady({
        connection: {
          kind: "cloud-managed",
          cloudProvider: "elizacloud",
          apiKey: "ck-ready",
        },
        elizaCloudConnected: false,
      }),
    ).toBe(true);
  });
});
