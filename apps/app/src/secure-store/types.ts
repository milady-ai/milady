/**
 * SecureStore — single abstraction for persisting sensitive client-side
 * values (auth tokens, device identity, API keys, vision-consent decisions).
 *
 * Backends in priority order:
 *   1. Native secure-storage (iOS Keychain / Android EncryptedSharedPreferences)
 *      via Capacitor SecureStorage plugin.
 *   2. Electrobun keychain bridge (desktop).
 *   3. Browser fallback: passphrase-derived AES-GCM via WebCrypto +
 *      scrypt KDF. Raw secrets are NEVER stored in localStorage.
 *
 * SOC2 refs: CC6.1, C1.1.
 */

export type SecureStoreBackend =
  | "capacitor-secure"
  | "electrobun-keychain"
  | "webcrypto-passphrase"
  | "memory";

export interface SecureStore {
  readonly backend: SecureStoreBackend;
  /** Retrieve a previously-stored value. Returns null if absent. */
  get(key: string): Promise<string | null>;
  /** Persist a value. Overwrites existing. */
  set(key: string, value: string): Promise<void>;
  /** Remove a value. No-op if absent. */
  remove(key: string): Promise<void>;
  /** True if the backend is genuinely encrypted at rest. */
  readonly isEncryptedAtRest: boolean;
}

/**
 * Keys that hold sensitive material and must live in SecureStore — never
 * in plain localStorage. Migration from legacy localStorage happens once
 * on first launch (see `migrateLegacyLocalStorage`).
 */
export const SENSITIVE_KEYS: readonly string[] = [
  "eliza.device.auth",
  "eliza.device.identity",
  "eliza.control.settings.v1",
  // Vision-consent decisions are not secrets but must be tamper-resistant.
  "eliza.security.vision-consent.v1",
] as const;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.includes(key);
}
