/**
 * Tests for Anthropic setup token handling during onboarding.
 *
 * Anthropic subscription tokens (OAuth / setup tokens) are restricted to the
 * Claude Code CLI per Anthropic TOS. The runtime MUST NOT inject them into
 * process.env as ANTHROPIC_API_KEY. Instead they are stored only in
 * config.env.__anthropicSubscriptionToken for task-agent discovery.
 *
 * The onboarding flow routes through applyOnboardingConnectionConfig(),
 * so these tests validate the normalized helper rather than a copied inline
 * branch from server.ts.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyOnboardingConnectionConfig } from "./provider-switch-config";

async function applySetupToken(
  body: { provider?: string; providerApiKey?: unknown },
  config: { env?: Record<string, string | undefined> },
): Promise<boolean> {
  if (body.provider !== "anthropic-subscription") {
    return false;
  }
  try {
    await applyOnboardingConnectionConfig(config, {
      kind: "local-provider",
      provider: "anthropic-subscription",
      apiKey:
        typeof body.providerApiKey === "string"
          ? body.providerApiKey
          : undefined,
    });
    // Anthropic subscription tokens are stored as __anthropicSubscriptionToken
    // (NOT as ANTHROPIC_API_KEY) per TOS. Return true if the token was persisted.
    return (
      typeof (config.env as Record<string, unknown> | undefined)
        ?.__anthropicSubscriptionToken === "string"
    );
  } catch {
    return false;
  }
}

describe("Anthropic setup token during onboarding", () => {
  let savedAnthropicKey: string | undefined;
  let savedOpenAiKey: string | undefined;

  beforeEach(() => {
    savedAnthropicKey = process.env.ANTHROPIC_API_KEY;
    savedOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (savedAnthropicKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedAnthropicKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (savedOpenAiKey !== undefined) {
      process.env.OPENAI_API_KEY = savedOpenAiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("stores a valid setup token in config (NOT in process.env.ANTHROPIC_API_KEY)", async () => {
    const config: { env?: Record<string, string | undefined> } = {};
    const saved = await applySetupToken(
      {
        provider: "anthropic-subscription",
        providerApiKey: "sk-ant-oat01-test-token-12345",
      },
      config,
    );

    expect(saved).toBe(true);
    // TOS: must NOT be in process.env
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    // Stored for task-agent discovery only
    expect(
      (config.env as Record<string, unknown> | undefined)
        ?.__anthropicSubscriptionToken,
    ).toBe("sk-ant-oat01-test-token-12345");
    // MUST NOT be stored as ANTHROPIC_API_KEY
    expect(config.env?.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("trims whitespace from token before storing", async () => {
    const config: { env?: Record<string, string | undefined> } = {};
    const saved = await applySetupToken(
      {
        provider: "anthropic-subscription",
        providerApiKey: "  sk-ant-oat01-whitespace  ",
      },
      config,
    );

    expect(saved).toBe(true);
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(
      (config.env as Record<string, unknown> | undefined)
        ?.__anthropicSubscriptionToken,
    ).toBe("sk-ant-oat01-whitespace");
  });

  it("does nothing for non-subscription providers", async () => {
    const config: { env?: Record<string, string | undefined> } = {};
    const saved = await applySetupToken(
      { provider: "anthropic", providerApiKey: "sk-ant-api-key-regular" },
      config,
    );

    expect(saved).toBe(false);
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(config.env).toBeUndefined();
  });

  it("does nothing for openai-subscription", async () => {
    const config: { env?: Record<string, string | undefined> } = {};
    const saved = await applySetupToken(
      { provider: "openai-subscription", providerApiKey: "sk-something" },
      config,
    );

    expect(saved).toBe(false);
  });

  it("does nothing when providerApiKey is not a string", async () => {
    const config: { env?: Record<string, string | undefined> } = {};
    const saved = await applySetupToken(
      { provider: "anthropic-subscription", providerApiKey: 12345 },
      config,
    );

    expect(saved).toBe(false);
  });

  it("does nothing when token does not start with sk-ant-", async () => {
    const config: { env?: Record<string, string | undefined> } = {};
    const saved = await applySetupToken(
      {
        provider: "anthropic-subscription",
        providerApiKey: "not-a-valid-token",
      },
      config,
    );

    expect(saved).toBe(false);
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(
      (config.env as Record<string, unknown> | undefined)
        ?.__anthropicSubscriptionToken,
    ).toBeUndefined();
  });

  it("does nothing when providerApiKey is missing", async () => {
    const config: { env?: Record<string, string | undefined> } = {};
    const saved = await applySetupToken(
      { provider: "anthropic-subscription" },
      config,
    );

    expect(saved).toBe(false);
  });

  it("initializes config.env if it does not exist", async () => {
    const config: { env?: Record<string, string | undefined> } = {};
    expect(config.env).toBeUndefined();

    await applySetupToken(
      {
        provider: "anthropic-subscription",
        providerApiKey: "sk-ant-oat01-init-env",
      },
      config,
    );

    expect(config.env).toBeDefined();
    expect(
      (config.env as Record<string, unknown> | undefined)
        ?.__anthropicSubscriptionToken,
    ).toBe("sk-ant-oat01-init-env");
    expect(config.env?.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("preserves existing config.env entries", async () => {
    const config: { env?: Record<string, string | undefined> } = {
      env: { EXISTING_KEY: "existing-value" },
    };

    await applySetupToken(
      {
        provider: "anthropic-subscription",
        providerApiKey: "sk-ant-oat01-preserve-test",
      },
      config,
    );

    expect(config.env?.EXISTING_KEY).toBe("existing-value");
    expect(
      (config.env as Record<string, unknown> | undefined)
        ?.__anthropicSubscriptionToken,
    ).toBe("sk-ant-oat01-preserve-test");
    expect(config.env?.ANTHROPIC_API_KEY).toBeUndefined();
  });
});
