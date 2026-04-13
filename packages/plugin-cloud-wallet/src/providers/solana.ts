import {
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { CloudRpcClient } from "../bridge/client.ts";
import { getRuntimeSetting } from "../runtime.ts";
import type { CloudRpcExecutor, RuntimeLike } from "../types.ts";

export interface CreateCloudSolanaSignerOptions {
  runtime: RuntimeLike;
  executor: CloudRpcExecutor;
  privateKey?: `0x${string}`;
  address?: string;
}

export interface CloudSolanaSigner {
  readonly publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(
    tx: T,
  ): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: T[],
  ): Promise<T[]>;
}

function requireSetting(
  runtime: RuntimeLike,
  key: string,
  override?: string,
): string {
  const v = getRuntimeSetting(runtime, key, override);
  if (!v) throw new Error(`[cloud-wallet] missing setting ${key}`);
  return v;
}

function serializeTx(tx: Transaction | VersionedTransaction): string {
  const isVersioned =
    typeof (tx as VersionedTransaction).version !== "undefined";
  const bytes = isVersioned
    ? (tx as VersionedTransaction).serialize()
    : (tx as Transaction).serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
  return Buffer.from(bytes).toString("base64");
}

function applySignedBytes<T extends Transaction | VersionedTransaction>(
  tx: T,
  base64: string,
): T {
  const bytes = Buffer.from(base64, "base64");
  const isVersioned =
    typeof (tx as VersionedTransaction).version !== "undefined";
  
  if (isVersioned) {
    // For VersionedTransaction, deserialize the signed transaction
    const signed = VersionedTransaction.deserialize(bytes);
    // Copy signatures back to original object
    (tx as VersionedTransaction).signatures = signed.signatures;
  } else {
    // For Transaction, deserialize and extract signatures
    const signed = Transaction.from(bytes);
    // Copy signatures back to original object
    (tx as Transaction).signatures = signed.signatures;
  }
  return tx;
}

export function createCloudSolanaSigner(
  options: CreateCloudSolanaSignerOptions,
): CloudSolanaSigner {
  const address = requireSetting(
    options.runtime,
    "MILADY_CLOUD_SOLANA_ADDRESS",
    options.address,
  );
  const clientKey = requireSetting(
    options.runtime,
    "MILADY_CLOUD_CLIENT_ADDRESS_KEY",
    options.privateKey,
  ) as `0x${string}`;

  const rpc = new CloudRpcClient({
    executor: options.executor,
    privateKey: clientKey,
  });
  const publicKey = new PublicKey(address);

  return {
    publicKey,
    async signTransaction(tx) {
      const signed = await rpc.call<string>("solana_signTransaction", [
        address,
        serializeTx(tx),
      ]);
      return applySignedBytes(tx, signed);
    },
    async signAllTransactions(txs) {
      const signed = await rpc.call<string[]>("solana_signAllTransactions", [
        address,
        txs.map(serializeTx),
      ]);
      return txs.map((tx, i) => applySignedBytes(tx, signed[i] ?? ""));
    },
  };
}
