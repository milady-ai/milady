// Bridge types live in `packages/agent/src/cloud/bridge-client.ts`.
// We re-export them via relative path so downstream consumers don't
// need to add @miladyai/agent as a dependency.
export {
  type CloudChainType as ChainType,
  type CloudWalletDescriptor,
  type CloudWalletProvider,
  type SignedRpcEnvelope,
  type RpcResult,
  CloudBridgeError,
  SignatureInvalidError,
  NonceReplayError,
  SessionExpiredError,
  CloudUnavailableError,
} from "../../agent/src/cloud/bridge-client.ts";

import type { SignedRpcEnvelope } from "../../agent/src/cloud/bridge-client.ts";

export type WalletSource = "local" | "cloud";

export interface CloudRpcExecutor {
  executeRpc<T = unknown>(
    envelope: SignedRpcEnvelope,
    options?: { correlationId?: string },
  ): Promise<T>;
}

export interface RuntimeLike {
  getSetting(key: string): string | undefined | null;
}
