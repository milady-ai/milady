/**
 * Plugin Auto-Enable — Unit Tests
 *
 * Tests for:
 * - applyPluginAutoEnable (connector, auth profile, env var, feature flag, hooks rules)
 * - CONNECTOR_PLUGINS / AUTH_PROVIDER_PLUGINS mappings
 */
import { describe, expect, it, vi } from "vitest";

// Mock all static plugin star-imports in eliza.ts to avoid ESM resolution
// failures from heavy transitive dependencies at static-analysis time.
vi.mock("@elizaos/plugin-agent-orchestrator", () => ({ default: {} }));
vi.mock("@elizaos/plugin-agent-skills", () => ({ default: {} }));
vi.mock("@elizaos/plugin-anthropic", () => ({ default: {} }));
vi.mock("@elizaos/plugin-browser", () => ({ default: {} }));
vi.mock("@elizaos/plugin-cli", () => ({ default: {} }));
vi.mock("@elizaos/plugin-computeruse", () => ({ default: {} }));
vi.mock("@elizaos/plugin-cron", () => ({ default: {} }));
vi.mock("@elizaos/plugin-discord", () => ({ default: {} }));
vi.mock("@elizaos/plugin-edge-tts", () => ({ default: {} }));
vi.mock("@elizaos/plugin-elevenlabs", () => ({ default: {} }));
vi.mock("@elizaos/plugin-elizacloud", () => ({ default: {} }));
vi.mock("@elizaos/plugin-experience", () => ({ default: {} }));
vi.mock("@elizaos/plugin-form", () => ({ default: {} }));
vi.mock("@elizaos/plugin-google-genai", () => ({ default: {} }));
vi.mock("@elizaos/plugin-groq", () => ({ default: {} }));
vi.mock("@elizaos/plugin-local-embedding", () => ({ default: {} }));
vi.mock("@elizaos/plugin-ollama", () => ({ default: {} }));
vi.mock("@elizaos/plugin-openai", () => ({ default: {} }));
vi.mock("@elizaos/plugin-openrouter", () => ({ default: {} }));
vi.mock("@elizaos/plugin-pdf", () => ({ default: {} }));
vi.mock("@elizaos/plugin-personality", () => ({ default: {} }));
vi.mock("@elizaos/plugin-plugin-manager", () => ({ default: {} }));
vi.mock("@elizaos/plugin-secrets-manager", () => ({ default: {} }));
vi.mock("@elizaos/plugin-shell", () => ({ default: {} }));
vi.mock("@elizaos/plugin-telegram", () => ({ default: {} }));
vi.mock("@elizaos-plugins/client-telegram-account", () => ({ default: {} }));
vi.mock("@elizaos/plugin-trust", () => ({ default: {} }));
vi.mock("@elizaos/plugin-twitch", () => ({ default: {} }));
vi.mock("@miladyai/plugin-wechat", () => ({ default: {} }));

import { CHANNEL_PLUGIN_MAP } from "../runtime/eliza";
import {
  type ApplyPluginAutoEnableParams,
  AUTH_PROVIDER_PLUGINS,
  applyPluginAutoEnable,
  CONNECTOR_PLUGINS,
  isStreamingDestinationConfigured,
  STREAMING_PLUGINS,
} from "./plugin-auto-enable";
import { CONNECTOR_IDS } from "./schema";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Build minimal ApplyPluginAutoEnableParams with defaults. */
function makeParams(
  overrides: Partial<ApplyPluginAutoEnableParams> = {},
): ApplyPluginAutoEnableParams {
  return {
    config: {},
    env: {},
    ...overrides,
  };
}

// ============================================================================
//  1. applyPluginAutoEnable — base behavior
// ============================================================================

describe("applyPluginAutoEnable", () => {
  it("returns unchanged config when plugins.enabled is false", () => {
    const params = makeParams({
      config: { plugins: { enabled: false } },
      env: { OPENAI_API_KEY: "sk-test" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(changes).toHaveLength(0);
    expect(config.plugins?.allow).toBeUndefined();
  });

  it("returns empty changes when no triggers are present", () => {
    const { changes } = applyPluginAutoEnable(makeParams());
    expect(changes).toHaveLength(0);
  });

  it("initializes plugins.allow array when absent", () => {
    const params = makeParams({ env: { OPENAI_API_KEY: "sk-test" } });
    const { config } = applyPluginAutoEnable(params);

    expect(Array.isArray(config.plugins?.allow)).toBe(true);
  });
});

// ============================================================================
//  2. Channel auto-enable
// ============================================================================

describe("applyPluginAutoEnable — connectors", () => {
  it("enables plugin for a connector with a botToken", () => {
    const params = makeParams({
      config: {
        connectors: {
          telegram: { botToken: "123:ABC" },
        },
      },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-telegram");
    expect(changes.some((c) => c.includes("telegram"))).toBe(true);
  });

  it("skips connector when explicitly disabled", () => {
    const params = makeParams({
      config: {
        connectors: {
          discord: { enabled: false, botToken: "abc" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-discord",
    );
  });

  it("skips connector without authentication credentials", () => {
    const params = makeParams({
      config: {
        connectors: {
          slack: { someOtherField: "value" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("@elizaos/plugin-slack");
  });

  it("enables imessage when cliPath is set", () => {
    const params = makeParams({
      config: {
        connectors: {
          imessage: { cliPath: "/usr/local/bin/imessage" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-imessage");
  });

  it("enables signal when account is set", () => {
    const params = makeParams({
      config: {
        connectors: {
          signal: { account: "+15551234567" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-signal");
  });

  it("enables signal when any enabled account entry is configured", () => {
    const params = makeParams({
      config: {
        connectors: {
          signal: {
            accounts: {
              primary: { enabled: true, cliPath: "/usr/local/bin/signal-cli" },
              disabled: { enabled: false, account: "+15550000000" },
            },
          },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-signal");
  });

  it("supports legacy channels key for backward compat", () => {
    const params = makeParams({
      config: {
        channels: {
          telegram: { botToken: "legacy-tok" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-telegram");
  });

  it("enables wechat plugin when apiKey is configured", () => {
    const params = makeParams({
      config: {
        connectors: {
          wechat: { apiKey: "key" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);
    expect(config.plugins?.allow).toContain("@miladyai/plugin-wechat");
  });

  it("does not enable wechat when disabled", () => {
    const params = makeParams({
      config: {
        connectors: {
          wechat: { enabled: false, apiKey: "key" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);
    expect(config.plugins?.allow ?? []).not.toContain(
      "@miladyai/plugin-wechat",
    );
  });
});

// ============================================================================
//  3. Auth profile auto-enable
// ============================================================================

describe("applyPluginAutoEnable — auth profiles", () => {
  it("enables plugin for an auth profile with matching provider", () => {
    const params = makeParams({
      config: {
        auth: {
          profiles: {
            main: { provider: "openai", mode: "api_key" as const },
          },
        },
      },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-openai");
    expect(changes.some((c) => c.includes("auth profile"))).toBe(true);
  });

  it("skips auth profile with unrecognized provider", () => {
    const params = makeParams({
      config: {
        auth: {
          profiles: {
            custom: { provider: "my-custom-llm", mode: "api_key" as const },
          },
        },
      },
    });
    const { changes } = applyPluginAutoEnable(params);

    expect(changes).toHaveLength(0);
  });
});

// ============================================================================
//  4. Env var auto-enable
// ============================================================================

describe("applyPluginAutoEnable — env vars", () => {
  it("enables plugin when its API key env var is set", () => {
    const params = makeParams({
      env: { ANTHROPIC_API_KEY: "sk-ant-test" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-anthropic");
    expect(changes.some((c) => c.includes("ANTHROPIC_API_KEY"))).toBe(true);
  });

  it("enables repoprompt plugin when REPOPROMPT_CLI_PATH is set", () => {
    const params = makeParams({
      env: { REPOPROMPT_CLI_PATH: "/usr/local/bin/rp-cli" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-repoprompt");
    expect(changes.some((c) => c.includes("REPOPROMPT_CLI_PATH"))).toBe(true);
  });

  it("enables telegramAccount client plugin when Telegram account env vars are set", () => {
    const params = makeParams({
      env: {
        TELEGRAM_ACCOUNT_PHONE: "+15551234567",
        TELEGRAM_ACCOUNT_APP_ID: "12345",
        TELEGRAM_ACCOUNT_APP_HASH: "hash",
        TELEGRAM_ACCOUNT_DEVICE_MODEL: "Desktop",
        TELEGRAM_ACCOUNT_SYSTEM_VERSION: "1.0",
      },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain(
      "@elizaos-plugins/client-telegram-account",
    );
    expect(changes.some((c) => c.includes("TELEGRAM_ACCOUNT_*"))).toBe(true);
  });

  it("enables claude code workbench plugin when CLAUDE_CODE_WORKBENCH_ENABLED is set", () => {
    const params = makeParams({
      env: { CLAUDE_CODE_WORKBENCH_ENABLED: "1" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain(
      "@elizaos/plugin-claude-code-workbench",
    );
    expect(
      changes.some((c) => c.includes("CLAUDE_CODE_WORKBENCH_ENABLED")),
    ).toBe(true);
  });

  it("skips env var with empty string value", () => {
    const params = makeParams({ env: { OPENAI_API_KEY: "" } });
    const { changes } = applyPluginAutoEnable(params);

    expect(changes).toHaveLength(0);
  });

  it("skips env var with whitespace-only value", () => {
    const params = makeParams({ env: { OPENAI_API_KEY: "   " } });
    const { changes } = applyPluginAutoEnable(params);

    expect(changes).toHaveLength(0);
  });

  it("does not enable telegramAccount when the config entry is disabled", () => {
    const params = makeParams({
      config: {
        plugins: {
          entries: {
            telegramAccount: { enabled: false },
          },
        },
      },
      env: {
        TELEGRAM_ACCOUNT_PHONE: "+15551234567",
        TELEGRAM_ACCOUNT_APP_ID: "12345",
        TELEGRAM_ACCOUNT_APP_HASH: "hash",
        TELEGRAM_ACCOUNT_DEVICE_MODEL: "Desktop",
        TELEGRAM_ACCOUNT_SYSTEM_VERSION: "1.0",
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain(
      "@elizaos-plugins/client-telegram-account",
    );
  });

  it("respects plugin entry enabled=false override", () => {
    const params = makeParams({
      config: {
        plugins: { entries: { anthropic: { enabled: false } } },
      },
      env: { ANTHROPIC_API_KEY: "sk-ant-test" },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-anthropic",
    );
  });

  it("handles multiple env vars enabling different plugins", () => {
    const params = makeParams({
      env: {
        OPENAI_API_KEY: "sk-test",
        GROQ_API_KEY: "gsk-test",
        XAI_API_KEY: "xai-test",
      },
    });
    const { config } = applyPluginAutoEnable(params);
    const allow = config.plugins?.allow ?? [];

    expect(allow).toContain("@elizaos/plugin-openai");
    expect(allow).toContain("@elizaos/plugin-groq");
    expect(allow).toContain("@elizaos/plugin-xai");
  });

  it("auto-enables obsidian plugin when OBSIDIAN_VAULT_PATH is set", () => {
    const params = makeParams({
      env: { OBSIDIAN_VAULT_PATH: "/tmp/vault" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-obsidian");
    expect(changes.some((c) => c.includes("OBSIDIAN_VAULT_PATH"))).toBe(true);
  });

  it("does not duplicate entries in allow list", () => {
    const params = makeParams({
      env: {
        ANTHROPIC_API_KEY: "key1",
        CLAUDE_API_KEY: "key2",
      },
    });
    const { config } = applyPluginAutoEnable(params);
    const allow = config.plugins?.allow ?? [];

    const anthropicEntries = allow.filter(
      (p) => p === "@elizaos/plugin-anthropic",
    );
    expect(anthropicEntries).toHaveLength(1);
  });

  it("auto-enables cua plugin when CUA_API_KEY is set", () => {
    const params = makeParams({
      env: { CUA_API_KEY: "cua-key" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-cua");
    expect(changes.some((c) => c.includes("CUA_API_KEY"))).toBe(true);
  });

  it("auto-enables cua plugin when CUA_HOST is set", () => {
    const params = makeParams({
      env: { CUA_HOST: "https://cua.example" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-cua");
    expect(changes.some((c) => c.includes("CUA_HOST"))).toBe(true);
  });

  it("respects cua enabled=false override for env auto-enable", () => {
    const params = makeParams({
      config: {
        plugins: { entries: { cua: { enabled: false } } },
      },
      env: { CUA_API_KEY: "cua-key" },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("@elizaos/plugin-cua");
  });

  it("respects x402 enabled=false override for env auto-enable", () => {
    const params = makeParams({
      config: {
        plugins: { entries: { x402: { enabled: false } } },
      },
      env: { X402_API_KEY: "x402-key" },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("@elizaos/plugin-x402");
  });

  it("does not duplicate cua when both CUA_API_KEY and CUA_HOST are set", () => {
    const params = makeParams({
      env: { CUA_API_KEY: "cua-key", CUA_HOST: "https://cua.example" },
    });
    const { config } = applyPluginAutoEnable(params);
    const allow = config.plugins?.allow ?? [];

    const cuaEntries = allow.filter((p) => p === "@elizaos/plugin-cua");
    expect(cuaEntries).toHaveLength(1);
  });

  it("auto-enables steward plugin when STEWARD_API_URL is set", () => {
    const params = makeParams({
      env: { STEWARD_API_URL: "https://steward.example" },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@stwd/eliza-plugin");
  });
});

// ============================================================================
//  5. Feature flag auto-enable
// ============================================================================

describe("applyPluginAutoEnable — features", () => {
  it("enables plugin when feature is set to true", () => {
    const params = makeParams({
      config: { features: { browser: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-browser");
    expect(changes.some((c) => c.includes("feature: browser"))).toBe(true);
  });

  it("enables repoprompt plugin when feature flag is enabled", () => {
    const params = makeParams({
      config: { features: { repoprompt: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-repoprompt");
    expect(changes.some((c) => c.includes("feature: repoprompt"))).toBe(true);
  });

  it("enables claude code workbench plugin when feature flag is enabled", () => {
    const params = makeParams({
      config: { features: { claudeCodeWorkbench: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain(
      "@elizaos/plugin-claude-code-workbench",
    );
    expect(
      changes.some((c) => c.includes("feature: claudeCodeWorkbench")),
    ).toBe(true);
  });

  it("enables plugin when feature is an object with enabled not false", () => {
    const params = makeParams({
      config: { features: { cron: { schedule: "* * * * *" } } },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-cron");
  });

  it("skips feature when enabled is explicitly false", () => {
    const params = makeParams({
      config: { features: { shell: { enabled: false } } },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("shell");
  });

  it("skips unrecognized feature names", () => {
    const params = makeParams({
      config: { features: { customFeature: true } },
    });
    const { changes } = applyPluginAutoEnable(params);

    expect(changes).toHaveLength(0);
  });

  it("enables obsidian plugin when features.obsidian = true", () => {
    const params = makeParams({
      config: { features: { obsidian: true } },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-obsidian");
  });

  it("enables x402 plugin when features.x402 = true", () => {
    const params = makeParams({
      config: { features: { x402: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-x402");
    expect(changes.some((c) => c.includes("feature: x402"))).toBe(true);
  });

  it("enables cua plugin when features.cua = true", () => {
    const params = makeParams({
      config: { features: { cua: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-cua");
    expect(changes.some((c) => c.includes("feature: cua"))).toBe(true);
  });

  it("skips x402 feature when features.x402.enabled is explicitly false", () => {
    const params = makeParams({
      config: { features: { x402: { enabled: false } } },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("@elizaos/plugin-x402");
  });

  it("enables computeruse plugin when features.computeruse = true", () => {
    const params = makeParams({
      config: { features: { computeruse: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-computeruse");
    expect(changes.some((c) => c.includes("feature: computeruse"))).toBe(true);
  });
});

// ============================================================================
//  6. Hooks auto-enable
// ============================================================================

describe("applyPluginAutoEnable — hooks", () => {
  it("enables webhooks plugin when hooks.token is set", () => {
    const params = makeParams({
      config: { hooks: { token: "whk-secret" } as Record<string, unknown> },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-webhooks");
  });

  it("skips webhooks when hooks.enabled is false", () => {
    const params = makeParams({
      config: {
        hooks: { enabled: false, token: "whk-secret" } as Record<
          string,
          unknown
        >,
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-webhooks",
    );
  });

  it("enables gmail-watch plugin when hooks.gmail.account is set", () => {
    const params = makeParams({
      config: {
        hooks: { gmail: { account: "user@gmail.com" } } as Record<
          string,
          unknown
        >,
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-gmail-watch");
  });
});

// ============================================================================
//  7. Subscription provider auto-enable
// ============================================================================

describe("applyPluginAutoEnable — subscription provider", () => {
  it("does NOT force-enable anthropic plugin for anthropic-subscription (TOS: task agents only)", () => {
    const params = makeParams({
      config: {
        agents: {
          defaults: { subscriptionProvider: "anthropic-subscription" },
        },
      },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    // Anthropic subscription tokens are restricted to Claude Code CLI.
    // The plugin must NOT be force-enabled from subscription alone.
    expect(config.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-anthropic",
    );
    expect(changes.every((c) => !c.includes("subscription"))).toBe(true);
  });

  it("force-enables openai plugin when subscriptionProvider is openai-codex", () => {
    const params = makeParams({
      config: {
        agents: { defaults: { subscriptionProvider: "openai-codex" } },
      },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@elizaos/plugin-openai");
    expect(changes.some((c) => c.includes("subscription"))).toBe(true);
  });

  it("does NOT override enabled=false for anthropic subscription (TOS: task agents only)", () => {
    const params = makeParams({
      config: {
        plugins: { entries: { anthropic: { enabled: false } } },
        agents: {
          defaults: { subscriptionProvider: "anthropic-subscription" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    // Anthropic subscription cannot enable the plugin — TOS restriction.
    expect(config.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-anthropic",
    );
    expect(config.plugins?.entries?.anthropic?.enabled).toBe(false);
  });

  it("does nothing when subscriptionProvider is not set", () => {
    const params = makeParams({
      config: { agents: { defaults: {} } },
    });
    const { changes } = applyPluginAutoEnable(params);

    expect(changes.every((c) => !c.includes("subscription"))).toBe(true);
  });
});

// ============================================================================
//  8. Mapping constants
// ============================================================================

describe("CONNECTOR_PLUGINS", () => {
  it("maps telegram to @elizaos/plugin-telegram", () => {
    expect(CONNECTOR_PLUGINS.telegram).toBe("@elizaos/plugin-telegram");
  });

  it("maps discord to @elizaos/plugin-discord", () => {
    expect(CONNECTOR_PLUGINS.discord).toBe("@elizaos/plugin-discord");
  });

  it("contains 21 connector mappings", () => {
    expect(Object.keys(CONNECTOR_PLUGINS)).toHaveLength(21);
  });

  it("has keys matching CONNECTOR_IDS from schema", () => {
    expect([...Object.keys(CONNECTOR_PLUGINS)].sort()).toEqual(
      [...CONNECTOR_IDS].sort(),
    );
  });

  it("CONNECTOR_PLUGINS values match CHANNEL_PLUGIN_MAP for every connector", () => {
    for (const id of Object.keys(CONNECTOR_PLUGINS)) {
      expect(CONNECTOR_PLUGINS[id]).toBe(CHANNEL_PLUGIN_MAP[id]);
    }
  });

  it("maps blooio to @elizaos/plugin-blooio", () => {
    expect(CONNECTOR_PLUGINS.blooio).toBe("@elizaos/plugin-blooio");
  });
});

describe("AUTH_PROVIDER_PLUGINS", () => {
  it("maps OPENAI_API_KEY to openai plugin", () => {
    expect(AUTH_PROVIDER_PLUGINS.OPENAI_API_KEY).toBe("@elizaos/plugin-openai");
  });

  it("maps both ANTHROPIC_API_KEY and CLAUDE_API_KEY to anthropic plugin", () => {
    expect(AUTH_PROVIDER_PLUGINS.ANTHROPIC_API_KEY).toBe(
      "@elizaos/plugin-anthropic",
    );
    expect(AUTH_PROVIDER_PLUGINS.CLAUDE_API_KEY).toBe(
      "@elizaos/plugin-anthropic",
    );
  });

  it("maps OBSIDIAN_VAULT_PATH and OBSIDAN_VAULT_PATH to obsidian plugin", () => {
    expect(AUTH_PROVIDER_PLUGINS.OBSIDIAN_VAULT_PATH).toBe(
      "@elizaos/plugin-obsidian",
    );
    expect(AUTH_PROVIDER_PLUGINS.OBSIDAN_VAULT_PATH).toBe(
      "@elizaos/plugin-obsidian",
    );
  });

  it("maps CUA env keys to cua plugin", () => {
    expect(AUTH_PROVIDER_PLUGINS.CUA_API_KEY).toBe("@elizaos/plugin-cua");
    expect(AUTH_PROVIDER_PLUGINS.CUA_HOST).toBe("@elizaos/plugin-cua");
  });

  it("maps both pi-ai env aliases to the pi-ai plugin", () => {
    expect(AUTH_PROVIDER_PLUGINS.ELIZA_USE_PI_AI).toBe("@elizaos/plugin-pi-ai");
    expect(AUTH_PROVIDER_PLUGINS.MILADY_USE_PI_AI).toBe(
      "@elizaos/plugin-pi-ai",
    );
  });
});

// ============================================================================
//  WhatsApp connector auto-enable — Baileys auth fields
// ============================================================================

describe("WhatsApp connector auto-enable", () => {
  it("auto-enables via legacy authState field", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: { connectors: { whatsapp: { authState: "./auth" } } },
      }),
    );
    expect(config.plugins?.allow).toContain("@elizaos/plugin-whatsapp");
  });

  it("auto-enables via legacy sessionPath field", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: { connectors: { whatsapp: { sessionPath: "./auth" } } },
      }),
    );
    expect(config.plugins?.allow).toContain("@elizaos/plugin-whatsapp");
  });

  it("auto-enables via authDir (Baileys WhatsAppAccountSchema field)", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: { connectors: { whatsapp: { authDir: "./auth/whatsapp" } } },
      }),
    );
    expect(config.plugins?.allow).toContain("@elizaos/plugin-whatsapp");
  });

  it("auto-enables when accounts object is configured", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          connectors: {
            whatsapp: {
              accounts: { default: { enabled: true, authDir: "./auth" } },
            },
          },
        },
      }),
    );
    expect(config.plugins?.allow).toContain("@elizaos/plugin-whatsapp");
  });

  it("does not auto-enable when whatsapp config is empty", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({ config: { connectors: { whatsapp: {} } } }),
    );
    expect(config.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-whatsapp",
    );
  });

  it("does not auto-enable when accounts object has no valid authDir", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          connectors: {
            whatsapp: { accounts: { default: {} } },
          },
        },
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-whatsapp",
    );
  });

  it("does not auto-enable when all accounts are explicitly disabled", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          connectors: {
            whatsapp: {
              accounts: { main: { enabled: false, authDir: "./auth" } },
            },
          },
        },
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-whatsapp",
    );
  });

  it("does not auto-enable when enabled is explicitly false", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          connectors: {
            whatsapp: { enabled: false, authDir: "./auth/whatsapp" },
          },
        },
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-whatsapp",
    );
  });
});

describe("Blooio connector auto-enable", () => {
  it("auto-enables when apiKey is set", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: { connectors: { blooio: { apiKey: "blk-test-key" } } },
      }),
    );
    expect(config.plugins?.allow).toContain("@elizaos/plugin-blooio");
  });

  it("does not auto-enable when config is empty", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: { connectors: { blooio: {} } },
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain("@elizaos/plugin-blooio");
  });

  it("does not auto-enable when enabled is explicitly false", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          connectors: {
            blooio: { enabled: false, apiKey: "blk-test-key" },
          },
        },
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain("@elizaos/plugin-blooio");
  });
});

// ============================================================================
//  Streaming destination auto-enable
// ============================================================================

describe("STREAMING_PLUGINS mapping", () => {
  it("maps known streaming destinations to plugin packages", () => {
    expect(STREAMING_PLUGINS.twitch).toBe("@elizaos/plugin-twitch-streaming");
    expect(STREAMING_PLUGINS.youtube).toBe("@elizaos/plugin-youtube-streaming");
    expect(STREAMING_PLUGINS.customRtmp).toBe("@elizaos/plugin-custom-rtmp");
  });
});

describe("isStreamingDestinationConfigured", () => {
  it("returns false for null/undefined config", () => {
    expect(isStreamingDestinationConfigured("twitch", null)).toBe(false);
    expect(isStreamingDestinationConfigured("twitch", undefined)).toBe(false);
  });

  it("returns false for non-object config", () => {
    expect(isStreamingDestinationConfigured("twitch", "string")).toBe(false);
    expect(isStreamingDestinationConfigured("twitch", 42)).toBe(false);
  });

  it("returns false when enabled is explicitly false", () => {
    expect(
      isStreamingDestinationConfigured("twitch", {
        enabled: false,
        streamKey: "sk",
      }),
    ).toBe(false);
  });

  it("detects twitch via streamKey", () => {
    expect(
      isStreamingDestinationConfigured("twitch", { streamKey: "live_abc" }),
    ).toBe(true);
  });

  it("detects youtube via streamKey", () => {
    expect(
      isStreamingDestinationConfigured("youtube", { streamKey: "xxxx-xxxx" }),
    ).toBe(true);
  });

  it("detects customRtmp when both rtmpUrl and rtmpKey are present", () => {
    expect(
      isStreamingDestinationConfigured("customRtmp", {
        rtmpUrl: "rtmp://example.com/live",
        rtmpKey: "key123",
      }),
    ).toBe(true);
  });

  it("rejects customRtmp when only rtmpUrl is present (missing rtmpKey)", () => {
    expect(
      isStreamingDestinationConfigured("customRtmp", {
        rtmpUrl: "rtmp://example.com/live",
      }),
    ).toBe(false);
  });

  it("rejects customRtmp when only rtmpKey is present (missing rtmpUrl)", () => {
    expect(
      isStreamingDestinationConfigured("customRtmp", { rtmpKey: "key123" }),
    ).toBe(false);
  });

  it("returns false for unknown destination names", () => {
    expect(
      isStreamingDestinationConfigured("unknown", { streamKey: "sk" }),
    ).toBe(false);
  });
});

describe("applyPluginAutoEnable — streaming destinations", () => {
  it("auto-enables twitch-streaming plugin when twitch streamKey is set", () => {
    const { config, changes } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: { twitch: { streamKey: "live_abc" } },
        } as never,
      }),
    );
    expect(config.plugins?.allow).toContain("@elizaos/plugin-twitch-streaming");
    expect(changes.some((c) => c.includes("streaming: twitch"))).toBe(true);
  });

  it("auto-enables youtube-streaming plugin when youtube streamKey is set", () => {
    const { config, changes } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: { youtube: { streamKey: "xxxx-xxxx" } },
        } as never,
      }),
    );
    expect(config.plugins?.allow).toContain(
      "@elizaos/plugin-youtube-streaming",
    );
    expect(changes.some((c) => c.includes("streaming: youtube"))).toBe(true);
  });

  it("auto-enables custom-rtmp plugin when customRtmp has rtmpUrl and rtmpKey", () => {
    const { config, changes } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: {
            customRtmp: {
              rtmpUrl: "rtmp://example.com/live",
              rtmpKey: "key123",
            },
          },
        } as never,
      }),
    );
    expect(config.plugins?.allow).toContain("@elizaos/plugin-custom-rtmp");
    expect(changes.some((c) => c.includes("streaming: customRtmp"))).toBe(true);
  });

  it("skips activeDestination meta field", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: {
            activeDestination: "twitch",
            twitch: { streamKey: "live_abc" },
          },
        } as never,
      }),
    );
    // activeDestination should not result in any plugin — only twitch should be added
    const allow = config.plugins?.allow ?? [];
    expect(allow).toContain("@elizaos/plugin-twitch-streaming");
    expect(allow).not.toContain("activeDestination");
  });

  it("does not auto-enable streaming plugin when enabled is explicitly false", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: { twitch: { enabled: false, streamKey: "live_abc" } },
        } as never,
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-twitch-streaming",
    );
  });

  it("does not auto-enable streaming plugin when shortId is disabled in plugins.entries", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: { twitch: { streamKey: "live_abc" } },
          plugins: { entries: { "twitch-streaming": { enabled: false } } },
        } as never,
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-twitch-streaming",
    );
  });

  it("does not auto-enable when streaming config is empty", () => {
    const { changes } = applyPluginAutoEnable(
      makeParams({
        config: { streaming: {} } as never,
      }),
    );
    expect(changes.filter((c) => c.includes("streaming:"))).toHaveLength(0);
  });

  it("enables multiple streaming plugins simultaneously", () => {
    const { config, changes } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: {
            twitch: { streamKey: "live_abc" },
            youtube: { streamKey: "xxxx-xxxx" },
          },
        } as never,
      }),
    );
    const allow = config.plugins?.allow ?? [];
    expect(allow).toContain("@elizaos/plugin-twitch-streaming");
    expect(allow).toContain("@elizaos/plugin-youtube-streaming");
    expect(changes.length).toBeGreaterThanOrEqual(2);
  });
});
