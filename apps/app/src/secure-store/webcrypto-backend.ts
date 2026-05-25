/**
 * Browser fallback backend: AES-256-GCM via WebCrypto, key derived from a
 * user passphrase using PBKDF2 (scrypt is not yet in WebCrypto — PBKDF2
 * with high iteration count is the defensible substitute).
 *
 * Ciphertext + nonce + salt are stored under a single namespaced key in
 * localStorage. Raw secrets never touch localStorage.
 */

import type { SecureStore } from "./types.js";

const STORAGE_NAMESPACE = "eliza.secure.v1";
const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 guidance for PBKDF2-SHA256.
const AES_KEY_LENGTH = 256;
const SALT_BYTES = 16;
const NONCE_BYTES = 12;

interface StoredEnvelope {
  v: 1;
  salt: string;
  nonce: string;
  ct: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface WebCryptoBackendOptions {
  /** Resolve the user passphrase. Required — no fallback. */
  getPassphrase: () => Promise<string>;
  /** Optional override of the storage backend (defaults to window.localStorage). */
  storage?: Storage;
}

export class WebCryptoSecureStore implements SecureStore {
  readonly backend = "webcrypto-passphrase" as const;
  readonly isEncryptedAtRest = true;

  private readonly storage: Storage;
  private readonly getPassphrase: () => Promise<string>;

  constructor(opts: WebCryptoBackendOptions) {
    this.getPassphrase = opts.getPassphrase;
    const fallback: Storage | undefined =
      opts.storage ??
      (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!fallback) {
      throw new Error(
        "[WebCryptoSecureStore] no Storage available; pass opts.storage",
      );
    }
    this.storage = fallback;
  }

  private storageKey(key: string): string {
    return `${STORAGE_NAMESPACE}:${key}`;
  }

  async get(key: string): Promise<string | null> {
    const raw = this.storage.getItem(this.storageKey(key));
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as StoredEnvelope;
    if (envelope.v !== 1) {
      throw new Error(
        `[WebCryptoSecureStore] unsupported envelope v=${envelope.v}`,
      );
    }
    const salt = fromBase64(envelope.salt);
    const nonce = fromBase64(envelope.nonce);
    const ct = fromBase64(envelope.ct);
    const passphrase = await this.getPassphrase();
    const cryptoKey = await deriveKey(passphrase, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      cryptoKey,
      ct as BufferSource,
    );
    return new TextDecoder().decode(plaintext);
  }

  async set(key: string, value: string): Promise<void> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
    const passphrase = await this.getPassphrase();
    const cryptoKey = await deriveKey(passphrase, salt);
    const ct = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce as BufferSource },
        cryptoKey,
        new TextEncoder().encode(value),
      ),
    );
    const envelope: StoredEnvelope = {
      v: 1,
      salt: toBase64(salt),
      nonce: toBase64(nonce),
      ct: toBase64(ct),
    };
    this.storage.setItem(this.storageKey(key), JSON.stringify(envelope));
  }

  async remove(key: string): Promise<void> {
    this.storage.removeItem(this.storageKey(key));
  }
}
