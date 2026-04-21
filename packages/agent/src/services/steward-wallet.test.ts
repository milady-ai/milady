import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  approveStewardWalletRequest,
  getStewardPendingApprovals,
  getStewardWalletStatus,
  resolveEffectiveStewardConfig,
  signWithStewardWallet,
} from "./steward-wallet";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("steward-wallet service", () => {
  it("loads persisted Milady Steward credentials when env vars are absent", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify({
        apiUrl: "https://steward.example",
        tenantId: "tenant-browser",
        agentId: "agent-browser",
        apiKey: "key-browser",
        agentToken: "token-browser",
      }),
    );

    expect(
      resolveEffectiveStewardConfig({} as NodeJS.ProcessEnv),
    ).toMatchObject({
      apiUrl: "https://steward.example",
      tenantId: "tenant-browser",
      agentId: "agent-browser",
      apiKey: "key-browser",
      agentToken: "token-browser",
    });
  });

  it("reads Steward status from the agent endpoint", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          name: "Milady Browser Agent",
          walletAddresses: {
            evm: "0x1234567890abcdef1234567890abcdef12345678",
            solana: null,
          },
        },
      }),
    }) as unknown as typeof globalThis.fetch;

    await expect(
      getStewardWalletStatus({
        STEWARD_API_URL: "https://steward.example",
        STEWARD_AGENT_ID: "agent-browser",
        STEWARD_AGENT_TOKEN: "token-browser",
      } as NodeJS.ProcessEnv),
    ).resolves.toMatchObject({
      configured: true,
      connected: true,
      agentId: "agent-browser",
      agentName: "Milady Browser Agent",
      walletAddresses: {
        evm: "0x1234567890abcdef1234567890abcdef12345678",
      },
    });
  });

  it("returns pending approval responses from the Steward sign endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 202,
      json: async () => ({
        data: {
          txId: "tx-1",
        },
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(
      signWithStewardWallet(
        {
          to: "0xabc0000000000000000000000000000000000000",
          value: "1000000000000000",
          chainId: 8453,
          broadcast: true,
        },
        {
          STEWARD_API_URL: "https://steward.example",
          STEWARD_AGENT_ID: "agent-browser",
          STEWARD_AGENT_TOKEN: "token-browser",
        } as NodeJS.ProcessEnv,
      ),
    ).resolves.toMatchObject({
      approved: false,
      pending: true,
      txId: "tx-1",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://steward.example/vault/agent-browser/sign");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer token-browser",
    );
  });

  it("lists pending approvals and approves a request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              queueId: "queue:tx-1",
              requestedAt: "2026-04-05T18:45:00.000Z",
              status: "pending",
              transaction: {
                id: "tx-1",
                request: {
                  to: "0xabc0000000000000000000000000000000000000",
                  value: "1",
                  chainId: 8453,
                },
                policyResults: [],
                status: "pending",
                agentId: "agent-browser",
                createdAt: "2026-04-05T18:45:00.000Z",
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            txHash: "0xapprovedtx1",
          },
        }),
      });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(
      getStewardPendingApprovals({
        STEWARD_API_URL: "https://steward.example",
        STEWARD_AGENT_ID: "agent-browser",
      } as NodeJS.ProcessEnv),
    ).resolves.toHaveLength(1);

    await expect(
      approveStewardWalletRequest("tx-1", {
        STEWARD_API_URL: "https://steward.example",
        STEWARD_AGENT_ID: "agent-browser",
      } as NodeJS.ProcessEnv),
    ).resolves.toMatchObject({
      ok: true,
      txHash: "0xapprovedtx1",
    });
  });
});
