/**
 * Regression tests: compat replay must stay canonical-only.
 *
 * The active app submits canonical runtime fields. Compat replay may strip
 * legacy onboarding keys from older payloads, but it must not translate them
 * back into the live upstream contract.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/config", () => ({
  loadElizaConfig: vi.fn(),
  saveElizaConfig: vi.fn(),
}));

vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  stringToUuid: (s: string) => `uuid-${s}`,
}));

vi.mock("@miladyai/agent/cloud/validate-url", () => ({
  validateCloudBaseUrl: vi.fn(() => Promise.resolve(null)),
}));

import { deriveCompatOnboardingReplayBody } from "../server-onboarding-compat";

describe("deriveCompatOnboardingReplayBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not infer cloud hosting from cloud-proxy inference alone", () => {
    const body = {
      name: "Agent",
      deploymentTarget: { runtime: "local" },
      serviceRouting: {
        llmText: {
          backend: "elizacloud",
          transport: "cloud-proxy",
          accountId: "elizacloud",
        },
      },
    };

    const { isCloudMode, replayBody } = deriveCompatOnboardingReplayBody(body);

    expect(isCloudMode).toBe(false);
    expect(replayBody).toMatchObject(body);
  });

  it("detects cloud mode from canonical deploymentTarget runtime", () => {
    const body = {
      name: "Agent",
      deploymentTarget: {
        runtime: "cloud",
        provider: "elizacloud",
      },
    };

    const { isCloudMode, replayBody } = deriveCompatOnboardingReplayBody(body);

    expect(isCloudMode).toBe(true);
    expect(replayBody).toMatchObject(body);
  });

  it("preserves canonical direct routing on Eliza Cloud hosting", () => {
    const body = {
      name: "Agent",
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
        llmText: {
          backend: "openai",
          transport: "direct",
          primaryModel: "openai/gpt-5.2",
        },
      },
      credentialInputs: {
        llmApiKey: "sk-openai-test",
        cloudApiKey: "ck-cloud-test",
      },
    };

    const { isCloudMode, replayBody } = deriveCompatOnboardingReplayBody(body);

    expect(isCloudMode).toBe(true);
    expect(replayBody).toMatchObject(body);
  });

  it("strips legacy onboarding fields without synthesizing canonical runtime", () => {
    const body = {
      name: "Agent",
      runMode: "cloud",
      connection: {
        kind: "local-provider",
        provider: "openrouter",
        apiKey: "sk-test-openrouter",
        primaryModel: "openai/gpt-5-mini",
      },
      providerApiKey: "sk-test-openrouter",
    };

    const { isCloudMode, replayBody } = deriveCompatOnboardingReplayBody(body);

    expect(isCloudMode).toBe(false);
    expect(replayBody).toEqual({
      name: "Agent",
    });
    expect(replayBody).not.toHaveProperty("connection");
    expect(replayBody).not.toHaveProperty("runMode");
    expect(replayBody).not.toHaveProperty("providerApiKey");
  });

  it("strips legacy keys while preserving canonical runtime fields when both are present", () => {
    const body = {
      name: "Agent",
      runMode: "cloud",
      connection: {
        kind: "cloud-managed",
        cloudProvider: "elizacloud",
      },
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
    };

    const { isCloudMode, replayBody } = deriveCompatOnboardingReplayBody(body);

    expect(isCloudMode).toBe(true);
    expect(replayBody).toMatchObject({
      name: "Agent",
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
    });
    expect(replayBody).not.toHaveProperty("connection");
    expect(replayBody).not.toHaveProperty("runMode");
  });
});
