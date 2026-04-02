import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ElizaConfig } from "../config/types.eliza";

const { applySubscriptionCredentials, deleteCredentials } = vi.hoisted(() => ({
  applySubscriptionCredentials: vi.fn(async () => undefined),
  deleteCredentials: vi.fn(),
}));

vi.mock("../auth/index", () => ({
  applySubscriptionCredentials,
  deleteCredentials,
}));
vi.mock("@miladyai/agent/auth", () => ({
  applySubscriptionCredentials,
  deleteCredentials,
}));

import {
  applyOnboardingConnectionConfig,
  applySubscriptionProviderConfig,
  clearPersistedOnboardingConfig,
  clearSubscriptionProviderConfig,
  createProviderSwitchConnection,
  mergeOnboardingConnectionWithExisting,
  reconcilePersistedOnboardingConnection,
  resolveExistingOnboardingConnection,
} from "./provider-switch-config";

function emptyConfig(): Partial<ElizaConfig> {
  return {};
}

function configWithDefaults(
  defaults: NonNullable<NonNullable<ElizaConfig["agents"]>["defaults"]> = {},
): Partial<ElizaConfig> {
  return { agents: { defaults } };
}

beforeEach(() => {
  applySubscriptionCredentials.mockClear();
  deleteCredentials.mockClear();
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ELIZA_USE_PI_AI;
  delete process.env.MILADY_USE_PI_AI;
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.ELIZAOS_CLOUD_ENABLED;
  delete process.env.ELIZAOS_CLOUD_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.ANTHROPIC_BASE_URL;
});

describe("applySubscriptionProviderConfig", () => {
  it("sets subscriptionProvider and model.primary for openai-codex", () => {
    const config = emptyConfig();
    applySubscriptionProviderConfig(config, "openai-codex");

    expect(config.agents?.defaults?.subscriptionProvider).toBe("openai-codex");
    expect(config.agents?.defaults?.model?.primary).toBe("openai");
  });

  it("sets subscriptionProvider and model.primary for anthropic-subscription", () => {
    const config = emptyConfig();
    applySubscriptionProviderConfig(config, "anthropic-subscription");

    expect(config.agents?.defaults?.subscriptionProvider).toBe(
      "anthropic-subscription",
    );
    expect(config.agents?.defaults?.model?.primary).toBe("anthropic");
  });

  it("normalizes openai-subscription to openai-codex", () => {
    const config = emptyConfig();
    applySubscriptionProviderConfig(config, "openai-subscription");

    expect(config.agents?.defaults?.subscriptionProvider).toBe("openai-codex");
    expect(config.agents?.defaults?.model?.primary).toBe("openai");
  });

  it("preserves existing model fallbacks", () => {
    const config = configWithDefaults({
      subscriptionProvider: "anthropic-subscription",
      model: {
        primary: "anthropic",
        fallbacks: ["openai", "groq"],
      },
    });

    applySubscriptionProviderConfig(config, "openai-codex");

    expect(config.agents?.defaults?.model?.primary).toBe("openai");
    expect(config.agents?.defaults?.model?.fallbacks).toEqual([
      "openai",
      "groq",
    ]);
  });
});

describe("clearSubscriptionProviderConfig", () => {
  it("removes subscriptionProvider and preserves other defaults", () => {
    const config = configWithDefaults({
      subscriptionProvider: "openai-codex",
      workspace: "/some/path",
      model: { primary: "openai" },
    });

    clearSubscriptionProviderConfig(config);

    expect(config.agents?.defaults?.subscriptionProvider).toBeUndefined();
    expect(config.agents?.defaults?.workspace).toBe("/some/path");
    expect(config.agents?.defaults?.model?.primary).toBe("openai");
  });
});

describe("applyOnboardingConnectionConfig", () => {
  it("persists a sanitized subscription selection without deleting other credentials", async () => {
    const config = {
      env: { OPENAI_API_KEY: "sk-openai-existing" },
    } as Partial<ElizaConfig>;

    await applyOnboardingConnectionConfig(config, {
      kind: "local-provider",
      provider: "anthropic-subscription",
    });

    expect(config.connection).toEqual({
      kind: "local-provider",
      provider: "anthropic-subscription",
    });
    expect(config.agents?.defaults?.subscriptionProvider).toBe(
      "anthropic-subscription",
    );
    expect(config.agents?.defaults?.model?.primary).toBe("anthropic");
    expect(applySubscriptionCredentials).toHaveBeenCalledTimes(1);
    expect(deleteCredentials).not.toHaveBeenCalled();
    expect((config.env as Record<string, string>).OPENAI_API_KEY).toBe(
      "sk-openai-existing",
    );
  });

  it("keeps an Anthropic setup token instead of rehydrating stored subscription credentials", async () => {
    const config = emptyConfig();

    await applyOnboardingConnectionConfig(config, {
      kind: "local-provider",
      provider: "anthropic-subscription",
      apiKey: "sk-ant-oat01-test-token",
    });

    expect(config.connection).toEqual({
      kind: "local-provider",
      provider: "anthropic-subscription",
    });
    expect(config.agents?.defaults?.subscriptionProvider).toBe(
      "anthropic-subscription",
    );
    expect(config.agents?.defaults?.model?.primary).toBe("anthropic");
    expect((config.env as Record<string, string>)?.ANTHROPIC_API_KEY).toBe(
      "sk-ant-oat01-test-token",
    );
    expect(applySubscriptionCredentials).not.toHaveBeenCalled();
  });

  it("preserves an existing direct-provider key when selection changes without a new apiKey", async () => {
    const config = {
      env: {
        OPENAI_API_KEY: "sk-saved-openai",
        vars: { OPENAI_API_KEY: "sk-saved-openai" },
      },
    } as Partial<ElizaConfig>;

    await applyOnboardingConnectionConfig(config, {
      kind: "local-provider",
      provider: "openai",
    });

    expect(config.connection).toEqual({
      kind: "local-provider",
      provider: "openai",
    });
    expect((config.env as Record<string, unknown>).OPENAI_API_KEY).toBe(
      "sk-saved-openai",
    );
    expect(
      ((config.env as Record<string, unknown>).vars as Record<string, string>)
        .OPENAI_API_KEY,
    ).toBe("sk-saved-openai");
  });

  it("disables cloud inference while preserving cloud auth state for local providers", async () => {
    const config = {
      cloud: {
        enabled: true,
        provider: "elizacloud",
        apiKey: "ck-cloud-existing",
        inferenceMode: "cloud",
        runtime: "cloud",
      },
      models: {
        small: "openai/gpt-5-mini",
        large: "anthropic/claude-sonnet-4.5",
      },
    } as Partial<ElizaConfig>;

    await applyOnboardingConnectionConfig(config, {
      kind: "local-provider",
      provider: "openrouter",
      apiKey: "sk-or-test",
      primaryModel: "openai/gpt-5-mini",
    });

    expect(config.connection).toEqual({
      kind: "local-provider",
      provider: "openrouter",
      primaryModel: "openai/gpt-5-mini",
    });
    expect(config.cloud).toEqual({
      apiKey: "ck-cloud-existing",
    });
    expect(config.linkedAccounts).toMatchObject({
      elizacloud: {
        status: "linked",
        source: "api-key",
      },
    });
    expect(config.serviceRouting).toMatchObject({
      llmText: {
        backend: "openrouter",
        transport: "direct",
        primaryModel: "openai/gpt-5-mini",
      },
    });
    expect(config.models).toBeUndefined();
    expect((config.env as Record<string, string>).OPENROUTER_API_KEY).toBe(
      "sk-or-test",
    );
    expect(config.agents?.defaults?.model?.primary).toBe("openai/gpt-5-mini");
  });

  it("persists sanitized cloud-managed selection and runtime config", async () => {
    const config = emptyConfig();

    await applyOnboardingConnectionConfig(config, {
      kind: "cloud-managed",
      cloudProvider: "elizacloud",
      apiKey: "ck-cloud-key",
      smallModel: "openai/gpt-5-mini",
      largeModel: "moonshotai/kimi-k2-0905",
    });

    expect(config.connection).toEqual({
      kind: "cloud-managed",
      cloudProvider: "elizacloud",
      smallModel: "openai/gpt-5-mini",
      largeModel: "moonshotai/kimi-k2-0905",
    });
    expect(config.cloud).toEqual({
      apiKey: "ck-cloud-key",
    });
    expect(config.linkedAccounts).toMatchObject({
      elizacloud: {
        status: "linked",
        source: "api-key",
      },
    });
    expect(config.serviceRouting).toMatchObject({
      llmText: {
        backend: "elizacloud",
        transport: "cloud-proxy",
        accountId: "elizacloud",
        smallModel: "openai/gpt-5-mini",
        largeModel: "moonshotai/kimi-k2-0905",
      },
    });
    expect(config.models).toEqual({
      small: "openai/gpt-5-mini",
      large: "moonshotai/kimi-k2-0905",
    });
  });
});

describe("createProviderSwitchConnection", () => {
  it.each([
    ["google", "gemini"],
    ["google-genai", "gemini"],
    ["xai", "grok"],
    ["openai-subscription", "openai-subscription"],
    ["ollama", "ollama"],
    ["mistral", "mistral"],
    ["together", "together"],
    ["zai", "zai"],
  ])("normalizes %s to canonical provider %s", (input, expected) => {
    expect(createProviderSwitchConnection({ provider: input })).toMatchObject({
      kind: "local-provider",
      provider: expected,
    });
  });
});

describe("resolveExistingOnboardingConnection", () => {
  it("prefers explicit config.connection over compatibility inference", () => {
    expect(
      resolveExistingOnboardingConnection({
        connection: {
          kind: "local-provider",
          provider: "openrouter",
          primaryModel: "openai/gpt-5-mini",
        },
        env: {
          OPENAI_API_KEY: "sk-openai",
        },
        cloud: {
          enabled: true,
          inferenceMode: "cloud",
          apiKey: "ck-cloud",
        },
      }),
    ).toEqual({
      kind: "local-provider",
      provider: "openrouter",
      primaryModel: "openai/gpt-5-mini",
    });
  });
});

describe("reconcilePersistedOnboardingConnection", () => {
  it("backfills ollama from OLLAMA_BASE_URL compatibility signals", () => {
    const config = {
      env: {
        vars: {
          OLLAMA_BASE_URL: "http://localhost:11434",
        },
      },
    } as Partial<ElizaConfig>;

    expect(reconcilePersistedOnboardingConnection(config)).toEqual({
      kind: "local-provider",
      provider: "ollama",
    });
    expect(config.connection).toEqual({
      kind: "local-provider",
      provider: "ollama",
    });
  });
});

describe("mergeOnboardingConnectionWithExisting", () => {
  it("preserves a saved local provider secret when the resumed submit omits it", () => {
    expect(
      mergeOnboardingConnectionWithExisting(
        {
          kind: "local-provider",
          provider: "openrouter",
          primaryModel: "openai/gpt-5-mini",
        },
        {
          kind: "local-provider",
          provider: "openrouter",
          apiKey: "sk-or-saved",
          primaryModel: "openai/gpt-5-mini",
        },
      ),
    ).toEqual({
      kind: "local-provider",
      provider: "openrouter",
      apiKey: "sk-or-saved",
      primaryModel: "openai/gpt-5-mini",
    });
  });

  it("preserves a saved cloud api key when the resumed submit sends a redacted placeholder", () => {
    expect(
      mergeOnboardingConnectionWithExisting(
        {
          kind: "cloud-managed",
          cloudProvider: "elizacloud",
          apiKey: "[REDACTED]",
        },
        {
          kind: "cloud-managed",
          cloudProvider: "elizacloud",
          apiKey: "sk-cloud-saved",
          smallModel: "openai/gpt-5-mini",
          largeModel: "anthropic/claude-sonnet-4.5",
        },
      ),
    ).toEqual({
      kind: "cloud-managed",
      cloudProvider: "elizacloud",
      apiKey: "sk-cloud-saved",
      smallModel: "openai/gpt-5-mini",
      largeModel: "anthropic/claude-sonnet-4.5",
    });
  });
});

describe("clearPersistedOnboardingConfig", () => {
  it("clears selection state, provider signals, and subscription oauth caches", () => {
    const config = {
      connection: {
        kind: "local-provider",
        provider: "openai",
      },
      env: {
        OPENAI_API_KEY: "sk-openai",
        vars: {
          OPENAI_API_KEY: "sk-openai",
          ELIZA_USE_PI_AI: "1",
          OLLAMA_BASE_URL: "http://localhost:11434",
        },
      },
      cloud: {
        enabled: true,
        apiKey: "ck-cloud",
      },
      models: {
        small: "openai/gpt-5-mini",
        large: "anthropic/claude-sonnet-4.5",
      },
      agents: {
        defaults: {
          subscriptionProvider: "openai-codex",
        },
      },
    } as Partial<ElizaConfig>;

    clearPersistedOnboardingConfig(config);

    expect(config.connection).toBeUndefined();
    expect(config.cloud).toEqual({});
    expect(config.models).toBeUndefined();
    expect(
      (config.env as Record<string, unknown>)?.OPENAI_API_KEY,
    ).toBeUndefined();
    expect(
      (
        (config.env as Record<string, unknown>)?.vars as
          | Record<string, unknown>
          | undefined
      )?.OPENAI_API_KEY,
    ).toBeUndefined();
    expect(deleteCredentials).toHaveBeenCalledWith("anthropic-subscription");
    expect(deleteCredentials).toHaveBeenCalledWith("openai-codex");
  });
});

describe("ElizaCloud CLI proxy env cleanup on local switch", () => {
  it("clears elizacloud base URLs and paired API keys, then applies the new local key", async () => {
    process.env.OPENAI_BASE_URL = "https://www.elizacloud.ai/api/v1";
    process.env.OPENAI_API_KEY = "cloud-secret";
    process.env.ANTHROPIC_BASE_URL = "https://www.elizacloud.ai/api/v1";
    process.env.ANTHROPIC_API_KEY = "cloud-secret";

    const config = emptyConfig();
    await applyOnboardingConnectionConfig(config, {
      kind: "local-provider",
      provider: "openai",
      apiKey: "sk-direct",
    });

    expect(process.env.OPENAI_BASE_URL).toBeUndefined();
    expect(process.env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(process.env.OPENAI_API_KEY).toBe("sk-direct");
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("does not clear OPENAI_API_KEY when elizacloud proxy URLs were never set", async () => {
    process.env.OPENAI_API_KEY = "sk-openai-preserve";
    process.env.ANTHROPIC_API_KEY = "sk-ant-legacy";

    const config = emptyConfig();
    await applyOnboardingConnectionConfig(config, {
      kind: "local-provider",
      provider: "anthropic",
      apiKey: "sk-ant-new",
    });

    expect(process.env.OPENAI_API_KEY).toBe("sk-openai-preserve");
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-new");
  });
});
