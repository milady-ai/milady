import { describe, expect, it } from "vitest";

import { buildOnboardingRuntimeConfig } from "./onboarding-config";

describe("buildOnboardingRuntimeConfig", () => {
  it("defaults non-text cloud services on for cloud hosting before a chat provider is chosen", () => {
    expect(
      buildOnboardingRuntimeConfig({
        onboardingServerTarget: "elizacloud",
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
      deploymentTarget: {
        runtime: "cloud",
        provider: "elizacloud",
      },
      credentialInputs: {
        cloudApiKey: "ck-test",
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

  it("builds a direct llm route and carries the openrouter model override", () => {
    expect(
      buildOnboardingRuntimeConfig({
        onboardingServerTarget: "local",
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
      deploymentTarget: { runtime: "local" },
      credentialInputs: {
        llmApiKey: "sk-or-test",
      },
      linkedAccounts: undefined,
      serviceRouting: {
        llmText: {
          backend: "openrouter",
          transport: "direct",
          primaryModel: "openai/gpt-5-mini",
        },
      },
      needsProviderSetup: false,
    });
  });

  it("builds a remote llm route when a remote backend is selected", () => {
    expect(
      buildOnboardingRuntimeConfig({
        onboardingServerTarget: "remote",
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
      deploymentTarget: {
        runtime: "remote",
        provider: "remote",
        remoteApiBase: "https://example.com/api",
        remoteAccessToken: "remote-key",
      },
      credentialInputs: {
        llmApiKey: "sk-ant-oat01-test",
      },
      linkedAccounts: undefined,
      serviceRouting: {
        llmText: {
          backend: "anthropic-subscription",
          transport: "remote",
          remoteApiBase: "https://example.com/api",
        },
      },
      needsProviderSetup: false,
    });
  });

  it("keeps a linked Eliza Cloud account when local inference uses another provider", () => {
    expect(
      buildOnboardingRuntimeConfig({
        onboardingServerTarget: "local",
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
      deploymentTarget: { runtime: "local" },
      credentialInputs: {
        cloudApiKey: "ck-linked",
        llmApiKey: "sk-openai-test",
      },
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

  it("defaults all Eliza Cloud services on when cloud inference is selected", () => {
    expect(
      buildOnboardingRuntimeConfig({
        onboardingServerTarget: "local",
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
      deploymentTarget: { runtime: "local" },
      credentialInputs: {
        cloudApiKey: "ck-linked",
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
