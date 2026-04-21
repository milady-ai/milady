import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSet = vi.fn();
const mockIsAvailable = vi.fn();

vi.mock("./platform-secure-store-node", () => ({
  createNodePlatformSecureStore: () => ({
    backend: "macos_keychain",
    get: vi.fn(),
    set: mockSet,
    delete: vi.fn(),
    isAvailable: mockIsAvailable,
  }),
}));

vi.mock("./agent-vault-id", () => ({
  deriveAgentVaultId: () => "mldy1-testvault",
}));

const loadElizaConfig = vi.fn();
const saveElizaConfig = vi.fn();

vi.mock("../config/config", () => ({
  loadElizaConfig: () => loadElizaConfig(),
  saveElizaConfig: (c: unknown) => saveElizaConfig(c),
}));

import { migrateWalletPrivateKeysToOsStore } from "./wallet-os-store-actions";

describe("migrateWalletPrivateKeysToOsStore", () => {
  beforeEach(() => {
    mockSet.mockReset();
    mockIsAvailable.mockReset();
    loadElizaConfig.mockReset();
    saveElizaConfig.mockReset();
    delete process.env.EVM_PRIVATE_KEY;
    delete process.env.SOLANA_PRIVATE_KEY;
  });

  it("returns unavailable when the store cannot run", async () => {
    mockIsAvailable.mockResolvedValue(false);
    const r = await migrateWalletPrivateKeysToOsStore();
    expect(r.unavailable).toBe(true);
    expect(r.migrated).toEqual([]);
    expect(saveElizaConfig).not.toHaveBeenCalled();
  });

  it("migrates from config.env, persists without keys, and fills process.env", async () => {
    mockIsAvailable.mockResolvedValue(true);
    mockSet.mockResolvedValue({ ok: true });
    loadElizaConfig.mockReturnValue({
      env: { EVM_PRIVATE_KEY: "0xfromconfig" },
    });

    const r = await migrateWalletPrivateKeysToOsStore();

    expect(r.migrated).toContain("EVM_PRIVATE_KEY");
    expect(mockSet).toHaveBeenCalled();
    expect(process.env.EVM_PRIVATE_KEY).toBe("0xfromconfig");
    expect(saveElizaConfig).toHaveBeenCalled();
    const saved = saveElizaConfig.mock.calls[0][0] as { env?: unknown };
    expect(saved.env).toBeUndefined();
  });

  it("prefers process.env over config when both are set", async () => {
    mockIsAvailable.mockResolvedValue(true);
    mockSet.mockResolvedValue({ ok: true });
    process.env.EVM_PRIVATE_KEY = "0xfromproc";
    loadElizaConfig.mockReturnValue({
      env: { EVM_PRIVATE_KEY: "0xfromconfig" },
    });

    await migrateWalletPrivateKeysToOsStore();

    expect(mockSet).toHaveBeenCalledWith(
      "mldy1-testvault",
      "wallet.evm_private_key",
      "0xfromproc",
    );
    expect(process.env.EVM_PRIVATE_KEY).toBe("0xfromproc");
  });
});
