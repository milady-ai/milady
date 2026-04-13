import { describe, expect, it } from "vitest";
import { generatePrivateKey } from "viem/accounts";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { createCloudSolanaSigner } from "../providers/solana.ts";
import type { CloudRpcExecutor, RuntimeLike } from "../types.ts";

function makeRuntime(map: Record<string, string>): RuntimeLike {
  return { getSetting: (k) => map[k] ?? undefined };
}

function makeTx(from: PublicKey): Transaction {
  const tx = new Transaction();
  tx.recentBlockhash = "11111111111111111111111111111111";
  tx.feePayer = from;
  tx.add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1,
    }),
  );
  return tx;
}

describe("createCloudSolanaSigner", () => {
  const clientKey = generatePrivateKey();
  const kp = Keypair.generate();
  const runtime = makeRuntime({
    MILADY_CLOUD_SOLANA_ADDRESS: kp.publicKey.toBase58(),
    MILADY_CLOUD_CLIENT_ADDRESS_KEY: clientKey,
  });

  it("routes signTransaction to solana_signTransaction with [address, tx]", async () => {
    const calls: Array<{ method: string; params: unknown[] }> = [];
    const executor: CloudRpcExecutor = {
      executeRpc: async (env) => {
        calls.push({
          method: env.payload.method,
          params: env.payload.params,
        });
        return Buffer.from([1, 2, 3]).toString("base64");
      },
    };
    const signer = createCloudSolanaSigner({ runtime, executor });
    expect(signer.publicKey.equals(kp.publicKey)).toBe(true);
    await signer.signTransaction(makeTx(kp.publicKey));
    expect(calls[0].method).toBe("solana_signTransaction");
    expect((calls[0].params as unknown[])[0]).toBe(kp.publicKey.toBase58());
    expect(typeof (calls[0].params as unknown[])[1]).toBe("string");
  });

  it("routes signAllTransactions to solana_signAllTransactions", async () => {
    const calls: Array<{ method: string; params: unknown[] }> = [];
    const executor: CloudRpcExecutor = {
      executeRpc: async (env) => {
        calls.push({
          method: env.payload.method,
          params: env.payload.params,
        });
        return [
          Buffer.from([1]).toString("base64"),
          Buffer.from([2]).toString("base64"),
        ];
      },
    };
    const signer = createCloudSolanaSigner({ runtime, executor });
    const txs = [makeTx(kp.publicKey), makeTx(kp.publicKey)];
    const out = await signer.signAllTransactions(txs);
    expect(out).toHaveLength(2);
    expect(calls[0].method).toBe("solana_signAllTransactions");
    expect((calls[0].params as unknown[])[0]).toBe(kp.publicKey.toBase58());
    expect(Array.isArray((calls[0].params as unknown[])[1])).toBe(true);
  });
});
