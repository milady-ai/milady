import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadElizaConfig,
  saveElizaConfig,
} from "@miladyai/agent/config/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElizaConfig } from "../config/types";
import {
  createMockHttpResponse,
  createMockJsonRequest,
} from "../test-support/test-helpers";
import {
  buildPluginListResponse,
  handlePluginsCompatRoutes,
} from "./plugins-compat-routes";

const mockApplyPluginRuntimeMutation = vi.hoisted(() => vi.fn());

const tmpPaths = vi.hoisted(() => {
  const os = require("node:os");
  const path = require("node:path");
  const fallbackDir = path.join(os.tmpdir(), "milady-compat-routes-fallback");
  return {
    tmpDir: fallbackDir,
    tmpConfigPath: path.join(fallbackDir, "eliza.json"),
    tmpPersistConfigPath: path.join(fallbackDir, "milady.json"),
    tmpStateDir: path.join(fallbackDir, "state"),
  };
});

let tmpDir: string;
let tmpConfigPath: string;
let tmpPersistConfigPath: string;
let tmpStateDir: string;

const ENV_KEYS = [
  "DISCORD_API_TOKEN",
  "DISCORD_BOT_TOKEN",
  "DISCORD_APPLICATION_ID",
  "TELEGRAM_BOT_TOKEN",
  "ELIZA_API_TOKEN",
  "ELIZA_PERSIST_CONFIG_PATH",
  "MILADY_PERSIST_CONFIG_PATH",
] as const;

const envBackup = new Map<string, string | undefined>();

vi.mock("@miladyai/agent/config/paths", () => ({
  resolveConfigPath: () => tmpPaths.tmpConfigPath,
  resolveStateDir: () => tmpPaths.tmpStateDir,
  resolveUserPath: (value: string) => value,
}));

vi.mock("@miladyai/agent/api/plugin-runtime-apply", () => ({
  applyPluginRuntimeMutation: (...args: unknown[]) =>
    mockApplyPluginRuntimeMutation(...args),
}));

type CompatPluginRecord = {
  configured: boolean;
  validationErrors: Array<{ field: string; message: string }>;
  parameters: Array<{
    key: string;
    isSet: boolean;
    currentValue?: string | null;
  }>;
};

function getPlugin(
  pluginId: string,
): CompatPluginRecord & Record<string, unknown> {
  const plugin = (
    buildPluginListResponse(null).plugins as Array<Record<string, unknown>>
  ).find((candidate) => candidate.id === pluginId);
  if (!plugin) {
    throw new Error(`Expected bundled "${pluginId}" plugin to exist`);
  }
  return plugin as CompatPluginRecord & Record<string, unknown>;
}

function getDiscordPlugin(): CompatPluginRecord {
  return getPlugin("discord");
}

function getTelegramPlugin(): CompatPluginRecord {
  return getPlugin("telegram");
}

function createAsyncJsonRequest(
  body: Record<string, unknown>,
  options: {
    method: string;
    url: string;
    headers: Record<string, string>;
  },
) {
  const req = createMockJsonRequest(body, options);
  const encodedBody = Buffer.from(JSON.stringify(body), "utf8");
  (
    req as typeof req & {
      [Symbol.asyncIterator]: () => AsyncGenerator<Buffer, void, void>;
      socket: { remoteAddress: string };
    }
  )[Symbol.asyncIterator] = async function* () {
    yield encodedBody;
  };
  (req as typeof req & { socket: { remoteAddress: string } }).socket = {
    remoteAddress: "127.0.0.1",
  };
  return req;
}

describe("buildPluginListResponse", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "milady-discord-plugin-config-"),
    );
    tmpConfigPath = path.join(tmpDir, "eliza.json");
    tmpPersistConfigPath = path.join(tmpDir, "milady.json");
    tmpStateDir = path.join(tmpDir, "state");
    tmpPaths.tmpDir = tmpDir;
    tmpPaths.tmpConfigPath = tmpConfigPath;
    tmpPaths.tmpPersistConfigPath = tmpPersistConfigPath;
    tmpPaths.tmpStateDir = tmpStateDir;

    for (const key of ENV_KEYS) {
      envBackup.set(key, process.env[key]);
      delete process.env[key];
    }

    mockApplyPluginRuntimeMutation.mockReset();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = envBackup.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    envBackup.clear();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("hydrates Discord env vars from connectors.discord.token", () => {
    saveElizaConfig({
      logging: { level: "error" },
      connectors: {
        discord: {
          token: "discord-token-123",
        },
      },
    } as ElizaConfig);

    const discord = getDiscordPlugin();

    expect(discord.configured).toBe(true);
    expect(discord.validationErrors).toEqual([]);
    expect(discord.parameters.map((parameter) => parameter.key)).toEqual(
      expect.arrayContaining([
        "DISCORD_API_TOKEN",
        "DISCORD_APPLICATION_ID",
        "CHANNEL_IDS",
      ]),
    );
    expect(
      discord.parameters.find(
        (parameter) => parameter.key === "DISCORD_API_TOKEN",
      ),
    ).toMatchObject({
      isSet: true,
    });
    expect(process.env.DISCORD_API_TOKEN).toBe("discord-token-123");
    expect(process.env.DISCORD_BOT_TOKEN).toBe("discord-token-123");
  });

  it("overrides placeholder Discord env values from connectors config", () => {
    process.env.DISCORD_API_TOKEN = "[REDACTED]";
    process.env.DISCORD_BOT_TOKEN = "";

    saveElizaConfig({
      logging: { level: "error" },
      connectors: {
        discord: {
          token: "discord-token-456",
        },
      },
    } as ElizaConfig);

    const discord = getDiscordPlugin();

    expect(discord.configured).toBe(true);
    expect(discord.validationErrors).toEqual([]);
    expect(discord.parameters.map((parameter) => parameter.key)).toEqual(
      expect.arrayContaining([
        "DISCORD_API_TOKEN",
        "DISCORD_APPLICATION_ID",
        "CHANNEL_IDS",
      ]),
    );
    expect(
      discord.parameters.find(
        (parameter) => parameter.key === "DISCORD_API_TOKEN",
      ),
    ).toMatchObject({
      isSet: true,
    });
    expect(process.env.DISCORD_API_TOKEN).toBe("discord-token-456");
    expect(process.env.DISCORD_BOT_TOKEN).toBe("discord-token-456");
  });

  it("hydrates Telegram parameters from bundled package metadata", () => {
    process.env.TELEGRAM_BOT_TOKEN = "telegram-token-123";

    const telegram = getTelegramPlugin();

    expect(telegram.parameters.map((parameter) => parameter.key)).toEqual(
      expect.arrayContaining([
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_ALLOWED_CHATS",
        "TELEGRAM_API_ROOT",
      ]),
    );
    expect(
      telegram.parameters.find(
        (parameter) => parameter.key === "TELEGRAM_BOT_TOKEN",
      ),
    ).toMatchObject({
      isSet: true,
    });
    expect(telegram.configured).toBe(true);
    expect(telegram.validationErrors).toEqual([]);
  });

  it("marks Discord toggles as pending restart on the compat API route", async () => {
    process.env.ELIZA_API_TOKEN = "test-api-token";

    saveElizaConfig({
      logging: { level: "error" },
      plugins: {
        entries: {
          discord: { enabled: false },
        },
      },
      connectors: {
        discord: {
          token: "discord-token-789",
        },
      },
    } as ElizaConfig);

    const req = createAsyncJsonRequest(
      { enabled: true },
      {
        method: "PUT",
        url: "/api/plugins/discord",
        headers: {
          authorization: "Bearer test-api-token",
          host: "localhost:3000",
        },
      },
    );
    const { res, getJson, getStatus } = createMockHttpResponse<{
      ok: boolean;
      plugin: { enabled: boolean };
    }>();
    const state = {
      current: null,
      pendingAgentName: null,
      pendingRestartReasons: [],
    };

    const handled = await handlePluginsCompatRoutes(req, res, state);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toMatchObject({
      ok: true,
      plugin: { enabled: true },
      requiresRestart: true,
    });
    expect(state.pendingRestartReasons).toEqual(["Plugin toggle: discord"]);

    const persisted = loadElizaConfig();
    expect(persisted.plugins?.entries?.discord?.enabled).toBe(true);
    expect(persisted.connectors?.discord?.enabled).toBe(true);
  });

  it("persists Discord disable state to connectors.discord.enabled", async () => {
    process.env.ELIZA_API_TOKEN = "test-api-token";

    saveElizaConfig({
      logging: { level: "error" },
      plugins: {
        entries: {
          discord: { enabled: true },
        },
      },
      connectors: {
        discord: {
          token: "discord-token-disable",
        },
      },
    } as ElizaConfig);

    const req = createAsyncJsonRequest(
      { enabled: false },
      {
        method: "PUT",
        url: "/api/plugins/discord",
        headers: {
          authorization: "Bearer test-api-token",
          host: "localhost:3000",
        },
      },
    );
    const { res, getJson, getStatus } = createMockHttpResponse<{
      ok: boolean;
      plugin: { enabled: boolean };
    }>();
    const state = {
      current: null,
      pendingAgentName: null,
      pendingRestartReasons: [],
    };

    const handled = await handlePluginsCompatRoutes(req, res, state);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toMatchObject({
      ok: true,
      plugin: { enabled: false },
      requiresRestart: true,
    });
    expect(state.pendingRestartReasons).toEqual(["Plugin toggle: discord"]);

    const persisted = loadElizaConfig();
    expect(persisted.plugins?.entries?.discord?.enabled).toBe(false);
    expect(persisted.connectors?.discord?.enabled).toBe(false);
    expect(persisted.connectors?.discord?.token).toBe("discord-token-disable");
  });

  it("mirrors Discord config values into connectors config and marks restart required", async () => {
    process.env.ELIZA_API_TOKEN = "test-api-token";

    saveElizaConfig({
      logging: { level: "error" },
      plugins: {
        entries: {
          discord: { enabled: true },
        },
      },
      connectors: {
        discord: {
          enabled: true,
          token: "discord-token-old",
          applicationId: "111111111111111111",
        },
      },
    } as ElizaConfig);

    const req = createAsyncJsonRequest(
      {
        config: {
          DISCORD_API_TOKEN: "discord-token-new",
          DISCORD_APPLICATION_ID: "222222222222222222",
        },
      },
      {
        method: "PUT",
        url: "/api/plugins/discord",
        headers: {
          authorization: "Bearer test-api-token",
          host: "localhost:3000",
        },
      },
    );
    const { res, getJson, getStatus } = createMockHttpResponse<{
      ok: boolean;
      requiresRestart?: boolean;
    }>();
    const state = {
      current: null,
      pendingAgentName: null,
      pendingRestartReasons: [],
    };

    const handled = await handlePluginsCompatRoutes(req, res, state);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toMatchObject({
      ok: true,
      requiresRestart: true,
    });
    expect(state.pendingRestartReasons).toEqual([
      "Plugin config updated: discord",
    ]);

    const persisted = loadElizaConfig();
    expect(persisted.connectors?.discord?.enabled).toBe(true);
    expect(persisted.connectors?.discord?.token).toBe("discord-token-new");
    expect(persisted.connectors?.discord?.botToken).toBeUndefined();
    expect(persisted.connectors?.discord?.applicationId).toBe(
      "222222222222222222",
    );
  });

  it("applies Discord enable in place when a live runtime is available", async () => {
    process.env.ELIZA_API_TOKEN = "test-api-token";

    saveElizaConfig({
      logging: { level: "error" },
      plugins: {
        entries: {
          discord: { enabled: false },
        },
      },
      connectors: {
        discord: {
          enabled: false,
          token: "discord-token-live",
        },
      },
    } as ElizaConfig);

    mockApplyPluginRuntimeMutation.mockResolvedValueOnce({
      mode: "plugin_reload",
      requiresRestart: false,
      restartedRuntime: false,
      loadedPackages: ["@elizaos/plugin-discord"],
      unloadedPackages: [],
      reloadedPackages: [],
      appliedConfigPackage: null,
      reason: "Plugin toggle: discord",
    });

    const req = createAsyncJsonRequest(
      { enabled: true },
      {
        method: "PUT",
        url: "/api/plugins/discord",
        headers: {
          authorization: "Bearer test-api-token",
          host: "localhost:3000",
        },
      },
    );
    const { res, getJson, getStatus } = createMockHttpResponse<{
      ok: boolean;
      applied?: string;
      requiresRestart?: boolean;
      loadedPackages?: string[];
    }>();
    const runtime = { plugins: [] };
    const state = {
      current: runtime as never,
      pendingAgentName: null,
      pendingRestartReasons: [],
    };

    const handled = await handlePluginsCompatRoutes(req, res, state);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toMatchObject({
      ok: true,
      applied: "plugin_reload",
      requiresRestart: false,
      loadedPackages: ["@elizaos/plugin-discord"],
    });
    expect(state.pendingRestartReasons).toEqual([]);
    expect(mockApplyPluginRuntimeMutation).toHaveBeenCalledTimes(1);
    expect(mockApplyPluginRuntimeMutation.mock.calls[0]?.[0]).toMatchObject({
      runtime,
      changedPluginId: "discord",
      changedPluginPackage: "@elizaos/plugin-discord",
      expectRuntimeGraphChange: true,
      reason: "Plugin toggle: discord",
    });
  });

  it("reloads Discord config in place without queuing a restart", async () => {
    process.env.ELIZA_API_TOKEN = "test-api-token";

    saveElizaConfig({
      logging: { level: "error" },
      plugins: {
        entries: {
          discord: { enabled: true },
        },
      },
      connectors: {
        discord: {
          enabled: true,
          token: "discord-token-old",
        },
      },
    } as ElizaConfig);

    mockApplyPluginRuntimeMutation.mockResolvedValueOnce({
      mode: "plugin_reload",
      requiresRestart: false,
      restartedRuntime: false,
      loadedPackages: [],
      unloadedPackages: ["@elizaos/plugin-discord"],
      reloadedPackages: ["@elizaos/plugin-discord"],
      appliedConfigPackage: null,
      reason: "Plugin config updated: discord",
    });

    const req = createAsyncJsonRequest(
      {
        config: {
          DISCORD_API_TOKEN: "discord-token-new",
          DISCORD_APPLICATION_ID: "222222222222222222",
        },
      },
      {
        method: "PUT",
        url: "/api/plugins/discord",
        headers: {
          authorization: "Bearer test-api-token",
          host: "localhost:3000",
        },
      },
    );
    const { res, getJson, getStatus } = createMockHttpResponse<{
      ok: boolean;
      applied?: string;
      requiresRestart?: boolean;
      unloadedPackages?: string[];
      reloadedPackages?: string[];
    }>();
    const runtime = { plugins: [] };
    const state = {
      current: runtime as never,
      pendingAgentName: null,
      pendingRestartReasons: [],
    };

    const handled = await handlePluginsCompatRoutes(req, res, state);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toMatchObject({
      ok: true,
      applied: "plugin_reload",
      requiresRestart: false,
      unloadedPackages: ["@elizaos/plugin-discord"],
      reloadedPackages: ["@elizaos/plugin-discord"],
    });
    expect(state.pendingRestartReasons).toEqual([]);
    expect(mockApplyPluginRuntimeMutation).toHaveBeenCalledTimes(1);
    expect(mockApplyPluginRuntimeMutation.mock.calls[0]?.[0]).toMatchObject({
      runtime,
      changedPluginId: "discord",
      changedPluginPackage: "@elizaos/plugin-discord",
      config: {
        DISCORD_API_TOKEN: "discord-token-new",
        DISCORD_APPLICATION_ID: "222222222222222222",
      },
      expectRuntimeGraphChange: false,
      reason: "Plugin config updated: discord",
    });
  });

  it("reads Discord enable state from the persisted config path", () => {
    process.env.ELIZA_PERSIST_CONFIG_PATH = tmpPersistConfigPath;
    process.env.MILADY_PERSIST_CONFIG_PATH = tmpPersistConfigPath;

    fs.writeFileSync(
      tmpConfigPath,
      JSON.stringify(
        {
          logging: { level: "error" },
        },
        null,
        2,
      ),
      "utf8",
    );

    saveElizaConfig({
      logging: { level: "error" },
      plugins: {
        entries: {
          discord: { enabled: true },
        },
      },
      connectors: {
        discord: {
          token: "discord-token-persisted",
        },
      },
    } as ElizaConfig);

    const discord = getDiscordPlugin() as CompatPluginRecord & {
      enabled: boolean;
    };

    expect(discord.enabled).toBe(true);
    expect(discord.configured).toBe(true);
  });

  it("prefers connectors.discord.enabled over a stale plugin entry toggle", () => {
    saveElizaConfig({
      logging: { level: "error" },
      plugins: {
        entries: {
          discord: { enabled: true },
        },
      },
      connectors: {
        discord: {
          enabled: false,
          token: "discord-token-stale-plugin-flag",
        },
      },
    } as ElizaConfig);

    const discord = getDiscordPlugin() as CompatPluginRecord & {
      enabled: boolean;
    };

    expect(discord.enabled).toBe(false);
    expect(discord.configured).toBe(true);
  });

  it("does not include unknown bundled plugin ids", () => {
    const ids = buildPluginListResponse(null).plugins.map(
      (plugin) => plugin.id,
    );
    // "selfcontrol" is shipped via plugin-selfcontrol package, not bundled in plugins.json.
    expect(ids).not.toContain("selfcontrol");
  });

  describe("generic fallback model key filtering", () => {
    it("filters SMALL_MODEL when a provider-prefixed equivalent exists (e.g. google-genai)", () => {
      const googlePlugin = getPlugin("google-genai");

      const paramKeys = googlePlugin.parameters.map(
        (parameter) => parameter.key,
      );
      // The plugin declares GOOGLE_SMALL_MODEL → SMALL_MODEL should be filtered out.
      expect(paramKeys).toContain("GOOGLE_SMALL_MODEL");
      expect(paramKeys).not.toContain("SMALL_MODEL");
    });

    it("keeps SMALL_MODEL when no provider-prefixed equivalent exists", () => {
      // elizaos-cloud declares ELIZAOS_CLOUD_SMALL_MODEL + SMALL_MODEL;
      // ELIZAOS_CLOUD_SMALL_MODEL ends with _SMALL_MODEL so SMALL_MODEL is filtered.
      // Use anthropic which only has ANTHROPIC_SMALL_MODEL (no bare SMALL_MODEL).
      const anthropicPlugin = getPlugin("anthropic");
      const paramKeys = anthropicPlugin.parameters.map(
        (parameter) => parameter.key,
      );
      // anthropic declares ANTHROPIC_SMALL_MODEL but NOT bare SMALL_MODEL,
      // so there is nothing to filter — ANTHROPIC_SMALL_MODEL is kept.
      expect(paramKeys).toContain("ANTHROPIC_SMALL_MODEL");
      expect(paramKeys).not.toContain("SMALL_MODEL");
    });

    it("never filters non-model keys regardless of prefixed equivalents", () => {
      const googlePlugin = getPlugin("google-genai");
      const paramKeys = googlePlugin.parameters.map(
        (parameter) => parameter.key,
      );
      // GOOGLE_GENERATIVE_AI_API_KEY is present and should not be affected by
      // the model filtering logic.
      expect(paramKeys).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
    });
  });
});
