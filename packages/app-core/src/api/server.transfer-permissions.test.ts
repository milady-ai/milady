import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { req } from "../../../../test/helpers/http";
import { startApiServer } from "./server";

describe("wallet transfer permissions", () => {
  let port: number;
  let close: () => Promise<void>;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const key of [
      "EVM_PRIVATE_KEY",
      "NODEREAL_BSC_RPC_URL",
      "QUICKNODE_BSC_RPC_URL",
    ]) {
      savedEnv[key] = process.env[key];
    }

    process.env.EVM_PRIVATE_KEY =
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    delete process.env.NODEREAL_BSC_RPC_URL;
    delete process.env.QUICKNODE_BSC_RPC_URL;

    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;

    const modeResponse = await req(port, "PUT", "/api/permissions/trade-mode", {
      mode: "manual-local-key",
    });
    expect(modeResponse.status).toBe(200);
  }, 30_000);

  afterAll(async () => {
    await close();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("treats agent-originated transfer execution as user-sign in manual-local-key mode", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/wallet/transfer/execute",
      {
        toAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        amount: "0.001",
        assetSymbol: "BNB",
        confirm: true,
      },
      { "X-Eliza-Agent-Action": "1" },
    );

    expect(status).toBe(200);
    expect(data.executed).toBe(false);
    expect(data.mode).toBe("user-sign");
    expect(data.requiresUserSignature).toBe(true);
  });
});
