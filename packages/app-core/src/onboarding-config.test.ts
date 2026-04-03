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
        onboardingCloudApiKey: "ck-test",
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
        onboardingCloudApiKey: "ck-test",
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
        onboardingCloudApiKey: "",
        onboardingProvider: "openrouter",
        onboardingApiKey: "sk-or-test",
        onboardingPrimaryModel: "",
        onboardingOpenRouterModel: "openai/gpt-5-mini",
        onboardingRemoteConnected: false,
        onboardingRemoteApiBase: "",
        onboardingRemoteToken: "",
        onboardingSmallModel: "",
        onboardingLargeModel: "",
        onboardingVoiceProvider: "",
        onboardingVoiceApiKey: "",
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
        onboardingCloudApiKey: "",
        onboardingProvider: "anthropic-subscription",
        onboardingApiKey: "sk-ant-oat01-test",
        onboardingPrimaryModel: "",
        onboardingOpenRouterModel: "",
        onboardingRemoteConnected: true,
        onboardingRemoteApiBase: "https://example.com/api",
        onboardingRemoteToken: "remote-key",
        onboardingSmallModel: "",
        onboardingLargeModel: "",
        onboardingVoiceProvider: "",
        onboardingVoiceApiKey: "",
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

  it("keeps a linked Eliza Cloud account when local inference uses another provider", () => {
    expect(
      buildOnboardingRuntimeConfig({
        onboardingRunMode: "local",
        onboardingCloudProvider: "",
        onboardingCloudApiKey: "ck-linked",
        onboardingProvider: "openai",
        onboardingApiKey: "sk-openai-test",
        onboardingPrimaryModel: "openai/gpt-5.2",
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
      connection: {
        kind: "local-provider",
        provider: "openai",
        apiKey: "sk-openai-test",
        primaryModel: "openai/gpt-5.2",
      },
      deploymentTarget: { runtime: "local" },
      linkedAccounts: {
        elizacloud: {
          status: "linked",
          source: "api-key",
        },
      },
      serviceRouting: {
        llmText: {
          backend: "openai",
          transport: "direct",
          primaryModel: "openai/gpt-5.2",
        },
      },
      needsProviderSetup: false,
    });
  });

  it("routes cloud services through Eliza Cloud when Eliza Cloud is the selected inference backend on local runtime", () => {
    expect(
      buildOnboardingRuntimeConfig({
        onboardingRunMode: "local",
        onboardingCloudProvider: "",
        onboardingCloudApiKey: "ck-linked",
        onboardingProvider: "elizacloud",
        onboardingApiKey: "",
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
      connection: {
        kind: "cloud-managed",
        cloudProvider: "elizacloud",
        apiKey: "ck-linked",
        smallModel: "openai/gpt-5-mini",
        largeModel: "anthropic/claude-sonnet-4.5",
      },
      deploymentTarget: { runtime: "local" },
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
          accountId: "elizacloud",
          smallModel: "openai/gpt-5-mini",
          largeModel: "anthropic/claude-sonnet-4.5",
        },
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
      needsProviderSetup: false,
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
