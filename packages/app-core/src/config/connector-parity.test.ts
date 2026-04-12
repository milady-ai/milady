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
  applyPluginAutoEnable,
  CONNECTOR_PLUGINS,
  isConnectorConfigured,
} from "./plugin-auto-enable";
import { CONNECTOR_IDS, MILADY_LOCAL_CONNECTOR_IDS } from "./schema";
import { CONNECTOR_PLUGIN_MAP } from "../api/connector-health";
import { collectConnectorEnvVars } from "./env-vars";

/** Connectors registered locally in Milady, not in upstream @miladyai/agent. */
const MILADY_LOCAL_CONNECTORS = new Set<string>(MILADY_LOCAL_CONNECTOR_IDS);

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

describe("connector map parity", () => {
  it("keeps connector IDs aligned across schema, runtime, and auto-enable", () => {
    const autoEnableIds = sorted(Object.keys(CONNECTOR_PLUGINS));
    const runtimeIds = sorted(Object.keys(CHANNEL_PLUGIN_MAP));
    const schemaIds = sorted(CONNECTOR_IDS);

    // All three maps should have the same connector IDs
    expect(runtimeIds).toEqual(autoEnableIds);
    expect(schemaIds).toEqual(autoEnableIds);
  });

  it("keeps runtime and auto-enable package mappings aligned", () => {
    for (const [connectorId, pluginName] of Object.entries(CONNECTOR_PLUGINS)) {
      expect(CHANNEL_PLUGIN_MAP[connectorId]).toBe(pluginName);
    }
  });

  it("keeps runtime-to-auto-enable package mappings aligned (reverse)", () => {
    for (const [connectorId, pluginName] of Object.entries(
      CHANNEL_PLUGIN_MAP,
    )) {
      expect(CONNECTOR_PLUGINS[connectorId]).toBe(pluginName);
    }
  });

  it("has no duplicate IDs in the CONNECTOR_IDS schema array", () => {
    const unique = new Set(CONNECTOR_IDS);
    expect(unique.size).toBe(CONNECTOR_IDS.length);
  });

  it("has identical count across all three maps", () => {
    const totalCount = Object.keys(CHANNEL_PLUGIN_MAP).length;
    expect(CONNECTOR_IDS).toHaveLength(totalCount);
    expect(Object.keys(CONNECTOR_PLUGINS)).toHaveLength(totalCount);
  });

  it("uses valid package name prefixes for all plugin mappings", () => {
    const validPrefix = /^@(elizaos|elizaos-plugins|elizaai|miladyai)\//;
    for (const pkg of Object.values(CONNECTOR_PLUGINS)) {
      expect(pkg).toMatch(validPrefix);
    }
    for (const pkg of Object.values(CHANNEL_PLUGIN_MAP)) {
      expect(pkg).toMatch(validPrefix);
    }
  });
});

// ── Runtime behaviour parity ────────────────────────────────────────────────
// Ensures isConnectorConfigured and applyPluginAutoEnable actually work for
// every connector in the map, not just the ones with dedicated unit tests.

/**
 * Minimal credential configs that satisfy isConnectorConfigured for each
 * connector. Connectors with connector-specific detection logic are given
 * their specific fields; others use the generic botToken/token/apiKey path.
 */
const CONNECTOR_CREDS: Record<string, Record<string, unknown>> = {
  telegram: { botToken: "123:ABC" },
  telegramAccount: {
    phone: "+15551234567",
    appId: "12345",
    appHash: "hash-123",
    deviceModel: "Milady Desktop",
    systemVersion: "macOS 15",
  },
  bluebubbles: { serverUrl: "http://localhost:1234", password: "bb-pass" },
  discord: { botToken: "discord-token" },
  discordLocal: { clientId: "disc-client", clientSecret: "disc-secret" },
  slack: { token: "xoxb-slack" },
  twitter: { apiKey: "tw-key" },
  whatsapp: { authDir: "./auth/whatsapp" },
  signal: { account: "+15551234567" },
  imessage: { cliPath: "/usr/local/bin/imessage" },
  farcaster: { apiKey: "fc-key" },
  lens: { apiKey: "lens-key" },
  msteams: { botToken: "teams-token" },
  mattermost: { token: "mm-token" },
  googlechat: { token: "gc-token" },
  feishu: { token: "fs-token" },
  matrix: { token: "matrix-token" },
  nostr: { apiKey: "nostr-key" },
  blooio: { apiKey: "blk-key" },
  twitch: { accessToken: "twitch-token" },
  wechat: { apiKey: "key" },
};

describe("connector runtime parity", () => {
  it("has credential fixtures for every CONNECTOR_ID", () => {
    for (const id of CONNECTOR_IDS) {
      expect(CONNECTOR_CREDS[id]).toBeDefined();
    }
  });

  it.each([
    ...CONNECTOR_IDS,
  ])("isConnectorConfigured recognises %s with valid credentials", (connectorId) => {
    expect(
      isConnectorConfigured(connectorId, CONNECTOR_CREDS[connectorId]),
    ).toBe(true);
  });

  it.each([
    ...CONNECTOR_IDS,
  ])("isConnectorConfigured rejects %s with empty config", (connectorId) => {
    expect(isConnectorConfigured(connectorId, {})).toBe(false);
  });

  it.each([
    ...CONNECTOR_IDS,
  ])("isConnectorConfigured rejects %s when explicitly disabled", (connectorId) => {
    expect(
      isConnectorConfigured(connectorId, {
        ...CONNECTOR_CREDS[connectorId],
        enabled: false,
      }),
    ).toBe(false);
  });

  it("applyPluginAutoEnable enables all connectors when configured", () => {
    const connectors: Record<string, Record<string, unknown>> = {};
    for (const id of CONNECTOR_IDS) {
      connectors[id] = CONNECTOR_CREDS[id];
    }
    const { config, changes } = applyPluginAutoEnable({
      config: { plugins: {}, connectors },
      env: {},
    });
    const allow = config.plugins?.allow ?? [];
    for (const id of CONNECTOR_IDS) {
      const expectedPkg = CONNECTOR_PLUGINS[id];
      expect(allow).toContain(expectedPkg);
    }
    const expectedChangeCount =
      CONNECTOR_IDS.length - MILADY_LOCAL_CONNECTORS.size;
    // Milady-local connectors are injected before the upstream helper runs.
    expect(changes).toHaveLength(expectedChangeCount);
  });
});

// ── Discord cloud parity scenarios ──────────────────────────────────────────

describe("discord cloud auto-enable scenarios", () => {
  it("discord auto-enables when DISCORD_API_TOKEN set in cloud container via config", () => {
    // Cloud containers inject the token into the connector config
    const { config } = applyPluginAutoEnable({
      config: {
        plugins: {},
        connectors: { discord: { botToken: "cloud-injected-token" } },
      },
      env: {},
    });
    expect(config.plugins?.allow).toContain("@elizaos/plugin-discord");
  });

  it("discord auto-enables with token field (alternative to botToken)", () => {
    const { config } = applyPluginAutoEnable({
      config: {
        plugins: {},
        connectors: { discord: { token: "direct-token" } },
      },
      env: {},
    });
    expect(config.plugins?.allow).toContain("@elizaos/plugin-discord");
  });

  it("discord does NOT auto-enable when token is missing", () => {
    const { config } = applyPluginAutoEnable({
      config: {
        plugins: {},
        connectors: { discord: {} },
      },
      env: {},
    });
    expect(config.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-discord",
    );
  });

  it("discord does NOT auto-enable when connector has enabled: false", () => {
    const { config } = applyPluginAutoEnable({
      config: {
        plugins: {},
        connectors: {
          discord: { botToken: "valid-token", enabled: false },
        },
      },
      env: {},
    });
    expect(config.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-discord",
    );
  });

  it("discord does NOT auto-enable when plugin entry is disabled", () => {
    const { config } = applyPluginAutoEnable({
      config: {
        plugins: {
          entries: { discord: { enabled: false } },
        },
        connectors: { discord: { botToken: "valid-token" } },
      },
      env: {},
    });
    expect(config.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-discord",
    );
  });

  it("edge-tts auto-enables alongside discord in cloud mode", () => {
    const { config } = applyPluginAutoEnable({
      config: {
        plugins: {},
        connectors: { discord: { botToken: "cloud-token" } },
      },
      env: { MILADY_CLOUD_PROVISIONED: "1" },
    });
    expect(config.plugins?.allow).toContain("@elizaos/plugin-discord");
    expect(config.plugins?.allow).toContain("@elizaos/plugin-edge-tts");
  });

  it("edge-tts does NOT auto-enable without cloud provisioning flag", () => {
    const { config } = applyPluginAutoEnable({
      config: {
        plugins: {},
        connectors: { discord: { botToken: "local-token" } },
      },
      env: {},
    });
    // Discord should be enabled, but edge-tts should not
    expect(config.plugins?.allow).toContain("@elizaos/plugin-discord");
    expect(config.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-edge-tts",
    );
  });

  it("edge-tts can still be disabled via explicit plugin entry in cloud mode", () => {
    const { config } = applyPluginAutoEnable({
      config: {
        plugins: {
          entries: { "edge-tts": { enabled: false } },
        },
        connectors: { discord: { botToken: "cloud-token" } },
      },
      env: { MILADY_CLOUD_PROVISIONED: "1" },
    });
    expect(config.plugins?.allow).toContain("@elizaos/plugin-discord");
    expect(config.plugins?.allow ?? []).not.toContain(
      "@elizaos/plugin-edge-tts",
    );
  });

  it("discord auto-enable does not duplicate entries on repeated calls", () => {
    const baseConfig = {
      plugins: { allow: ["@elizaos/plugin-discord"] },
      connectors: { discord: { botToken: "tok" } },
    };
    const { config } = applyPluginAutoEnable({
      config: baseConfig,
      env: {},
    });
    // Should not have duplicates in the allow list
    const discordEntries = (config.plugins?.allow ?? []).filter(
      (p: string) => p === "@elizaos/plugin-discord",
    );
    expect(discordEntries).toHaveLength(1);
  });
});

// ── Cloud env var + health monitor parity ────────────────────────────────────

describe("cloud discord env var parity", () => {
  it("collectConnectorEnvVars emits DISCORD_API_TOKEN and DISCORD_BOT_TOKEN from botToken", () => {
    const vars = collectConnectorEnvVars({
      connectors: { discord: { botToken: "tok-123" } },
    } as Record<string, unknown>);
    expect(vars.DISCORD_API_TOKEN).toBe("tok-123");
    expect(vars.DISCORD_BOT_TOKEN).toBe("tok-123");
  });

  it("collectConnectorEnvVars emits DISCORD_API_TOKEN and DISCORD_BOT_TOKEN from token", () => {
    const vars = collectConnectorEnvVars({
      connectors: { discord: { token: "tok-456" } },
    } as Record<string, unknown>);
    expect(vars.DISCORD_API_TOKEN).toBe("tok-456");
    expect(vars.DISCORD_BOT_TOKEN).toBe("tok-456");
  });

  it("collectConnectorEnvVars emits DISCORD_APPLICATION_ID", () => {
    const vars = collectConnectorEnvVars({
      connectors: { discord: { botToken: "tok", applicationId: "app-id-789" } },
    } as Record<string, unknown>);
    expect(vars.DISCORD_APPLICATION_ID).toBe("app-id-789");
  });

  it("collectConnectorEnvVars emits Discord profile sync settings", () => {
    const vars = collectConnectorEnvVars({
      connectors: {
        discord: {
          botToken: "tok",
          syncProfile: false,
          profileName: "MiladyBot",
          profileAvatar: "/tmp/milady.png",
        },
      },
    } as Record<string, unknown>);
    expect(vars.DISCORD_SYNC_PROFILE).toBe("false");
    expect(vars.DISCORD_PROFILE_NAME).toBe("MiladyBot");
    expect(vars.DISCORD_PROFILE_AVATAR).toBe("/tmp/milady.png");
  });

  it("collectConnectorEnvVars omits discord vars when no token is set", () => {
    const vars = collectConnectorEnvVars({
      connectors: { discord: { applicationId: "app-id-789" } },
    } as Record<string, unknown>);
    expect(vars.DISCORD_API_TOKEN).toBeUndefined();
    expect(vars.DISCORD_BOT_TOKEN).toBeUndefined();
    // applicationId IS still emitted via the regular env map path
    expect(vars.DISCORD_APPLICATION_ID).toBe("app-id-789");
  });
});

describe("connector health monitor coverage parity", () => {
  it("health monitor covers every connector in CONNECTOR_PLUGINS", () => {
    const healthKeys = new Set(Object.keys(CONNECTOR_PLUGIN_MAP));
    for (const connectorId of Object.keys(CONNECTOR_PLUGINS)) {
      expect(healthKeys.has(connectorId)).toBe(true);
    }
  });

  it("health monitor covers every connector in CONNECTOR_IDS", () => {
    const healthKeys = new Set(Object.keys(CONNECTOR_PLUGIN_MAP));
    for (const id of CONNECTOR_IDS) {
      expect(healthKeys.has(id)).toBe(true);
    }
  });
});
