// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { clientMock, confirmDesktopActionMock, persistenceMock } = vi.hoisted(
  () => ({
    clientMock: {
      updateWalletConfig: vi.fn(async () => ({ ok: true })),
      refreshCloudWallets: vi.fn(async () => ({ ok: true })),
      getWalletConfig: vi.fn(async () => ({
        evmAddress: null,
        solanaAddress: null,
      })),
      getWalletBalances: vi.fn(async () => ({
        evm: null,
        solana: null,
      })),
    },
    confirmDesktopActionMock: vi.fn(),
    persistenceMock: {
      loadBrowserEnabled: vi.fn(() => false),
      loadWalletEnabled: vi.fn(() => true),
      saveBrowserEnabled: vi.fn(),
      saveWalletEnabled: vi.fn(),
    },
  }),
);

vi.mock("../api", () => ({
  client: clientMock,
}));

vi.mock("../utils", () => ({
  confirmDesktopAction: confirmDesktopActionMock,
}));

vi.mock("./persistence", () => persistenceMock);

import { useWalletState } from "./useWalletState";

function createParams() {
  return {
    setActionNotice: vi.fn(),
    promptModal: vi.fn(async () => null),
    agentName: "Satoshi",
    characterName: "Satoshi",
  };
}

describe("useWalletState cloud wallet import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.updateWalletConfig.mockResolvedValue({ ok: true });
    clientMock.refreshCloudWallets.mockResolvedValue({ ok: true });
    clientMock.getWalletConfig.mockResolvedValue({
      evmAddress: null,
      solanaAddress: null,
    });
    clientMock.getWalletBalances.mockResolvedValue({
      evm: null,
      solana: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("refreshes cloud wallets after saving Eliza Cloud RPC selections", async () => {
    const params = createParams();
    const { result } = renderHook(() => useWalletState(params));

    await act(async () => {
      const saved = await result.current.handleWalletApiKeySave({
        selections: {
          evm: "eliza-cloud",
          bsc: "eliza-cloud",
          solana: "eliza-cloud",
        },
        walletNetwork: "mainnet",
      });
      expect(saved).toBe(true);
    });

    expect(clientMock.updateWalletConfig).toHaveBeenCalledTimes(1);
    expect(clientMock.refreshCloudWallets).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(params.setActionNotice).toHaveBeenCalledWith(
        "Cloud wallet import queued. Restart required to apply.",
        "success",
      );
    });
  });

  it("does not refresh cloud wallets for non-cloud RPC saves", async () => {
    const params = createParams();
    const { result } = renderHook(() => useWalletState(params));

    await act(async () => {
      const saved = await result.current.handleWalletApiKeySave({
        selections: {
          evm: "alchemy",
          bsc: "ankr",
          solana: "helius-birdeye",
        },
        walletNetwork: "mainnet",
      });
      expect(saved).toBe(true);
    });

    expect(clientMock.updateWalletConfig).toHaveBeenCalledTimes(1);
    expect(clientMock.refreshCloudWallets).not.toHaveBeenCalled();
  });
});
