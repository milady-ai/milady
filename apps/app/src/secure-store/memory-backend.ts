/**
 * In-memory backend. Used only as a last-resort fallback (e.g. tests, or
 * browser contexts where no passphrase has been configured yet). Values do
 * NOT survive a page reload, which is deliberate — losing volatile state is
 * preferable to writing plaintext secrets to disk.
 */

import type { SecureStore } from "./types.js";

export class MemorySecureStore implements SecureStore {
  readonly backend = "memory" as const;
  readonly isEncryptedAtRest = false;
  private readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }
}
