import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentRuntime } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { req } from "../../../test/helpers/http";
import { saveEnv } from "../../../test/helpers/test-utils";
import { startApiServer } from "../src/api/server";

describe("WhatsApp webhook auth bypass", () => {
  let closeServer: (() => Promise<void>) | null = null;
  let port = 0;
  let tempDir = "";
  let envBackup: { restore: () => void } | null = null;
  let verifyWebhook: ReturnType<typeof vi.fn>;
  let handleWebhook: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    envBackup = saveEnv(
      "MILADY_API_TOKEN",
      "ELIZA_CONFIG_PATH",
      "ELIZA_STATE_DIR",
    );
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-wa-webhook-"));
    process.env.MILADY_API_TOKEN = "test-api-token";
    process.env.ELIZA_CONFIG_PATH = path.join(tempDir, "milady.json");
    process.env.ELIZA_STATE_DIR = tempDir;
    fs.writeFileSync(process.env.ELIZA_CONFIG_PATH, "{}", "utf-8");

    verifyWebhook = vi.fn(
      (_mode: string, _token: string, challenge: string) => challenge,
    );
    handleWebhook = vi.fn(async () => {});

    const runtime = {
      agentId: "whatsapp-webhook-agent",
      character: { name: "WhatsAppWebhookAgent" },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      getService: (type: string) =>
        type === "whatsapp" ? { verifyWebhook, handleWebhook } : null,
      getSetting: () => undefined,
    } as unknown as AgentRuntime;

    const server = await startApiServer({ port: 0, runtime });
    port = server.port;
    closeServer = server.close;
  }, 30_000);

  afterAll(async () => {
    if (closeServer) {
      await closeServer();
    }
    envBackup?.restore();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps normal API routes protected when an API token is configured", async () => {
    const response = await req(port, "GET", "/api/cloud/status");
    expect(response.status).toBe(401);
    expect(response.data.error).toBe("Unauthorized");
  });

  it("allows GET webhook verification without the API token", async () => {
    const response = await req(
      port,
      "GET",
      "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=challenge-123",
    );

    expect(response.status).toBe(200);
    expect(response.data._raw).toBe("challenge-123");
    expect(verifyWebhook).toHaveBeenCalledWith(
      "subscribe",
      "test-verify",
      "challenge-123",
    );
  });

  it("surfaces verification failures on the public webhook path", async () => {
    verifyWebhook.mockReturnValueOnce(null);

    const response = await req(
      port,
      "GET",
      "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge-123",
    );

    expect(response.status).toBe(403);
    expect(response.data.error).toBe("Webhook verification failed");
  });

  it("allows POST webhook delivery without the API token", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{ id: "entry-1", changes: [] }],
    };

    const response = await req(
      port,
      "POST",
      "/api/whatsapp/webhook",
      payload,
    );

    expect(response.status).toBe(200);
    expect(response.data._raw).toBe("EVENT_RECEIVED");
    expect(handleWebhook).toHaveBeenCalledWith(payload);
  });

  it("rejects invalid JSON on the public webhook path", async () => {
    const response = await req(
      port,
      "POST",
      "/api/whatsapp/webhook",
      '{"object":',
      "application/json",
    );

    expect(response.status).toBe(400);
    expect(response.data.error).toBe("Invalid JSON in request body");
  });
});
