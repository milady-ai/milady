import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = {
  HOME: process.env.HOME,
  STEWARD_API_URL: process.env.STEWARD_API_URL,
  STEWARD_AGENT_ID: process.env.STEWARD_AGENT_ID,
  MILADY_STEWARD_AGENT_ID: process.env.MILADY_STEWARD_AGENT_ID,
  ELIZA_STEWARD_AGENT_ID: process.env.ELIZA_STEWARD_AGENT_ID,
  STEWARD_API_KEY: process.env.STEWARD_API_KEY,
  STEWARD_AGENT_TOKEN: process.env.STEWARD_AGENT_TOKEN,
  STEWARD_TENANT_ID: process.env.STEWARD_TENANT_ID,
  STEWARD_EVM_ADDRESS: process.env.STEWARD_EVM_ADDRESS,
  STEWARD_SOLANA_ADDRESS: process.env.STEWARD_SOLANA_ADDRESS,
  SOLANA_PUBLIC_KEY: process.env.SOLANA_PUBLIC_KEY,
  WALLET_PUBLIC_KEY: process.env.WALLET_PUBLIC_KEY,
} as const;

let tempRoot = "";

beforeEach(() => {
  vi.resetModules();

  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "milady-wallet-cache-"));
  const homeDir = path.join(tempRoot, "home");
  fs.mkdirSync(path.join(homeDir, ".milady"), { recursive: true });
  fs.writeFileSync(
    path.join(homeDir, ".milady", "steward-credentials.json"),
    JSON.stringify({
      apiUrl: "https://steward.example",
      agentId: "agent-123",
    }),
  );

  process.env.HOME = homeDir;
  delete process.env.STEWARD_API_URL;
  delete process.env.STEWARD_AGENT_ID;
  delete process.env.MILADY_STEWARD_AGENT_ID;
  delete process.env.ELIZA_STEWARD_AGENT_ID;
  delete process.env.STEWARD_API_KEY;
  delete process.env.STEWARD_AGENT_TOKEN;
  delete process.env.STEWARD_TENANT_ID;
  delete process.env.STEWARD_EVM_ADDRESS;
  delete process.env.STEWARD_SOLANA_ADDRESS;
  delete process.env.SOLANA_PUBLIC_KEY;
  delete process.env.WALLET_PUBLIC_KEY;

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            walletAddresses: {
              evm: "0x1111111111111111111111111111111111111111",
              solana: "So11111111111111111111111111111111111111112",
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  if (tempRoot) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = "";
  }
});

describe("initStewardWalletCache", () => {
  it("hydrates wallet addresses from persisted steward credentials", async () => {
    const wallet = await import("../wallet");

    await wallet.initStewardWalletCache();

    expect(wallet.getWalletAddresses()).toEqual({
      evmAddress: "0x1111111111111111111111111111111111111111",
      solanaAddress: "So11111111111111111111111111111111111111112",
    });
    expect(process.env.STEWARD_EVM_ADDRESS).toBe(
      "0x1111111111111111111111111111111111111111",
    );
    expect(process.env.STEWARD_SOLANA_ADDRESS).toBe(
      "So11111111111111111111111111111111111111112",
    );
    expect(process.env.SOLANA_PUBLIC_KEY).toBe(
      "So11111111111111111111111111111111111111112",
    );
    expect(process.env.WALLET_PUBLIC_KEY).toBe(
      "So11111111111111111111111111111111111111112",
    );
  });
});
