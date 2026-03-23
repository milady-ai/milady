/**
 * P4-01 regression test: POST /api/plugins/:id/test must return HTTP 422
 * (not 200) when the test fails.
 *
 * See issue #1172 — UX Persona Audit.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { req } from "../../../../test/helpers/http";
import { startApiServer } from "./server";

vi.mock("../services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

/** POST helper matching the original req(port, path, token?) convenience signature. */
function postReq(port: number, path: string, token?: string) {
  const headers: Record<string, string> | undefined = token
    ? { Authorization: `Bearer ${token}` }
    : undefined;
  return req(port, "POST", path, undefined, headers);
}

describe("POST /api/plugins/:id/test — HTTP status codes (P4-01)", () => {
  let port: number;
  let close: () => Promise<void>;

  const prevToken = process.env.ELIZA_API_TOKEN;
  const prevTelegramToken = process.env.TELEGRAM_BOT_TOKEN;

  beforeAll(async () => {
    // No API token set — auth gate is open (default install behaviour)
    delete process.env.ELIZA_API_TOKEN;
    // No Telegram token configured — simulates missing config
    delete process.env.TELEGRAM_BOT_TOKEN;

    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
  }, 30_000);

  afterAll(async () => {
    await close();
    if (prevToken === undefined) {
      delete process.env.ELIZA_API_TOKEN;
    } else {
      process.env.ELIZA_API_TOKEN = prevToken;
    }
    if (prevTelegramToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
      process.env.TELEGRAM_BOT_TOKEN = prevTelegramToken;
    }
  });

  it("returns 422 when Telegram bot token is not configured", async () => {
    const { status, data } = await postReq(port, "/api/plugins/telegram/test");
    expect(status).toBe(422);
    expect(data.success).toBe(false);
    expect(typeof data.error).toBe("string");
  });

  it("returns JSON body with success:false on 422 response", async () => {
    const { data } = await postReq(port, "/api/plugins/telegram/test");
    expect(data).toMatchObject({
      success: false,
      pluginId: "telegram",
    });
  });

  it("does NOT return 200 for a failed Telegram test", async () => {
    const { status } = await postReq(port, "/api/plugins/telegram/test");
    expect(status).not.toBe(200);
  });

  it("returns 200 for a plugin with no custom test (generic success)", async () => {
    // A non-Telegram plugin that is loaded falls through to the generic success
    // path. We use a plugin id that won't be registered — it returns 200 with
    // success:true and the fallback message.
    const { status, data } = await req(
      port,
      "/api/plugins/unknown-plugin/test",
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });
});
