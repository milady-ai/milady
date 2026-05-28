/**
 * Electrobun (desktop) keychain backend.
 *
 * Electrobun exposes a host-process bridge for OS keychain access (macOS
 * Keychain, Windows Credential Manager, Linux libsecret / GNOME Keyring).
 * The bridge surface is injected onto `window` by the runtime; this module
 * is capability-detected so the same code runs in the browser/mobile builds
 * without the desktop dependency being present.
 */

import type { SecureStore } from "./types.js";

interface ElectrobunKeychainBridge {
  keychainGet(service: string, account: string): Promise<string | null>;
  keychainSet(service: string, account: string, value: string): Promise<void>;
  keychainDelete(service: string, account: string): Promise<void>;
}

const KEYCHAIN_SERVICE = "ai.eliza.app";

export interface ElectrobunBackendOptions {
  bridge: ElectrobunKeychainBridge;
  service?: string;
}

export class ElectrobunSecureStore implements SecureStore {
  readonly backend = "electrobun-keychain" as const;
  readonly isEncryptedAtRest = true;

  private readonly bridge: ElectrobunKeychainBridge;
  private readonly service: string;

  constructor(opts: ElectrobunBackendOptions) {
    this.bridge = opts.bridge;
    this.service = opts.service ?? KEYCHAIN_SERVICE;
  }

  async get(key: string): Promise<string | null> {
    return this.bridge.keychainGet(this.service, key);
  }

  async set(key: string, value: string): Promise<void> {
    await this.bridge.keychainSet(this.service, key, value);
  }

  async remove(key: string): Promise<void> {
    await this.bridge.keychainDelete(this.service, key);
  }
}

interface ElectrobunWindow extends Window {
  __ELIZA_KEYCHAIN_BRIDGE__?: ElectrobunKeychainBridge;
}

/**
 * Detect the bridge if injected by the Electrobun host. Returns null when
 * running outside Electrobun (browser, mobile).
 */
export function detectElectrobunKeychain(): ElectrobunKeychainBridge | null {
  if (typeof window === "undefined") return null;
  const w = window as ElectrobunWindow;
  return w.__ELIZA_KEYCHAIN_BRIDGE__ ?? null;
}
