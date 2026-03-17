import { describe, it, expect, vi } from "vitest";
import { getPrivateKey } from "../utils/clobClient";

function createMockRuntime(settings: Record<string, string | null>) {
  return {
    getSetting: vi.fn((key: string) => settings[key] ?? null),
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as any;
}

describe("getPrivateKey consistency", () => {
  it("prefers POLYMARKET_PRIVATE_KEY over others", () => {
    const runtime = createMockRuntime({
      POLYMARKET_PRIVATE_KEY: "0xpolykey",
      EVM_PRIVATE_KEY: "0xevmkey",
    });
    expect(getPrivateKey(runtime)).toBe("0xpolykey");
  });

  it("falls back to EVM_PRIVATE_KEY", () => {
    const runtime = createMockRuntime({
      EVM_PRIVATE_KEY: "0xevmkey",
    });
    expect(getPrivateKey(runtime)).toBe("0xevmkey");
  });

  it("does NOT accept WALLET_PRIVATE_KEY or PRIVATE_KEY", () => {
    const runtime = createMockRuntime({
      WALLET_PRIVATE_KEY: "0xwalletkey",
      PRIVATE_KEY: "0xgenerickey",
    });
    expect(() => getPrivateKey(runtime)).toThrow("No private key found");
  });

  it("adds 0x prefix if missing", () => {
    const runtime = createMockRuntime({
      POLYMARKET_PRIVATE_KEY: "abcdef1234",
    });
    expect(getPrivateKey(runtime)).toBe("0xabcdef1234");
  });
});
