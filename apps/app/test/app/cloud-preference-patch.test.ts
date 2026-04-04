import {
  installLocalProviderCloudPreferencePatch,
  normalizeConfigForLocalProviderPreference,
  shouldMaskInactiveCloudStatus,
  shouldPreferLocalProviderConfig,
} from "@miladyai/app-core/platform";
import { describe, expect, it, vi } from "vitest";

describe("cloud preference patch", () => {
  it("normalizes inactive cloud config when a Claude subscription is already configured", () => {
    const normalized = normalizeConfigForLocalProviderPreference({
      serviceRouting: {
        llmText: {
          backend: "anthropic",
          transport: "direct",
        },
      },
      cloud: {
        enabled: false,
        apiKey: "eliza-stale-key",
        provider: "elizacloud",
        inferenceMode: "cloud",
        services: { inference: true },
      },
      agents: {
        defaults: {
          subscriptionProvider: "anthropic-subscription",
          model: { primary: "anthropic" },
        },
      },
      models: {
        small: "moonshotai/kimi-k2-turbo",
        large: "moonshotai/kimi-k2-0905",
      },
    }) as Record<string, unknown>;

    expect(
      shouldPreferLocalProviderConfig({
        serviceRouting: {
          llmText: {
            backend: "anthropic",
            transport: "direct",
          },
        },
        cloud: {
          enabled: false,
          apiKey: "eliza-stale-key",
          provider: "elizacloud",
          inferenceMode: "cloud",
        },
        agents: {
          defaults: {
            subscriptionProvider: "anthropic-subscription",
          },
        },
      }),
    ).toBe(true);
    expect(normalized.cloud).toEqual({
      apiKey: "eliza-stale-key",
    });
    expect(normalized.models).toEqual({
      small: "moonshotai/kimi-k2-turbo",
      large: "moonshotai/kimi-k2-0905",
    });
    expect(
      (
        normalized.agents as {
          defaults?: { subscriptionProvider?: string };
        }
      )?.defaults?.subscriptionProvider?.toString(),
    ).toBe("anthropic-subscription");
  });

  it("does not normalize config when cloud is actively handling inference via cloud-proxy", () => {
    const config = {
      serviceRouting: {
        llmText: {
          backend: "elizacloud",
          transport: "cloud-proxy",
        },
      },
      cloud: {
        apiKey: "eliza-live-key",
        provider: "elizacloud",
        inferenceMode: "cloud",
        services: { inference: true },
      },
      agents: {
        defaults: {
          subscriptionProvider: "anthropic-subscription",
        },
      },
    };

    expect(shouldPreferLocalProviderConfig(config)).toBe(false);
    expect(normalizeConfigForLocalProviderPreference(config)).toEqual(config);
  });

  it("masks api-key-only cloud status when local Claude is the active provider", () => {
    const config = {
      cloud: {
        enabled: false,
        apiKey: "eliza-stale-key",
        inferenceMode: "byok",
      },
      agents: {
        defaults: {
          subscriptionProvider: "anthropic-subscription",
        },
      },
    };

    expect(
      shouldMaskInactiveCloudStatus({
        config,
        status: {
          enabled: false,
          connected: true,
          hasApiKey: true,
        },
      }),
    ).toBe(true);
    expect(
      shouldMaskInactiveCloudStatus({
        config,
        status: {
          enabled: false,
          connected: true,
          hasApiKey: true,
          userId: "user-1",
        },
      }),
    ).toBe(false);
  });

  it("regression: cloud-proxy routing prevents masking even with local provider signals", () => {
    // When the cloud is actively handling inference via cloud-proxy,
    // shouldPreferLocalProviderConfig returns false regardless of other signals.
    const config = {
      serviceRouting: {
        llmText: {
          backend: "elizacloud",
          transport: "cloud-proxy",
        },
      },
      cloud: {
        apiKey: "eliza-freshly-logged-in-key",
        inferenceMode: "cloud",
      },
      agents: {
        defaults: {
          subscriptionProvider: "anthropic-subscription",
          model: { primary: "anthropic" },
        },
      },
    };

    expect(shouldPreferLocalProviderConfig(config)).toBe(false);
    expect(normalizeConfigForLocalProviderPreference(config)).toEqual(config);
  });

  it("regression: freshly logged in user cloud status is not masked when userId present", () => {
    const config = {
      serviceRouting: {
        llmText: {
          backend: "anthropic",
          transport: "direct",
        },
      },
      cloud: {
        apiKey: "eliza-freshly-logged-in-key",
        inferenceMode: "byok",
      },
      agents: {
        defaults: {
          subscriptionProvider: "anthropic-subscription",
        },
      },
    };

    expect(
      shouldMaskInactiveCloudStatus({
        config,
        status: {
          enabled: true,
          connected: true,
          hasApiKey: true,
          userId: "user-1",
        },
      }),
    ).toBe(false);
  });

  it("cloud.enabled undefined still allows masking when other conditions met", () => {
    const config = {
      cloud: {
        apiKey: "eliza-stale-key",
        inferenceMode: "byok",
      },
      agents: {
        defaults: {
          subscriptionProvider: "anthropic-subscription",
        },
      },
    };

    expect(shouldPreferLocalProviderConfig(config)).toBe(true);
  });

  it("cloud.enabled false still allows masking when other conditions met", () => {
    const config = {
      cloud: {
        enabled: false,
        apiKey: "eliza-stale-key",
        inferenceMode: "byok",
      },
      agents: {
        defaults: {
          subscriptionProvider: "anthropic-subscription",
        },
      },
    };

    expect(shouldPreferLocalProviderConfig(config)).toBe(true);
  });

  it("patches config reads without hiding linked cloud account state", async () => {
    const originalGetConfig = vi.fn(async () => ({
      serviceRouting: {
        llmText: {
          backend: "anthropic",
          transport: "direct",
        },
      },
      cloud: {
        enabled: false,
        apiKey: "eliza-stale-key",
        provider: "elizacloud",
        inferenceMode: "byok",
      },
      agents: {
        defaults: {
          subscriptionProvider: "anthropic-subscription",
          model: { primary: "anthropic" },
        },
      },
    }));
    const originalGetCloudStatus = vi.fn(async () => ({
      enabled: false,
      connected: true,
      hasApiKey: true,
    }));
    const originalGetCloudCredits = vi.fn(async () => ({
      connected: true,
      balance: 0.17,
    }));

    const mockClient = {
      getConfig: originalGetConfig,
      getCloudStatus: originalGetCloudStatus,
      getCloudCredits: originalGetCloudCredits,
    };

    const restore = installLocalProviderCloudPreferencePatch(mockClient);

    try {
      await expect(mockClient.getConfig()).resolves.toEqual({
        serviceRouting: {
          llmText: {
            backend: "anthropic",
            transport: "direct",
          },
        },
        cloud: {
          apiKey: "eliza-stale-key",
        },
        agents: {
          defaults: {
            subscriptionProvider: "anthropic-subscription",
            model: { primary: "anthropic" },
          },
        },
      });
      await expect(mockClient.getCloudStatus()).resolves.toEqual({
        enabled: false,
        connected: true,
        hasApiKey: true,
      });
      await expect(mockClient.getCloudCredits()).resolves.toEqual({
        balance: 0.17,
        connected: true,
      });
      expect(originalGetCloudCredits).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });
});
