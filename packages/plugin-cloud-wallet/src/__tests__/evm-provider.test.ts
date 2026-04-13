import { describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { createCloudEvmWalletClient } from "../providers/evm.ts";
import type { CloudRpcExecutor, RuntimeLike } from "../types.ts";

function makeRuntime(map: Record<string, string>): RuntimeLike {
  return { getSetting: (k) => map[k] ?? undefined };
}

describe("createCloudEvmWalletClient", () => {
  const clientKey = generatePrivateKey();
  const address = privateKeyToAccount(generatePrivateKey()).address;

  const runtime = makeRuntime({
    MILADY_CLOUD_EVM_ADDRESS: address,
    MILADY_CLOUD_CLIENT_ADDRESS_KEY: clientKey,
  });

  it("routes signMessage to eth_signMessage with [address, message] params", async () => {
    const calls: Array<{ method: string; params: unknown[] }> = [];
    const executor: CloudRpcExecutor = {
      executeRpc: async (env) => {
        calls.push({
          method: env.payload.method,
          params: env.payload.params,
        });
        return "0xdeadbeef" as const;
      },
    };
    const client = createCloudEvmWalletClient({
      runtime,
      chain: mainnet,
      executor,
    });
    const sig = await client.signMessage({
      account: client.account!,
      message: "hello",
    });
    expect(sig).toBe("0xdeadbeef");
    expect(calls[0].method).toBe("eth_signMessage");
    expect(calls[0].params).toEqual([address, "hello"]);
  });

  it("routes signTypedData to eth_signTypedData_v4 with [address, typedData]", async () => {
    const calls: Array<{ method: string; params: unknown[] }> = [];
    const executor: CloudRpcExecutor = {
      executeRpc: async (env) => {
        calls.push({
          method: env.payload.method,
          params: env.payload.params,
        });
        return "0xabc";
      },
    };
    const client = createCloudEvmWalletClient({
      runtime,
      chain: mainnet,
      executor,
    });
    const typedData = {
      domain: { name: "t" },
      types: { X: [{ name: "v", type: "uint256" }] },
      primaryType: "X",
      message: { v: 1n },
    } as const;
    await client.signTypedData({
      account: client.account!,
      ...typedData,
    } as Parameters<typeof client.signTypedData>[0]);
    expect(calls[0].method).toBe("eth_signTypedData_v4");
    expect((calls[0].params as unknown[])[0]).toBe(address);
  });

  it("envelope carries signed clientAddress derived from the local key", async () => {
    const captured: Array<{ clientAddress: string }> = [];
    const executor: CloudRpcExecutor = {
      executeRpc: async (env) => {
        captured.push({ clientAddress: env.clientAddress });
        return "0x00";
      },
    };
    const client = createCloudEvmWalletClient({
      runtime,
      chain: mainnet,
      executor,
    });
    await client.signMessage({ account: client.account!, message: "x" });
    expect(captured[0].clientAddress).toBe(
      privateKeyToAccount(clientKey).address,
    );
  });

  it("throws when required setting missing", () => {
    const bad = makeRuntime({});
    const executor: CloudRpcExecutor = { executeRpc: vi.fn() };
    expect(() =>
      createCloudEvmWalletClient({ runtime: bad, chain: mainnet, executor }),
    ).toThrow(/MILADY_CLOUD_EVM_ADDRESS/);
  });
});
