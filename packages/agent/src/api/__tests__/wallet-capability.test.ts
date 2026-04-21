import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../wallet-rpc.js", () => ({
  resolveWalletRpcReadiness: vi.fn(() => ({
    managedBscRpcReady: true,
    walletNetwork: "mainnet",
  })),
}));

vi.mock("../wallet.js", () => ({
  getWalletAddresses: vi.fn(() => ({
    evmAddress: null,
    solanaAddress: null,
  })),
}));

vi.mock("../../services/steward-evm-bridge.js", () => ({
  isStewardEvmBridgeActive: vi.fn(() => false),
}));

import { resolveWalletRpcReadiness } from "../wallet-rpc.js";
import { isStewardEvmBridgeActive } from "../../services/steward-evm-bridge.js";
import { resolveWalletCapabilityStatus } from "../wallet-capability.js";

const mockedResolveWalletRpcReadiness = vi.mocked(resolveWalletRpcReadiness);
const mockedIsStewardEvmBridgeActive = vi.mocked(isStewardEvmBridgeActive);
const ORIGINAL_ENV = { ...process.env };

describe("resolveWalletCapabilityStatus", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    mockedResolveWalletRpcReadiness.mockReturnValue({
      managedBscRpcReady: true,
      walletNetwork: "mainnet",
    } as ReturnType<typeof resolveWalletRpcReadiness>);
    mockedIsStewardEvmBridgeActive.mockReturnValue(false);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("treats the EVM runtime service as plugin-loaded even when runtime.plugins misses plugin-evm", () => {
    const runtime = {
      plugins: [],
      getService: vi.fn((name: string) => (name === "evm" ? {} : null)),
    };

    const capability = resolveWalletCapabilityStatus({
      config: {},
      runtime: runtime as never,
      getWalletAddresses: () => ({
        evmAddress: "0x1111111111111111111111111111111111111111",
        solanaAddress: null,
      }),
    });

    expect(capability.pluginEvmLoaded).toBe(true);
    expect(capability.executionReady).toBe(true);
    expect(capability.executionBlockedReason).toBeNull();
  });

  it("treats the steward bridge as plugin-loaded even before runtime.plugins is populated", () => {
    mockedIsStewardEvmBridgeActive.mockReturnValue(true);

    const capability = resolveWalletCapabilityStatus({
      config: {},
      runtime: {
        plugins: [],
        getService: vi.fn(() => null),
      } as never,
      getWalletAddresses: () => ({
        evmAddress: "0x2222222222222222222222222222222222222222",
        solanaAddress: null,
      }),
    });

    expect(capability.pluginEvmLoaded).toBe(true);
    expect(capability.executionReady).toBe(true);
  });
});
