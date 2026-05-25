/**
 * SecureStore — public entry point.
 *
 * Consumers should call `getSecureStore()` once at boot and reuse the
 * returned instance. The factory picks the strongest available backend:
 *
 *   Capacitor native > Electrobun keychain > WebCrypto passphrase > Memory
 *
 * `migrateLegacyLocalStorage()` should be called immediately after the
 * store resolves, before any feature code reads sensitive keys.
 *
 * SOC2 refs: CC6.1, C1.1.
 */

import { CapacitorSecureStore } from "./capacitor-backend.js";
import {
  detectElectrobunKeychain,
  ElectrobunSecureStore,
} from "./electrobun-backend.js";
import { MemorySecureStore } from "./memory-backend.js";
import type { SecureStore } from "./types.js";
import { WebCryptoSecureStore } from "./webcrypto-backend.js";

export {
  type ClientAuditEmitter,
  type ClientAuditEvent,
  emitClientAudit,
  setClientAuditEmitter,
} from "./audit.js";
export { CapacitorSecureStore } from "./capacitor-backend.js";
export {
  detectElectrobunKeychain,
  ElectrobunSecureStore,
} from "./electrobun-backend.js";
export { MemorySecureStore } from "./memory-backend.js";
export { migrateLegacyLocalStorage } from "./migration.js";
export type { SecureStore, SecureStoreBackend } from "./types.js";
export { isSensitiveKey, SENSITIVE_KEYS } from "./types.js";
export { WebCryptoSecureStore } from "./webcrypto-backend.js";

export interface GetSecureStoreOptions {
  /**
   * When provided, enables the WebCrypto fallback for pure-browser builds.
   * Without a passphrase resolver the factory falls back to MemorySecureStore.
   */
  getPassphrase?: () => Promise<string>;

  /**
   * Optional pre-resolved Capacitor SecureStorage plugin handle. Callers in
   * mobile builds inject this; web/desktop pass undefined.
   */
  capacitorSecureStorage?: {
    get(opts: { key: string }): Promise<{ value: string | null }>;
    set(opts: { key: string; value: string }): Promise<void>;
    remove(opts: { key: string }): Promise<void>;
  };

  /** Force a specific backend (tests only). */
  force?: SecureStore;
}

let cached: SecureStore | null = null;

export function getSecureStore(opts: GetSecureStoreOptions = {}): SecureStore {
  if (opts.force) {
    cached = opts.force;
    return cached;
  }
  if (cached) return cached;

  if (opts.capacitorSecureStorage) {
    cached = new CapacitorSecureStore({ plugin: opts.capacitorSecureStorage });
    return cached;
  }

  const electrobun = detectElectrobunKeychain();
  if (electrobun) {
    cached = new ElectrobunSecureStore({ bridge: electrobun });
    return cached;
  }

  if (opts.getPassphrase) {
    cached = new WebCryptoSecureStore({ getPassphrase: opts.getPassphrase });
    return cached;
  }

  cached = new MemorySecureStore();
  return cached;
}

export function _resetSecureStoreForTests(): void {
  cached = null;
}
