import {
  type Chain,
  createWalletClient,
  type Hex,
  http,
  type WalletClient,
} from "viem";
import { type LocalAccount, toAccount } from "viem/accounts";
import { CloudRpcClient } from "../bridge/client.ts";
import { getRuntimeSetting } from "../runtime.ts";
import type { CloudRpcExecutor, RuntimeLike } from "../types.ts";

export interface CreateCloudEvmWalletClientOptions {
  runtime: RuntimeLike;
  chain: Chain;
  executor: CloudRpcExecutor;
  transport?: ReturnType<typeof http>;
  privateKey?: `0x${string}`;
  address?: `0x${string}`;
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

export function createCloudEvmWalletClient(
  options: CreateCloudEvmWalletClientOptions,
): WalletClient {
  const address = requireSetting(
    options.runtime,
    "MILADY_CLOUD_EVM_ADDRESS",
    options.address,
  ) as `0x${string}`;
  const clientKey = requireSetting(
    options.runtime,
    "MILADY_CLOUD_CLIENT_ADDRESS_KEY",
    options.privateKey,
  ) as `0x${string}`;

  const rpc = new CloudRpcClient({
    executor: options.executor,
    privateKey: clientKey,
  });

  const account: LocalAccount = toAccount({
    address,
    async signMessage({ message }) {
      return rpc.call<Hex>("eth_signMessage", [address, message]);
    },
    async signTypedData(typedData) {
      return rpc.call<Hex>("eth_signTypedData_v4", [address, typedData]);
    },
    async signTransaction(transaction) {
      return rpc.call<Hex>("eth_signTransaction", [address, transaction]);
    },
  });

  const base = createWalletClient({
    account,
    chain: options.chain,
    transport: options.transport ?? http(),
  });

  const cloudSend = async (tx: unknown) => {
    const signed = await rpc.call<Hex>("eth_signTransaction", [address, tx]);
    return rpc.call<Hex>("eth_sendRawTransaction", [signed]);
  };

  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === "sendTransaction") return cloudSend;
      return Reflect.get(target, prop, receiver);
    },
  }) as WalletClient;
}
