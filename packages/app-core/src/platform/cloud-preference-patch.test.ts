import { describe, expect, it, vi } from "vitest";

import {
  installLocalProviderCloudPreferencePatch,
  normalizeConfigForLocalProviderPreference,
  shouldMaskInactiveCloudStatus,
  shouldPreferLocalProviderConfig,
} from "./cloud-preference-patch";

describe("cloud-preference-patch", () => {
  it("masks inactive cloud capability when an explicit local provider is selected", () => {
    const config = {
      connection: {
        kind: "local-provider",
        provider: "openrouter",
      },
      cloud: {
        enabled: false,
        provider: "elizacloud",
        apiKey: "ck-cloud-test",
        inferenceMode: "cloud",
        services: { inference: true },
      },
      models: {
        small: "openai/gpt-5-mini",
        large: "anthropic/claude-sonnet-4.5",
      },
    };

    expect(shouldPreferLocalProviderConfig(config)).toBe(true);

    const normalized = normalizeConfigForLocalProviderPreference(config);
    expect(normalized?.cloud).toMatchObject({
      enabled: false,
      inferenceMode: "byok",
      services: { inference: false },
    });
    expect(normalized?.cloud).not.toHaveProperty("apiKey");
    expect(normalized?.cloud).not.toHaveProperty("provider");
    expect(normalized).not.toHaveProperty("models");

    expect(
      shouldMaskInactiveCloudStatus({
        config,
        status: { connected: true, hasApiKey: true },
      }),
    ).toBe(true);
  });

  it("does not treat cloud api key capability alone as active local preference", () => {
    const config = {
      cloud: {
        apiKey: "ck-cloud-test",
      },
    };

    expect(shouldPreferLocalProviderConfig(config)).toBe(false);
    expect(
      shouldMaskInactiveCloudStatus({
        config,
        status: { connected: true, hasApiKey: true },
      }),
    ).toBe(false);
  });

  it("does not override an explicit cloud selection", () => {
    expect(
      shouldPreferLocalProviderConfig({
        serviceRouting: {
          llmText: {
            backend: "elizacloud",
            transport: "cloud-proxy",
            accountId: "elizacloud",
          },
        },
        linkedAccounts: {
          elizacloud: { status: "linked", source: "api-key" },
        },
        cloud: {
          enabled: true,
          provider: "elizacloud",
          inferenceMode: "cloud",
          services: { inference: true },
        },
      }),
    ).toBe(false);
  });

  it("still prefers the direct provider when runtime stays on Eliza Cloud", () => {
    const config = {
      deploymentTarget: {
        runtime: "cloud",
        provider: "elizacloud",
      },
      linkedAccounts: {
        elizacloud: { status: "linked", source: "api-key" },
      },
      serviceRouting: {
        llmText: {
          backend: "openai",
          transport: "direct",
        },
        rpc: {
          backend: "elizacloud",
          transport: "cloud-proxy",
          accountId: "elizacloud",
        },
      },
      cloud: {
        enabled: true,
        provider: "elizacloud",
        apiKey: "ck-cloud-test",
        inferenceMode: "cloud",
        services: { inference: true, rpc: true },
      },
    };

    expect(shouldPreferLocalProviderConfig(config)).toBe(true);

    const normalized = normalizeConfigForLocalProviderPreference(config);
    expect(normalized?.deploymentTarget).toEqual(config.deploymentTarget);
    expect(normalized?.cloud).toMatchObject({
      enabled: false,
      inferenceMode: "byok",
      services: { inference: false, rpc: true },
    });
  });

  it("normalizes config reads without hiding linked cloud status", async () => {
    const rawConfig = {
      connection: {
        kind: "local-provider",
        provider: "anthropic",
      },
      cloud: {
        enabled: false,
        provider: "elizacloud",
        apiKey: "ck-cloud-test",
        inferenceMode: "cloud",
        services: { inference: true },
      },
      models: {
        small: "openai/gpt-5-mini",
      },
    };
    const rawStatus = {
      connected: true,
      enabled: true,
      hasApiKey: true,
    };

    const client = {
      getConfig: vi.fn(async () => rawConfig),
      getCloudStatus: vi.fn(async () => rawStatus),
      getCloudCredits: vi.fn(async () => ({ balance: 42, connected: true })),
    };

    const uninstall = installLocalProviderCloudPreferencePatch(client);

    await expect(client.getConfig()).resolves.toMatchObject({
      connection: rawConfig.connection,
      cloud: {
        enabled: false,
        inferenceMode: "byok",
        services: { inference: false },
      },
    });
    const patchedConfig = await client.getConfig();
    expect(patchedConfig.cloud).not.toHaveProperty("apiKey");

    await expect(client.getCloudStatus()).resolves.toBe(rawStatus);
    await expect(client.getCloudCredits?.()).resolves.toEqual({
      balance: 42,
      connected: true,
    });

    uninstall();

    await expect(client.getConfig()).resolves.toBe(rawConfig);
    await expect(client.getCloudStatus()).resolves.toBe(rawStatus);
    await expect(client.getCloudCredits?.()).resolves.toEqual({
      balance: 42,
      connected: true,
    });
  });
});
