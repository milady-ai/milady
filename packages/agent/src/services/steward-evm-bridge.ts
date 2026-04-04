/**
 * Steward EVM Bridge — intercepts plugin-evm initialization in cloud-provisioned
 * containers to route signing through Steward API instead of local private keys.
 *
 * Strategy:
 *   1. Before the runtime starts plugins, check if we're in cloud-provisioned mode
 *   2. If so, create a Steward viem Account
 *   3. Inject a synthetic EVM_PRIVATE_KEY setting so initWalletProvider doesn't
 *      generate a random key, then immediately replace the account on the
 *      WalletProvider after EVMService starts
 *
 * This module exports a boot hook that should be called early in the runtime
 * initialization, before plugins are loaded.
 */

import { randomBytes } from "node:crypto";
import type { IAgentRuntime } from "@elizaos/core";
import {
  initStewardEvmAccount,
  isStewardCloudProvisioned,
} from "./steward-evm-account";

/**
 * Generate a random throwaway private key as a placeholder.
 * Called fresh each pre-boot so the key is never reused or predictable.
 * This key is only set to prevent initWalletProvider from generating a
 * persisted random key — it is replaced by the Steward account post-boot.
 * If post-boot fails, the key is cleared so the container has no EVM signer.
 */
function generateDummyPrivateKey(): string {
  return "0x" + randomBytes(32).toString("hex");
}

/** Stash the account globally so we can retrieve it in the post-start hook. */
let _stewardAccount: Awaited<ReturnType<typeof initStewardEvmAccount>> = null;
let _initialized = false;
/** Track whether we set a dummy key so we can clear it on failure. */
let _dummyKeyRuntime: IAgentRuntime | null = null;

/**
 * Pre-boot hook: call before plugins are loaded.
 * Sets a dummy EVM_PRIVATE_KEY if in Steward cloud mode so that initWalletProvider
 * doesn't auto-generate and persist a random key.
 */
export async function stewardEvmPreBoot(runtime: IAgentRuntime): Promise<void> {
  if (!isStewardCloudProvisioned()) {
    return;
  }

  console.log("[StewardEvmBridge] Cloud-provisioned mode detected");

  try {
    _stewardAccount = await initStewardEvmAccount();
    if (_stewardAccount) {
      // Set a random throwaway key so initWalletProvider doesn't generate and
      // persist a random key. This key is replaced by the Steward account in
      // stewardEvmPostBoot. If post-boot fails the key is cleared.
      const existing = runtime.getSetting("EVM_PRIVATE_KEY");
      if (!existing) {
        runtime.setSetting("EVM_PRIVATE_KEY", generateDummyPrivateKey());
        _dummyKeyRuntime = runtime;
        console.log("[StewardEvmBridge] Set random throwaway EVM_PRIVATE_KEY placeholder");
      }
      // Expose the steward-managed address so getWalletAddresses() and
      // resolveWalletCapabilityStatus() can discover it synchronously,
      // even before initStewardWalletCache() runs.
      const addr = _stewardAccount.address;
      if (addr && addr !== "0x0000000000000000000000000000000000000000") {
        process.env.ELIZA_MANAGED_EVM_ADDRESS = addr;
        console.log(`[StewardEvmBridge] Set ELIZA_MANAGED_EVM_ADDRESS=${addr}`);
      }
      _initialized = true;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[StewardEvmBridge] Pre-boot failed: ${msg}`);
    console.warn("[StewardEvmBridge] Steward init failed — EVM wallet will be unavailable");
    // Clear any dummy key we may have set so the container has no EVM signer
    if (_dummyKeyRuntime) {
      try {
        _dummyKeyRuntime.setSetting("EVM_PRIVATE_KEY", "");
      } catch {
        // best-effort
      }
      _dummyKeyRuntime = null;
    }
  }
}

/**
 * Post-boot hook: call after plugins have started.
 * Replaces the WalletProvider's account on the EVMService with the Steward account.
 */
export async function stewardEvmPostBoot(
  runtime: IAgentRuntime,
): Promise<void> {
  if (!_initialized || !_stewardAccount) {
    return;
  }

  try {
    const evmService = runtime.getService("evm") as {
      walletProvider?: {
        _account?: unknown;
        getAddress?: () => string;
      };
    } | null;

    if (!evmService?.walletProvider) {
      console.warn(
        "[StewardEvmBridge] EVMService not found or no walletProvider — clearing dummy key, EVM wallet unavailable"
      );
      // Clear the dummy key so nothing can sign with it
      if (_dummyKeyRuntime) {
        try { _dummyKeyRuntime.setSetting("EVM_PRIVATE_KEY", ""); } catch { /* best-effort */ }
        _dummyKeyRuntime = null;
      }
      return;
    }

    // Replace the account on the WalletProvider instance.
    // WalletProvider stores the account as `this._account` (see initializeAccount).
    // TypeScript doesn't expose it, but it's a simple property assignment.
    const wp = evmService.walletProvider as Record<string, unknown>;
    const oldAddress = (evmService.walletProvider as { getAddress?: () => string }).getAddress?.();
    wp._account = _stewardAccount;

    const newAddress = (evmService.walletProvider as { getAddress?: () => string }).getAddress?.();
    console.log(
      `[StewardEvmBridge] ✓ Replaced EVM account: ${oldAddress} → ${newAddress} (Steward-backed)`
    );
    // Dummy key is no longer needed — Steward account is active
    _dummyKeyRuntime = null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[StewardEvmBridge] Post-boot failed: ${msg}`);
    // Clear dummy key on failure — better to have no signer than a throwaway key
    if (_dummyKeyRuntime) {
      try { _dummyKeyRuntime.setSetting("EVM_PRIVATE_KEY", ""); } catch { /* best-effort */ }
      _dummyKeyRuntime = null;
    }
  }
}

/**
 * Get the Steward account if initialized (for use by other services).
 */
export function getStewardEvmAccount() {
  return _stewardAccount;
}

/**
 * Check if Steward EVM bridge is active.
 */
export function isStewardEvmBridgeActive(): boolean {
  return _initialized && _stewardAccount !== null;
}
