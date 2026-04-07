import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveElizaConfig } from "@miladyai/agent/config/config";
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

let tmpDir: string;
let tmpConfigPath: string;
let tmpPersistConfigPath: string;
let tmpStateDir: string;

const ENV_KEYS = [
  "DISCORD_API_TOKEN",
  "DISCORD_BOT_TOKEN",
  "DISCORD_APPLICATION_ID",
  "ELIZA_API_TOKEN",
  "ELIZA_PERSIST_CONFIG_PATH",
  "MILADY_PERSIST_CONFIG_PATH",
] as const;

const envBackup = new Map<string, string | undefined>();

vi.mock("@miladyai/agent/config/paths", () => ({
  resolveConfigPath: () => tmpConfigPath,
  resolveStateDir: () => tmpStateDir,
  resolveUserPath: (value: string) => value,
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

    for (const key of ENV_KEYS) {
      envBackup.set(key, process.env[key]);
      delete process.env[key];
    }
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

  it("treats connectors.discord.token as a configured Discord plugin token", () => {
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
    expect(
      discord.parameters.find(
        (parameter) => parameter.key === "DISCORD_API_TOKEN",
      )?.isSet,
    ).toBe(true);
    expect(process.env.DISCORD_API_TOKEN).toBe("discord-token-123");
    expect(process.env.DISCORD_BOT_TOKEN).toBe("discord-token-123");
  });

  it("rehydrates connector tokens over empty or redacted Discord env placeholders", () => {
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
    expect(process.env.DISCORD_API_TOKEN).toBe("discord-token-456");
    expect(process.env.DISCORD_BOT_TOKEN).toBe("discord-token-456");
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
    });
    expect(state.pendingRestartReasons).toEqual(["Plugin toggle: discord"]);
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

  it("lists the bundled SelfControl plugin without setup fields", () => {
    const selfControl = getPlugin("selfcontrol") as CompatPluginRecord & {
      category: string;
      configured: boolean;
      enabled: boolean;
      source: string;
    };

    expect(selfControl.enabled).toBe(false);
    expect(selfControl.configured).toBe(true);
    expect(selfControl.category).toBe("feature");
    expect(selfControl.source).toBe("bundled");
    expect(selfControl.parameters).toEqual([]);
    expect(selfControl.validationErrors).toEqual([]);
  });
});
