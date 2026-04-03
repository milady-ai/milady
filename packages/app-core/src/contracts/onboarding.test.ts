import { describe, expect, it } from "vitest";
import {
  isElizaCloudServiceSelectedInConfig,
  resolveElizaCloudTopology,
} from "@miladyai/shared/contracts";

import {
  inferOnboardingConnectionFromConfig,
  isCloudInferenceSelectedInConfig,
  getStoredOnboardingProviderId,
  isOnboardingConnectionComplete,
  getSubscriptionProviderFamily,
  migrateLegacyRuntimeConfig,
  normalizeOnboardingProviderId,
  normalizePersistedOnboardingConnection,
  normalizeSubscriptionProviderSelectionId,
  ONBOARDING_PROVIDER_CATALOG,
  sortOnboardingProviders,
} from "./onboarding";

describe("onboarding provider catalog", () => {
  it("round-trips subscription stored ids to UI ids", () => {
    expect(
      normalizeSubscriptionProviderSelectionId("anthropic-subscription"),
    ).toBe("anthropic-subscription");
    expect(normalizeSubscriptionProviderSelectionId("openai-codex")).toBe(
      "openai-subscription",
    );
    expect(getStoredOnboardingProviderId("anthropic-subscription")).toBe(
      "anthropic-subscription",
    );
    expect(getStoredOnboardingProviderId("openai-subscription")).toBe(
      "openai-codex",
    );
  });

  it("keeps subscription and api-key families distinct", () => {
    expect(getSubscriptionProviderFamily("anthropic-subscription")).toBe(
      "anthropic",
    );
    expect(getStoredOnboardingProviderId("anthropic")).toBe("anthropic");
    expect(getStoredOnboardingProviderId("anthropic-subscription")).not.toBe(
      getStoredOnboardingProviderId("anthropic"),
    );
  });

  it("normalizes provider aliases deterministically", () => {
    expect(normalizeOnboardingProviderId("openai-codex")).toBe(
      "openai-subscription",
    );
    expect(normalizeOnboardingProviderId("@elizaos/plugin-openai")).toBe(
      "openai",
    );
    expect(normalizeOnboardingProviderId("@elizaos/plugin-anthropic")).toBe(
      "anthropic",
    );
    expect(normalizeOnboardingProviderId("google")).toBe("gemini");
    expect(normalizeOnboardingProviderId("xai")).toBe("grok");
    expect(normalizeOnboardingProviderId("z.ai")).toBe("zai");
  });

  it("canonicalizes persisted connection aliases", () => {
    expect(
      normalizePersistedOnboardingConnection({
        kind: "local-provider",
        provider: "google-genai",
      }),
    ).toEqual({
      kind: "local-provider",
      provider: "gemini",
    });

    expect(
      normalizePersistedOnboardingConnection({
        kind: "local-provider",
        provider: "openai-codex",
      }),
    ).toEqual({
      kind: "local-provider",
      provider: "openai-subscription",
    });
  });

  it("sorts recommended providers ahead of the rest", () => {
    const sorted = sortOnboardingProviders(ONBOARDING_PROVIDER_CATALOG);
    expect(sorted.slice(0, 3).map((provider) => provider.id)).toEqual([
      "elizacloud",
      "anthropic-subscription",
      "openai-subscription",
    ]);
  });

  it("prefers canonical direct routing over inactive cloud capability signals", () => {
    expect(
      inferOnboardingConnectionFromConfig({
        serviceRouting: {
          llmText: {
            backend: "openrouter",
            transport: "direct",
            primaryModel: "openai/gpt-5-mini",
          },
        },
        cloud: {
          enabled: true,
          provider: "elizacloud",
          apiKey: "ck-cloud-test",
          inferenceMode: "cloud",
        },
        env: {
          vars: {
            OPENAI_API_KEY: "sk-openai-test",
          },
        },
      }),
    ).toEqual({
      kind: "local-provider",
      provider: "openrouter",
      primaryModel: "openai/gpt-5-mini",
    });
  });

  it("prefers canonical runtime routing over a conflicting explicit connection", () => {
    expect(
      inferOnboardingConnectionFromConfig({
        connection: {
          kind: "cloud-managed",
          cloudProvider: "elizacloud",
          smallModel: "openai/gpt-5-mini",
          largeModel: "anthropic/claude-sonnet-4.5",
        },
        deploymentTarget: {
          runtime: "cloud",
          provider: "elizacloud",
        },
        serviceRouting: {
          llmText: {
            backend: "openai",
            transport: "direct",
            primaryModel: "openai/gpt-5.2",
          },
        },
      }),
    ).toEqual({
      kind: "local-provider",
      provider: "openai",
      primaryModel: "openai/gpt-5.2",
    });
  });

  it("treats explicit local-provider selections as not using cloud inference", () => {
    expect(
      isCloudInferenceSelectedInConfig({
        serviceRouting: {
          llmText: {
            backend: "openrouter",
            transport: "direct",
          },
        },
        cloud: {
          enabled: true,
          provider: "elizacloud",
          apiKey: "ck-cloud-test",
          inferenceMode: "cloud",
        },
        models: {
          small: "openai/gpt-5-mini",
          large: "anthropic/claude-sonnet-4.5",
        },
      }),
    ).toBe(false);
  });

  it("migrates legacy cloud-only configs into canonical cloud inference routing", () => {
    const migrated = migrateLegacyRuntimeConfig({
      cloud: {
        provider: "elizacloud",
        inferenceMode: "cloud",
      },
      models: {
        small: "openai/gpt-5-mini",
        large: "anthropic/claude-sonnet-4.5",
      },
    });

    expect(migrated.serviceRouting).toMatchObject({
      llmText: {
        backend: "elizacloud",
        transport: "cloud-proxy",
        smallModel: "openai/gpt-5-mini",
        largeModel: "anthropic/claude-sonnet-4.5",
      },
    });
    expect(migrated.cloud).not.toMatchObject({
      provider: "elizacloud",
      inferenceMode: "cloud",
    });
    expect(isCloudInferenceSelectedInConfig(migrated)).toBe(true);
  });

  it("drops legacy byok cloud routing during migration", () => {
    const migrated = migrateLegacyRuntimeConfig({
      cloud: {
        enabled: true,
        provider: "elizacloud",
        inferenceMode: "byok",
        services: {
          inference: false,
        },
      },
    });

    expect(migrated.serviceRouting).toBeUndefined();
    expect(isCloudInferenceSelectedInConfig(migrated)).toBe(false);
  });

  it("keeps linked cloud auth separate from service routing", () => {
    const topology = resolveElizaCloudTopology({
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
        },
        tts: {
          backend: "elizacloud",
          transport: "cloud-proxy",
          accountId: "elizacloud",
        },
      },
    });

    expect(topology.linked).toBe(true);
    expect(topology.services.inference).toBe(false);
    expect(topology.services.tts).toBe(true);
    expect(topology.services.rpc).toBe(false);
    expect(topology.shouldLoadPlugin).toBe(true);
    expect(
      isElizaCloudServiceSelectedInConfig(
        {
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
            },
            tts: {
              backend: "elizacloud",
              transport: "cloud-proxy",
              accountId: "elizacloud",
            },
          },
        },
        "tts",
      ),
    ).toBe(true);
  });

  it("does not auto-route non-text cloud services from cloud hosting or cloud inference alone", () => {
    const config = {
      deploymentTarget: {
        runtime: "cloud",
        provider: "elizacloud",
      },
      serviceRouting: {
        llmText: {
          backend: "elizacloud",
          transport: "cloud-proxy",
          accountId: "elizacloud",
          smallModel: "openai/gpt-5-mini",
          largeModel: "anthropic/claude-sonnet-4.5",
        },
      },
    };

    expect(config.serviceRouting).toEqual({
      llmText: {
        backend: "elizacloud",
        transport: "cloud-proxy",
        accountId: "elizacloud",
        smallModel: "openai/gpt-5-mini",
        largeModel: "anthropic/claude-sonnet-4.5",
      },
    });
    expect(isElizaCloudServiceSelectedInConfig(config, "media")).toBe(false);
    expect(isElizaCloudServiceSelectedInConfig(config, "rpc")).toBe(false);
  });

  it("keeps remote selection ahead of local env-backed providers", () => {
    expect(
      inferOnboardingConnectionFromConfig({
        deploymentTarget: {
          runtime: "remote",
          provider: "remote",
          remoteApiBase: "https://remote.example/api",
          remoteAccessToken: "remote-token",
        },
        env: {
          vars: {
            OPENAI_API_KEY: "sk-openai-test",
          },
        },
      }),
    ).toMatchObject({
      kind: "remote-provider",
      remoteApiBase: "https://remote.example/api",
      remoteAccessToken: "remote-token",
    });
  });

  it("does not infer remote selection from an access token without an API base", () => {
    expect(
      inferOnboardingConnectionFromConfig({
        deploymentTarget: { runtime: "remote", provider: "remote" },
      }),
    ).toBeNull();
  });

  it("does not infer cloud selection from cloud api key capability alone", () => {
    expect(
      inferOnboardingConnectionFromConfig({
        cloud: {
          apiKey: "ck-cloud-test",
        },
      }),
    ).toBeNull();
  });

  it("infers ollama from its transport capability on legacy configs", () => {
    expect(
      inferOnboardingConnectionFromConfig({
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

  it("treats local providers as complete onboarding state", () => {
    expect(
      isOnboardingConnectionComplete({
        kind: "local-provider",
        provider: "openai",
      }),
    ).toBe(true);
  });

  it("requires remote selections to keep a non-empty API base", () => {
    expect(
      isOnboardingConnectionComplete({
        kind: "remote-provider",
        remoteApiBase: "https://remote.example/api",
      }),
    ).toBe(true);
    expect(
      isOnboardingConnectionComplete({
        kind: "remote-provider",
        remoteApiBase: "",
      }),
    ).toBe(false);
  });

  it("requires full cloud-managed model selection before onboarding is complete", () => {
    expect(
      isOnboardingConnectionComplete({
        kind: "cloud-managed",
        cloudProvider: "elizacloud",
        smallModel: "minimax/minimax-m2.7",
        largeModel: "anthropic/claude-sonnet-4.6",
      }),
    ).toBe(true);

    expect(
      isOnboardingConnectionComplete({
        kind: "cloud-managed",
        cloudProvider: "elizacloud",
        apiKey: "ck-ready",
        smallModel: "minimax/minimax-m2.7",
        largeModel: "anthropic/claude-sonnet-4.6",
      }),
    ).toBe(true);

    expect(
      isOnboardingConnectionComplete({
        kind: "cloud-managed",
        cloudProvider: "elizacloud",
        apiKey: "ck-partial",
      }),
    ).toBe(false);
  });
});
