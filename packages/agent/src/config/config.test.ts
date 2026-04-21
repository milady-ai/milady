import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateWalletKeys } from "../api/wallet";

let tmpDir: string;
let tmpConfigPath: string;
let tmpPersistPath: string;
let tmpStateDir: string;

const ENV_KEYS = [
  "ELIZA_PERSIST_CONFIG_PATH",
  "MILADY_PERSIST_CONFIG_PATH",
  "DISCORD_API_TOKEN",
  "DISCORD_BOT_TOKEN",
  "OPENAI_API_KEY",
  "SOLANA_PRIVATE_KEY",
  "SOLANA_PUBLIC_KEY",
  "WALLET_PUBLIC_KEY",
] as const;

const envBackup = new Map<string, string | undefined>();

vi.mock("./paths", () => ({
  resolveConfigPath: () => tmpConfigPath,
  resolveStateDir: () => tmpStateDir,
  resolveUserPath: (value: string) => value,
}));

import { configFileExists, loadElizaConfig } from "./config";

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("loadElizaConfig", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-config-"));
    tmpConfigPath = path.join(tmpDir, "runtime.json");
    tmpPersistPath = path.join(tmpDir, "persisted.json");
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

  it("overlays persisted config when the write path differs from the runtime path", () => {
    process.env.ELIZA_PERSIST_CONFIG_PATH = tmpPersistPath;

    writeJson(tmpConfigPath, {
      logging: { level: "error" },
      env: { MILADY_WALLET_NETWORK: "mainnet" },
      cloud: { apiKey: "runtime-cloud-key" },
    });
    writeJson(tmpPersistPath, {
      plugins: {
        entries: {
          discord: { enabled: true },
        },
      },
      connectors: {
        discord: {
          token: "discord-token-overlay",
        },
      },
    });

    const config = loadElizaConfig();

    expect(config.env?.MILADY_WALLET_NETWORK).toBe("mainnet");
    expect(config.cloud?.apiKey).toBe("runtime-cloud-key");
    expect(config.plugins?.entries?.discord?.enabled).toBe(true);
    expect(config.connectors?.discord?.token).toBe("discord-token-overlay");
    expect(process.env.DISCORD_API_TOKEN).toBe("discord-token-overlay");
    expect(process.env.DISCORD_BOT_TOKEN).toBe("discord-token-overlay");
  });

  it("prefers persisted config env vars over preexisting process env values", () => {
    process.env.ELIZA_PERSIST_CONFIG_PATH = tmpPersistPath;
    process.env.DISCORD_API_TOKEN = "dotenv-discord-token";
    process.env.DISCORD_BOT_TOKEN = "dotenv-discord-token";
    process.env.OPENAI_API_KEY = "dotenv-openai-key";

    writeJson(tmpPersistPath, {
      env: {
        DISCORD_API_TOKEN: "saved-discord-token",
        OPENAI_API_KEY: "saved-openai-key",
      },
    });

    const config = loadElizaConfig();

    expect(config.env?.DISCORD_API_TOKEN).toBe("saved-discord-token");
    expect(config.env?.OPENAI_API_KEY).toBe("saved-openai-key");
    expect(process.env.DISCORD_API_TOKEN).toBe("saved-discord-token");
    expect(process.env.DISCORD_BOT_TOKEN).toBe("saved-discord-token");
    expect(process.env.OPENAI_API_KEY).toBe("saved-openai-key");
  });

  it("prefers persisted connector credentials over preexisting process env values", () => {
    process.env.ELIZA_PERSIST_CONFIG_PATH = tmpPersistPath;
    process.env.DISCORD_API_TOKEN = "dotenv-discord-token";
    process.env.DISCORD_BOT_TOKEN = "dotenv-discord-token";

    writeJson(tmpPersistPath, {
      connectors: {
        discord: {
          token: "saved-discord-token",
        },
      },
    });

    const config = loadElizaConfig();

    expect(config.connectors?.discord?.token).toBe("saved-discord-token");
    expect(process.env.DISCORD_API_TOKEN).toBe("saved-discord-token");
    expect(process.env.DISCORD_BOT_TOKEN).toBe("saved-discord-token");
  });

  it("treats the persisted config as an existing config file", () => {
    process.env.ELIZA_PERSIST_CONFIG_PATH = tmpPersistPath;

    writeJson(tmpPersistPath, {
      logging: { level: "error" },
    });

    expect(configFileExists()).toBe(true);
  });

  it("syncs Solana public key aliases from a persisted private key", () => {
    process.env.ELIZA_PERSIST_CONFIG_PATH = tmpPersistPath;
    const keys = generateWalletKeys();

    writeJson(tmpPersistPath, {
      env: {
        SOLANA_PRIVATE_KEY: keys.solanaPrivateKey,
      },
    });

    loadElizaConfig();

    expect(process.env.SOLANA_PRIVATE_KEY).toBeUndefined();
    expect(process.env.SOLANA_PUBLIC_KEY).toBe(keys.solanaAddress);
    expect(process.env.WALLET_PUBLIC_KEY).toBe(keys.solanaAddress);
  });
});
