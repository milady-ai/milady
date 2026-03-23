import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startApiServer } from "@miladyai/app-core/src/api/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { req } from "./helpers/http";
import { saveEnv } from "./helpers/test-utils";

describe("Cloud auth status persistence", () => {
  let port = 0;
  let closeServer: (() => Promise<void>) | null = null;
  let envBackup: { restore: () => void } | null = null;
  let tempDir = "";
  let configPath = "";

  beforeAll(async () => {
    envBackup = saveEnv(
      "MILADY_CONFIG_PATH",
      "ELIZA_CONFIG_PATH",
      "MILADY_STATE_DIR",
      "ELIZA_STATE_DIR",
      "ELIZAOS_CLOUD_API_KEY",
      "ELIZAOS_CLOUD_ENABLED",
    );

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-cloud-auth-"));
    configPath = path.join(tempDir, "milady.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          cloud: {
            enabled: true,
            apiKey: "ck-test-persisted-key",
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    process.env.MILADY_CONFIG_PATH = configPath;
    process.env.ELIZA_CONFIG_PATH = configPath;
    process.env.MILADY_STATE_DIR = tempDir;
    process.env.ELIZA_STATE_DIR = tempDir;

    const server = await startApiServer({ port: 0 });
    port = server.port;
    closeServer = server.close;
  }, 30_000);

  afterAll(async () => {
    if (closeServer) {
      await closeServer();
    }
    if (envBackup) {
      envBackup.restore();
    }
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reports connected cloud status from cached API key", async () => {
    const { status, data } = await req(port, "GET", "/api/cloud/status");
    expect(status).toBe(200);
    expect(data.connected).toBe(true);
    expect(data.hasApiKey).toBe(true);
    expect(data.enabled).toBe(true);
  });

  it("disconnect clears cached cloud auth and persists config change", async () => {
    const disconnect = await req(port, "POST", "/api/cloud/disconnect");
    expect(disconnect.status).toBe(200);
    expect(disconnect.data).toEqual({ ok: true, status: "disconnected" });

    const statusAfter = await req(port, "GET", "/api/cloud/status");
    expect(statusAfter.status).toBe(200);
    expect(statusAfter.data.connected).toBe(false);
    expect(statusAfter.data.hasApiKey).toBe(false);
    expect(statusAfter.data.enabled).toBe(false);
    expect(statusAfter.data.reason).toBe("runtime_not_started");

    const persistedRaw = fs.readFileSync(configPath, "utf-8");
    const persisted = JSON.parse(persistedRaw) as {
      cloud?: { enabled?: boolean; apiKey?: string };
    };
    expect(persisted.cloud?.enabled).toBe(false);
    expect(persisted.cloud?.apiKey).toBeUndefined();
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBeUndefined();
    expect(process.env.ELIZAOS_CLOUD_ENABLED).toBeUndefined();
  });
});
