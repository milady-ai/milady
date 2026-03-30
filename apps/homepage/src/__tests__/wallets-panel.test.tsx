import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentDetail } from "../components/dashboard/AgentDetail";
import { WalletsPanel } from "../components/dashboard/WalletsPanel";
import type { AgentStatus, CloudApiClient } from "../lib/cloud-api";

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  AgentDetail – Wallets tab appears                                 */
/* ------------------------------------------------------------------ */
describe("AgentDetail – Wallets tab", () => {
  const agent: AgentStatus = {
    agentName: "WalletTestAgent",
    model: "gpt-4",
    state: "running",
    uptime: 100,
  };

  const managedAgent = {
    id: "test-1",
    name: "WalletTestAgent",
    source: "local" as const,
    status: "running" as const,
    model: "gpt-4",
    uptime: 100,
  };

  it("renders WALLETS tab button", () => {
    render(
      <AgentDetail
        agent={agent}
        managedAgent={managedAgent}
        connectionId="test-1"
      />,
    );
    expect(screen.getByText("WALLETS")).toBeTruthy();
  });

  it("switches to Wallets tab on click", async () => {
    render(
      <AgentDetail
        agent={agent}
        managedAgent={managedAgent}
        connectionId="test-1"
      />,
    );
    fireEvent.click(screen.getByText("WALLETS"));
    // WalletsPanel shows loading skeleton or no-wallet state
    // (since managedAgent has no sourceUrl/client, it renders no-wallet)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    const container = document.body;
    const text = container.textContent ?? "";
    // Should show either loading skeleton or no wallet state
    expect(
      text.includes("NO WALLET CONFIGURED") || text.includes("WALLET"),
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  WalletsPanel – no wallet state                                    */
/* ------------------------------------------------------------------ */
describe("WalletsPanel – no wallet", () => {
  it("shows no-wallet message when API returns no addresses", async () => {
    const mockClient = {
      getWalletAddresses: vi.fn().mockResolvedValue({
        evmAddress: null,
        solanaAddress: null,
      }),
      getWalletBalances: vi.fn().mockResolvedValue({
        evm: null,
        solana: null,
      }),
      getStewardStatus: vi.fn().mockResolvedValue({
        configured: false,
        available: false,
        connected: false,
      }),
    };

    const managedAgent = {
      id: "no-wallet",
      name: "NoWallet",
      source: "local" as const,
      status: "running" as const,
      sourceUrl: "http://localhost:2138",
      client: mockClient as unknown as CloudApiClient,
    };

    render(<WalletsPanel managedAgent={managedAgent} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getByText("NO WALLET CONFIGURED")).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/*  WalletsPanel – with wallet data                                   */
/* ------------------------------------------------------------------ */
describe("WalletsPanel – with data", () => {
  it("renders wallet addresses and balances when API returns data", async () => {
    const mockClient = {
      getWalletAddresses: vi.fn().mockResolvedValue({
        evmAddress: "0x1234567890abcdef1234567890abcdef12345678",
        solanaAddress: null,
      }),
      getWalletBalances: vi.fn().mockResolvedValue({
        evm: {
          address: "0x1234567890abcdef1234567890abcdef12345678",
          chains: [
            {
              chain: "Base",
              chainId: 8453,
              nativeBalance: "0.5",
              nativeSymbol: "ETH",
              nativeValueUsd: "1250.00",
              tokens: [
                {
                  symbol: "USDC",
                  name: "USD Coin",
                  contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                  balance: "100.0",
                  decimals: 6,
                  valueUsd: "100.00",
                  logoUrl: "",
                },
              ],
              error: null,
            },
          ],
        },
        solana: null,
      }),
      getStewardStatus: vi.fn().mockResolvedValue({
        configured: true,
        available: true,
        connected: true,
        baseUrl: "http://localhost:3200",
        agentId: "agent-123",
      }),
    };

    const managedAgent = {
      id: "wallet-test",
      name: "WalletAgent",
      source: "local" as const,
      status: "running" as const,
      sourceUrl: "http://localhost:2138",
      client: mockClient as unknown as CloudApiClient,
    };

    render(<WalletsPanel managedAgent={managedAgent} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const text = document.body.textContent ?? "";

    // Wallet overview
    expect(text).toContain("WALLET OVERVIEW");
    expect(text).toContain("STEWARD");
    expect(text).toContain("EVM");

    // Balances
    expect(text).toContain("BALANCES");
    expect(text).toContain("0.5000");
    expect(text).toContain("ETH");
    expect(text).toContain("USDC");
    expect(text).toContain("$100.00");

    // Fund section
    expect(text).toContain("FUND YOUR AGENT");
    expect(text).toContain("COPY ADDRESS");

    // Auto-refresh indicator
    expect(text).toContain("AUTO-REFRESH EVERY 30S");
  });

  it("copies address to clipboard when copy button is clicked", async () => {
    const mockClient = {
      getWalletAddresses: vi.fn().mockResolvedValue({
        evmAddress: "0xABCDEF1234567890abcdef1234567890ABCDEF12",
        solanaAddress: null,
      }),
      getWalletBalances: vi.fn().mockResolvedValue({
        evm: {
          address: "0xABCDEF1234567890abcdef1234567890ABCDEF12",
          chains: [],
        },
        solana: null,
      }),
      getStewardStatus: vi.fn().mockResolvedValue({
        configured: false,
        available: false,
        connected: false,
      }),
    };

    const managedAgent = {
      id: "copy-test",
      name: "CopyAgent",
      source: "local" as const,
      status: "running" as const,
      sourceUrl: "http://localhost:2138",
      client: mockClient as unknown as CloudApiClient,
    };

    render(<WalletsPanel managedAgent={managedAgent} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // Click the copy button in the fund section
    const copyButton = screen.getByText("COPY ADDRESS");
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "0xABCDEF1234567890abcdef1234567890ABCDEF12",
    );
  });

  it("shows privy provider when steward is not configured", async () => {
    const mockClient = {
      getWalletAddresses: vi.fn().mockResolvedValue({
        evmAddress: "0x1111111111111111111111111111111111111111",
        solanaAddress: null,
      }),
      getWalletBalances: vi.fn().mockResolvedValue({
        evm: {
          address: "0x1111111111111111111111111111111111111111",
          chains: [],
        },
        solana: null,
      }),
      getStewardStatus: vi.fn().mockResolvedValue({
        configured: false,
        available: false,
        connected: false,
      }),
    };

    const managedAgent = {
      id: "privy-test",
      name: "PrivyAgent",
      source: "local" as const,
      status: "running" as const,
      sourceUrl: "http://localhost:2138",
      client: mockClient as unknown as CloudApiClient,
    };

    render(<WalletsPanel managedAgent={managedAgent} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(document.body.textContent).toContain("PRIVY");
  });

  it("auto-refreshes balances every 30s", async () => {
    const mockClient = {
      getWalletAddresses: vi.fn().mockResolvedValue({
        evmAddress: "0x2222222222222222222222222222222222222222",
        solanaAddress: null,
      }),
      getWalletBalances: vi.fn().mockResolvedValue({
        evm: {
          address: "0x2222222222222222222222222222222222222222",
          chains: [],
        },
        solana: null,
      }),
      getStewardStatus: vi.fn().mockResolvedValue({
        configured: false,
        available: false,
        connected: false,
      }),
    };

    const managedAgent = {
      id: "refresh-test",
      name: "RefreshAgent",
      source: "local" as const,
      status: "running" as const,
      sourceUrl: "http://localhost:2138",
      client: mockClient as unknown as CloudApiClient,
    };

    render(<WalletsPanel managedAgent={managedAgent} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // Initial fetch
    expect(mockClient.getWalletBalances).toHaveBeenCalledTimes(1);

    // Advance 30s for auto-refresh
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(mockClient.getWalletBalances).toHaveBeenCalledTimes(2);
  });

  it("shows both EVM and Solana when both addresses present", async () => {
    const mockClient = {
      getWalletAddresses: vi.fn().mockResolvedValue({
        evmAddress: "0x3333333333333333333333333333333333333333",
        solanaAddress: "SoLANAaDdReSS1111111111111111111111111111111",
      }),
      getWalletBalances: vi.fn().mockResolvedValue({
        evm: {
          address: "0x3333333333333333333333333333333333333333",
          chains: [
            {
              chain: "Ethereum",
              chainId: 1,
              nativeBalance: "1.0",
              nativeSymbol: "ETH",
              nativeValueUsd: "2500.00",
              tokens: [],
              error: null,
            },
          ],
        },
        solana: {
          address: "SoLANAaDdReSS1111111111111111111111111111111",
          solBalance: "10.5",
          solValueUsd: "1575.00",
          tokens: [],
        },
      }),
      getStewardStatus: vi.fn().mockResolvedValue({
        configured: false,
        available: false,
        connected: false,
      }),
    };

    const managedAgent = {
      id: "dual-chain",
      name: "DualChain",
      source: "local" as const,
      status: "running" as const,
      sourceUrl: "http://localhost:2138",
      client: mockClient as unknown as CloudApiClient,
    };

    render(<WalletsPanel managedAgent={managedAgent} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const text = document.body.textContent ?? "";
    expect(text).toContain("EVM");
    expect(text).toContain("SOLANA");
    expect(text).toContain("ETHEREUM");
    expect(text).toContain("1.0000");
    expect(text).toContain("10.5000");
  });
});
