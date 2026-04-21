/**
 * Discord Cloud Provisioning Simulation Tests
 *
 * Simulates what happens when a cloud container starts with or without
 * DISCORD_API_TOKEN. Validates the full chain: env var → connector env
 * collection → plugin auto-enable → plugin validation.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectConnectorEnvVars,
  CONNECTOR_ENV_MAP,
} from "../src/config/env-vars";
import {
  applyPluginAutoEnable,
  CONNECTOR_PLUGINS,
  isConnectorConfigured,
} from "../src/config/plugin-auto-enable";
import {
  validatePluginConfig,
  type PluginParamInfo,
} from "../src/api/plugin-validation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {
    DISCORD_API_TOKEN: process.env.DISCORD_API_TOKEN,
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,
    MILADY_CLOUD_PROVISIONED: process.env.MILADY_CLOUD_PROVISIONED,
    ELIZA_CLOUD_PROVISIONED: process.env.ELIZA_CLOUD_PROVISIONED,
  };
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

// ---------------------------------------------------------------------------
// 1. Cloud container starts with DISCORD_API_TOKEN
// ---------------------------------------------------------------------------

describe("cloud container with DISCORD_API_TOKEN", () => {
  it("connector env vars are collected from config with bot token", () => {
    // Step 1: Cloud provisioning wrote the token into the agent config
    const config = {
      connectors: {
        discord: {
          botToken: "cloud-bot-token-abc123",
          applicationId: "123456789",
        },
      },
    };

    const envVars = collectConnectorEnvVars(config as any);
    expect(envVars.DISCORD_API_TOKEN).toBe("cloud-bot-token-abc123");
    expect(envVars.DISCORD_BOT_TOKEN).toBe("cloud-bot-token-abc123");
    expect(envVars.DISCORD_APPLICATION_ID).toBe("123456789");
  });

  it("discord plugin auto-enables when token is present in config", () => {
    const config = {
      plugins: {},
      connectors: {
        discord: { botToken: "cloud-token" },
      },
    };

    const { config: updatedConfig, changes } = applyPluginAutoEnable({
      config,
      env: {},
    });

    // Discord plugin should be in the allow list
    expect(updatedConfig.plugins?.allow).toContain("@elizaos/plugin-discord");
    expect(changes.some((c) => c.includes("discord"))).toBe(true);
  });

  it("edge-tts auto-enables alongside discord in cloud-provisioned containers", () => {
    const config = {
      plugins: {},
      connectors: {
        discord: { botToken: "cloud-token" },
      },
    };

    const { config: updatedConfig } = applyPluginAutoEnable({
      config,
      env: { MILADY_CLOUD_PROVISIONED: "1" },
    });

    expect(updatedConfig.plugins?.allow).toContain("@elizaos/plugin-discord");
    expect(updatedConfig.plugins?.allow).toContain("@elizaos/plugin-edge-tts");
  });

  it("ELIZA_CLOUD_PROVISIONED also auto-enables edge-tts", () => {
    const config = { plugins: {}, connectors: {} };

    const { config: updatedConfig } = applyPluginAutoEnable({
      config,
      env: { ELIZA_CLOUD_PROVISIONED: "1" },
    });

    expect(updatedConfig.plugins?.allow).toContain("@elizaos/plugin-edge-tts");
  });

  it("token format validation warns on suspiciously short tokens", () => {
    // Discord bot tokens are typically 59+ chars; a 5-char value is suspicious
    const discordParams: PluginParamInfo[] = [
      {
        key: "DISCORD_API_TOKEN",
        required: true,
        sensitive: true,
        type: "string",
        description: "Discord bot token",
      },
    ];

    const result = validatePluginConfig(
      "discord",
      "connector",
      "DISCORD_API_TOKEN",
      ["DISCORD_API_TOKEN"],
      { DISCORD_API_TOKEN: "short" },
      discordParams,
    );

    // Should be valid (no errors) but have a warning about length
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.message.includes("too short"))).toBe(
      true,
    );
  });

  it("missing required token produces validation error", () => {
    const discordParams: PluginParamInfo[] = [
      {
        key: "DISCORD_API_TOKEN",
        required: true,
        sensitive: true,
        type: "string",
        description: "Discord bot token",
      },
    ];

    // No token provided at all
    const result = validatePluginConfig(
      "discord",
      "connector",
      "DISCORD_API_TOKEN",
      ["DISCORD_API_TOKEN"],
      {},
      discordParams,
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "DISCORD_API_TOKEN")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Cloud container starts WITHOUT discord token
// ---------------------------------------------------------------------------

describe("cloud container without discord token", () => {
  it("discord plugin does NOT auto-enable without token", () => {
    const config = {
      plugins: {},
      connectors: {
        discord: {},
      },
    };

    const { config: updatedConfig, changes } = applyPluginAutoEnable({
      config,
      env: {},
    });

    expect(updatedConfig.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-discord",
    );
    expect(changes.some((c) => c.includes("discord"))).toBe(false);
  });

  it("empty connector config does not cause errors", () => {
    const config = {
      plugins: {},
      connectors: {},
    };

    const { config: updatedConfig, changes } = applyPluginAutoEnable({
      config,
      env: { MILADY_CLOUD_PROVISIONED: "1" },
    });

    // Cloud provisioning alone should only add the voice plugin, not discord.
    expect(updatedConfig.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-discord",
    );
    expect(updatedConfig.plugins?.allow).toContain("@elizaos/plugin-edge-tts");
  });

  it("isConnectorConfigured returns false for empty discord config", () => {
    expect(isConnectorConfigured("discord", {})).toBe(false);
  });

  it("isConnectorConfigured returns false for null config", () => {
    expect(isConnectorConfigured("discord", null)).toBe(false);
  });

  it("isConnectorConfigured returns false for undefined config", () => {
    expect(isConnectorConfigured("discord", undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Discord does NOT auto-enable when enabled: false
// ---------------------------------------------------------------------------

describe("discord explicit disable", () => {
  it("does not auto-enable when enabled: false on connector", () => {
    const config = {
      plugins: {},
      connectors: {
        discord: { botToken: "valid-token", enabled: false },
      },
    };

    const { config: updatedConfig } = applyPluginAutoEnable({
      config,
      env: {},
    });

    expect(updatedConfig.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-discord",
    );
  });

  it("does not auto-enable when plugin entry disabled", () => {
    const config = {
      plugins: {
        entries: {
          discord: { enabled: false },
        },
      },
      connectors: {
        discord: { botToken: "valid-token" },
      },
    };

    const { config: updatedConfig } = applyPluginAutoEnable({
      config,
      env: {},
    });

    expect(updatedConfig.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-discord",
    );
  });

  it("does not auto-enable when plugins.enabled is false globally", () => {
    const config = {
      plugins: { enabled: false },
      connectors: {
        discord: { botToken: "valid-token" },
      },
    };

    const { config: updatedConfig } = applyPluginAutoEnable({
      config,
      env: {},
    });

    // When plugins.enabled is false, no plugins should be auto-enabled
    expect(updatedConfig.plugins?.allow).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Token alias resolution
// ---------------------------------------------------------------------------

describe("discord token alias resolution", () => {
  it("DISCORD_BOT_TOKEN alias resolves correctly via env var mirroring", () => {
    // When config has botToken, both DISCORD_API_TOKEN and DISCORD_BOT_TOKEN
    // should be set to the same value
    const envVars = collectConnectorEnvVars({
      connectors: {
        discord: { botToken: "aliased-token" },
      },
    } as any);

    expect(envVars.DISCORD_API_TOKEN).toBe("aliased-token");
    expect(envVars.DISCORD_BOT_TOKEN).toBe("aliased-token");
  });

  it("token field and botToken field produce the same env vars", () => {
    const fromToken = collectConnectorEnvVars({
      connectors: { discord: { token: "shared-token" } },
    } as any);

    const fromBotToken = collectConnectorEnvVars({
      connectors: { discord: { botToken: "shared-token" } },
    } as any);

    expect(fromToken.DISCORD_API_TOKEN).toBe(fromBotToken.DISCORD_API_TOKEN);
    expect(fromToken.DISCORD_BOT_TOKEN).toBe(fromBotToken.DISCORD_BOT_TOKEN);
  });
});

// ---------------------------------------------------------------------------
// 5. Full provisioning simulation
// ---------------------------------------------------------------------------

describe("full cloud provisioning simulation", () => {
  it("simulates complete cloud container startup with discord", () => {
    // This test simulates the full chain that happens when a cloud container
    // starts with a Discord bot token:
    //
    // 1. Cloud provisioning writes config with discord.botToken
    // 2. collectConnectorEnvVars extracts env vars
    // 3. applyPluginAutoEnable enables the discord plugin
    // 4. validatePluginConfig confirms the config is valid

    const agentConfig = {
      plugins: {},
      connectors: {
        discord: {
          botToken: "MTA5MDg1NjEwMzM3OTk2OTAyNA.GDtdBH.valid-token-format",
          applicationId: "1090856103379969024",
        },
      },
    };

    // Step 1: Collect env vars
    const envVars = collectConnectorEnvVars(agentConfig as any);
    expect(envVars.DISCORD_API_TOKEN).toBeTruthy();
    expect(envVars.DISCORD_APPLICATION_ID).toBeTruthy();

    // Step 2: Auto-enable plugins
    const { config: enabledConfig, changes } = applyPluginAutoEnable({
      config: agentConfig,
      env: { MILADY_CLOUD_PROVISIONED: "1" },
    });
    expect(enabledConfig.plugins?.allow).toContain("@elizaos/plugin-discord");
    expect(enabledConfig.plugins?.allow).toContain("@elizaos/plugin-edge-tts");

    // Step 3: Validate config
    const discordParams: PluginParamInfo[] = [
      {
        key: "DISCORD_API_TOKEN",
        required: true,
        sensitive: true,
        type: "string",
        description: "Discord bot token",
      },
    ];
    const validation = validatePluginConfig(
      "discord",
      "connector",
      "DISCORD_API_TOKEN",
      ["DISCORD_API_TOKEN", "DISCORD_APPLICATION_ID"],
      { DISCORD_API_TOKEN: envVars.DISCORD_API_TOKEN },
      discordParams,
    );
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("simulates cloud container startup without discord (other connector)", () => {
    // Container has Telegram but not Discord
    const agentConfig = {
      plugins: {},
      connectors: {
        telegram: { botToken: "123:ABC" },
      },
    };

    const { config: enabledConfig } = applyPluginAutoEnable({
      config: agentConfig,
      env: {},
    });

    expect(enabledConfig.plugins?.allow).toContain(
      "@elizaos/plugin-telegram",
    );
    expect(enabledConfig.plugins?.allow).not.toContain(
      "@elizaos/plugin-discord",
    );
  });

  it("CONNECTOR_PLUGINS maps discord to correct package", () => {
    // Regression guard: the package name must stay aligned
    expect(CONNECTOR_PLUGINS.discord).toBe("@elizaos/plugin-discord");
  });
});
