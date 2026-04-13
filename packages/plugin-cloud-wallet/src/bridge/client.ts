import { LruNonceSet } from "./lru-nonce.ts";
import { signEnvelope } from "./sign.ts";
import {
  CloudBridgeError,
  CloudUnavailableError,
  type CloudRpcExecutor,
  NonceReplayError,
  type SignedRpcEnvelope,
} from "../types.ts";

export interface CloudRpcClientOptions {
  executor: CloudRpcExecutor;
  privateKey: `0x${string}`;
  nonceHistory?: LruNonceSet;
}

export interface CloudRpcCallOptions {
  correlationId?: string;
}

export class CloudRpcClient {
  private readonly executor: CloudRpcExecutor;
  private readonly privateKey: `0x${string}`;
  private readonly nonces: LruNonceSet;

  constructor(options: CloudRpcClientOptions) {
    this.executor = options.executor;
    this.privateKey = options.privateKey;
    this.nonces = options.nonceHistory ?? new LruNonceSet(100);
  }

  async call<T = unknown>(
    method: string,
    params: unknown[],
    options: CloudRpcCallOptions = {},
  ): Promise<T> {
    const envelope: SignedRpcEnvelope = await signEnvelope({
      method,
      params,
      privateKey: this.privateKey,
    });

    if (this.nonces.has(envelope.nonce)) {
      throw new NonceReplayError("client-side nonce replay detected");
    }
    this.nonces.add(envelope.nonce);

    try {
      return await this.executor.executeRpc<T>(envelope, {
        correlationId: options.correlationId,
      });
    } catch (err) {
      if (err instanceof CloudBridgeError) throw err;
      throw new CloudUnavailableError(
        err instanceof Error ? err.message : "unknown bridge failure",
        0,
      );
    }
  }
}
