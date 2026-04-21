import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
const mockIsAvailable = vi.fn();

vi.mock("./platform-secure-store-node", () => ({
  createNodePlatformSecureStore: () => ({
    backend: "macos_keychain",
    get: mockGet,
    set: vi.fn(),
    delete: vi.fn(),
    isAvailable: mockIsAvailable,
  }),
  isWalletOsStoreReadEnabled: () => true,
}));

vi.mock("./agent-vault-id", () => ({
  deriveAgentVaultId: () => "mldy1-testvault",
}));

import { hydrateWalletKeysFromNodePlatformSecureStore } from "./hydrate-wallet-keys-from-platform-store";

describe("hydrateWalletKeysFromNodePlatformSecureStore", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockIsAvailable.mockReset();
    delete process.env.EVM_PRIVATE_KEY;
    delete process.env.SOLANA_PRIVATE_KEY;
  });

  afterEach(() => {
    delete process.env.EVM_PRIVATE_KEY;
    delete process.env.SOLANA_PRIVATE_KEY;
    delete process.env.MILADY_WALLET_OS_STORE;
  });

  it("fills missing env keys from the store", async () => {
    mockIsAvailable.mockResolvedValue(true);
    mockGet.mockImplementation(async (_vault: string, kind: string) => {
      if (kind === "wallet.evm_private_key") {
        return { ok: true as const, value: "0xabc" };
      }
      if (kind === "wallet.solana_private_key") {
        return { ok: true as const, value: "sol123" };
      }
      return { ok: false as const, reason: "not_found" as const };
    });

    await hydrateWalletKeysFromNodePlatformSecureStore();

    expect(process.env.EVM_PRIVATE_KEY).toBe("0xabc");
    expect(process.env.SOLANA_PRIVATE_KEY).toBe("sol123");
  });

  it("does not override non-empty env", async () => {
    process.env.EVM_PRIVATE_KEY = "  already  ";
    mockIsAvailable.mockResolvedValue(true);
    mockGet.mockResolvedValue({ ok: true, value: "from-store" });

    await hydrateWalletKeysFromNodePlatformSecureStore();

    expect(process.env.EVM_PRIVATE_KEY).toBe("  already  ");
  });
});
