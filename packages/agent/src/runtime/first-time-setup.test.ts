import { describe, expect, it } from "vitest";

import { applyFirstTimeSetupTopology } from "./first-time-setup";

describe("applyFirstTimeSetupTopology", () => {
  it("defaults cloud services on when cloud runtime uses a direct provider", () => {
    expect(
      applyFirstTimeSetupTopology({} as never, {
        isCloudRuntime: true,
        selectedProviderId: "openai",
        cloudOnboardingResult: {
          apiKey: "cloud-key",
          baseUrl: "https://elizacloud.ai",
          agentId: "agent-123",
        },
      }),
    ).toMatchObject({
      deploymentTarget: {
        runtime: "cloud",
        provider: "elizacloud",
      },
      linkedAccounts: {
        elizacloud: {
          status: "linked",
          source: "oauth",
        },
      },
      serviceRouting: {
        llmText: {
          backend: "openai",
          transport: "direct",
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
      cloud: {
        apiKey: "cloud-key",
        baseUrl: "https://elizacloud.ai",
        agentId: "agent-123",
      },
    });
  });

  it("defaults all cloud services on when local runtime uses Eliza Cloud inference", () => {
    expect(
      applyFirstTimeSetupTopology({} as never, {
        isCloudRuntime: false,
        selectedProviderId: "elizacloud",
        cloudOnboardingResult: {
          apiKey: "cloud-key",
          baseUrl: "https://elizacloud.ai",
          agentId: undefined,
        },
      }),
    ).toMatchObject({
      deploymentTarget: {
        runtime: "local",
      },
      linkedAccounts: {
        elizacloud: {
          status: "linked",
          source: "oauth",
        },
      },
      serviceRouting: {
        llmText: {
          backend: "elizacloud",
          transport: "cloud-proxy",
          accountId: "elizacloud",
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
    });
  });

  it("defaults non-text cloud services on even before cloud runtime picks a chat provider", () => {
    expect(
      applyFirstTimeSetupTopology({} as never, {
        isCloudRuntime: true,
        cloudOnboardingResult: {
          apiKey: "cloud-key",
          baseUrl: "https://elizacloud.ai",
          agentId: "agent-123",
        },
      }),
    ).toMatchObject({
      deploymentTarget: {
        runtime: "cloud",
        provider: "elizacloud",
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
    });
  });
});
