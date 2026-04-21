import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { deriveSolanaAddress } from "@miladyai/agent/api/wallet";
import { ethers } from "ethers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { req } from "../../../../test/helpers/http";
import { startApiServer } from "../../src/api/server";

const SOLANA_PKCS8_DER_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);

type StewardFixture = {
  close: () => Promise<void>;
  lastRequest: Record<string, unknown> | null;
  url: string;
};

async function readJsonBody(
  req: http.IncomingMessage,
): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return null;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
}

async function startStewardFixture(): Promise<StewardFixture> {
  const state: { lastRequest: Record<string, unknown> | null } = {
    lastRequest: null,
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "POST" && url.pathname === "/vault/agent-browser/sign") {
      state.lastRequest = await readJsonBody(req);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          data: { txHash: "0xbridgee2etx" },
        }),
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
    get lastRequest() {
      return state.lastRequest;
    },
    url: `http://127.0.0.1:${address.port}`,
  };
}

describe("browser wallet route", () => {
  let closeApiServer: () => Promise<void>;
  let port: number;
  let stewardFixture: StewardFixture;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const key of [
      "EVM_PRIVATE_KEY",
      "SOLANA_PRIVATE_KEY",
      "STEWARD_API_URL",
      "STEWARD_AGENT_ID",
      "STEWARD_AGENT_TOKEN",
    ]) {
      savedEnv[key] = process.env[key];
    }

    delete process.env.EVM_PRIVATE_KEY;
    stewardFixture = await startStewardFixture();
    process.env.STEWARD_API_URL = stewardFixture.url;
    process.env.STEWARD_AGENT_ID = "agent-browser";
    process.env.STEWARD_AGENT_TOKEN = "test-token";

    const server = await startApiServer({ port: 0 });
    port = server.port;
    closeApiServer = server.close;
  }, 30_000);

  afterAll(async () => {
    await closeApiServer();
    await stewardFixture.close();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("routes browser transaction signing through Steward", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/wallet/browser-transaction",
      {
        broadcast: true,
        chainId: 8453,
        data: "0xdeadbeef",
        description: "Browser bridge e2e request",
        to: "0xabc0000000000000000000000000000000000000",
        value: "1000000000000000",
      },
    );

    expect(status).toBe(200);
    expect(data).toMatchObject({
      approved: true,
      mode: "steward",
      txHash: "0xbridgee2etx",
    });
    expect(stewardFixture.lastRequest).toMatchObject({
      broadcast: true,
      chainId: 8453,
      data: "0xdeadbeef",
      description: "Browser bridge e2e request",
      to: "0xabc0000000000000000000000000000000000000",
      value: "1000000000000000",
    });
  });

  it("signs browser messages with the local wallet key", async () => {
    const localKey =
      "0x59c6995e998f97a5a0044966f094538f2d7d7d5d2a4f9cce6f6d8d3c5b5a8e7f";
    process.env.EVM_PRIVATE_KEY = localKey;

    const { status, data } = await req(
      port,
      "POST",
      "/api/wallet/browser-sign-message",
      {
        message: "Browser says hi",
      },
    );

    const expectedSignature = await new ethers.Wallet(localKey).signMessage(
      "Browser says hi",
    );

    expect(status).toBe(200);
    expect(data).toMatchObject({
      mode: "local-key",
      signature: expectedSignature,
    });
  });

  it("signs browser Solana messages with the local wallet key", async () => {
    const solanaSeed = Buffer.from(
      Array.from({ length: 32 }, (_, index) => index + 1),
    );
    process.env.SOLANA_PRIVATE_KEY = JSON.stringify(Array.from(solanaSeed));

    const { status, data } = await req(
      port,
      "POST",
      "/api/wallet/browser-solana-sign-message",
      {
        message: "Solana says hi",
      },
    );

    const privateKey = crypto.createPrivateKey({
      key: Buffer.concat([SOLANA_PKCS8_DER_PREFIX, solanaSeed]),
      format: "der",
      type: "pkcs8",
    });
    const expectedSignature = crypto
      .sign(null, Buffer.from("Solana says hi", "utf8"), privateKey)
      .toString("base64");

    expect(status).toBe(200);
    expect(data).toMatchObject({
      address: deriveSolanaAddress(process.env.SOLANA_PRIVATE_KEY ?? ""),
      mode: "local-key",
      signatureBase64: expectedSignature,
    });
  });
});
