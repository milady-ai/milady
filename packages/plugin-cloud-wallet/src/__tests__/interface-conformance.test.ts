/**
 * Structural interface conformance. We intentionally do NOT type-import from
 * `plugins/plugin-evm` or `plugins/plugin-solana` — they are submodules and
 * may be unbuilt. This test asserts the shape the upstream plugins consume:
 *
 * EVM target: viem `WalletClient` with `account`, `chain`, `signMessage`,
 * `signTypedData`, `signTransaction`, `sendTransaction`.
 *
 * Solana target: an object with `publicKey: PublicKey` plus async
 * `signTransaction` and `signAllTransactions`.
 */
import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { Keypair } from "@solana/web3.js";
import { createCloudEvmWalletClient } from "../providers/evm.ts";
import { createCloudSolanaSigner } from "../providers/solana.ts";
import type { CloudRpcExecutor, RuntimeLike } from "../types.ts";

const executor: CloudRpcExecutor = { executeRpc: async () => "0x0" };

function runtime(map: Record<string, string>): RuntimeLike {
  return { getSetting: (k) => map[k] ?? undefined };
}

describe("EVM WalletClient structural conformance", () => {
  const client = createCloudEvmWalletClient({
    runtime: runtime({
      MILADY_CLOUD_EVM_ADDRESS: privateKeyToAccount(generatePrivateKey())
        .address,
      MILADY_CLOUD_CLIENT_ADDRESS_KEY: generatePrivateKey(),
    }),
    chain: mainnet,
    executor,
  });

  it("exposes the viem WalletClient surface plugin-evm consumes", () => {
    expect(client.account).toBeDefined();
    expect(client.chain).toBeDefined();
    expect(typeof client.signMessage).toBe("function");
    expect(typeof client.signTypedData).toBe("function");
    expect(typeof client.signTransaction).toBe("function");
    expect(typeof client.sendTransaction).toBe("function");
  });

  it("account implements the signer tunnel methods", () => {
    const acct = client.account!;
    expect(typeof acct.signMessage).toBe("function");
    expect(typeof acct.signTypedData).toBe("function");
    expect(typeof acct.signTransaction).toBe("function");
  });
});

describe("Solana signer structural conformance", () => {
  const kp = Keypair.generate();
  const signer = createCloudSolanaSigner({
    runtime: runtime({
      MILADY_CLOUD_SOLANA_ADDRESS: kp.publicKey.toBase58(),
      MILADY_CLOUD_CLIENT_ADDRESS_KEY: generatePrivateKey(),
    }),
    executor,
  });

  it("exposes publicKey and async signTransaction/signAllTransactions", () => {
    expect(signer.publicKey).toBeDefined();
    expect(typeof signer.publicKey.toBase58).toBe("function");
    expect(typeof signer.signTransaction).toBe("function");
    expect(typeof signer.signAllTransactions).toBe("function");
  });
});
