import { describe, expect, it } from "vitest";

import {
  inferOnboardingConnectionFromConfig,
  getStoredOnboardingProviderId,
  isOnboardingConnectionComplete,
  getSubscriptionProviderFamily,
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

  it("prefers explicit connection over capability signals", () => {
    expect(
      inferOnboardingConnectionFromConfig({
        connection: {
          kind: "local-provider",
          provider: "openrouter",
          primaryModel: "openai/gpt-5-mini",
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

  it("keeps remote selection ahead of local env-backed providers", () => {
    expect(
      inferOnboardingConnectionFromConfig({
        cloud: {
          remoteApiBase: "https://remote.example/api",
          remoteAccessToken: "remote-token",
          enabled: true,
          provider: "elizacloud",
          inferenceMode: "cloud",
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
        apiKey: "ck-ready",
        smallModel: "openai/gpt-5-mini",
        largeModel: "anthropic/claude-sonnet-4.5",
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
