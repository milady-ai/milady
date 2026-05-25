/**
 * Capacitor native-platform backend.
 *
 * Uses the Capacitor SecureStorage plugin when available. On iOS this maps
 * to the system Keychain (kSecClassGenericPassword, kSecAttrAccessible:
 * AfterFirstUnlockThisDeviceOnly). On Android it maps to
 * EncryptedSharedPreferences backed by AndroidKeyStore.
 *
 * If the plugin is not registered (e.g. user has not installed it yet) the
 * factory falls back to the next backend. This module deliberately uses a
 * dynamic, capability-detected interface rather than a static import so the
 * web bundle does not require the native dependency.
 */

import type { SecureStore } from "./types.js";

interface CapacitorSecureStoragePlugin {
  get(opts: { key: string }): Promise<{ value: string | null }>;
  set(opts: { key: string; value: string }): Promise<void>;
  remove(opts: { key: string }): Promise<void>;
}

export interface CapacitorBackendOptions {
  plugin: CapacitorSecureStoragePlugin;
}

export class CapacitorSecureStore implements SecureStore {
  readonly backend = "capacitor-secure" as const;
  readonly isEncryptedAtRest = true;

  private readonly plugin: CapacitorSecureStoragePlugin;

  constructor(opts: CapacitorBackendOptions) {
    this.plugin = opts.plugin;
  }

  async get(key: string): Promise<string | null> {
    const result = await this.plugin.get({ key });
    return result.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.plugin.set({ key, value });
  }

  async remove(key: string): Promise<void> {
    await this.plugin.remove({ key });
  }
}
