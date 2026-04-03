import { describe, expect, it } from "vitest";

import { applyFirstTimeSetupTopology } from "./first-time-setup";

describe("applyFirstTimeSetupTopology", () => {
  it("keeps cloud runtime separate from direct inference provider selection", () => {
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
      },
      cloud: {
        apiKey: "cloud-key",
        baseUrl: "https://elizacloud.ai",
        agentId: "agent-123",
      },
    });
  });

  it("allows local runtime to use Eliza Cloud for inference", () => {
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
      },
    });
  });

  it("keeps cloud runtime distinct from inference when no provider was chosen yet", () => {
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
      serviceRouting: undefined,
    });
  });
});
