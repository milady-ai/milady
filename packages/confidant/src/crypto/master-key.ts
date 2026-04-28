import { execFileSync } from "node:child_process";
import { generateMasterKey, KEY_BYTES } from "./envelope.js";

/**
 * Source of the master key for the FileBackend's at-rest encryption.
 *
 * - `keyring`: 32 bytes stored as a single OS-keychain entry (macOS only in
 *   phase 0). The recommended source on platforms that support it.
 * - `inMemory`: 32-byte buffer supplied by the caller. Intended for tests.
 * - Future: `passphrase` (Argon2id-derived) for headless / non-keyring hosts.
 */

export interface MasterKeyResolver {
  readonly load: () => Promise<Buffer>;
  readonly describe: () => string;
}

export class MasterKeyUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MasterKeyUnavailableError";
  }
}

export function inMemoryMasterKey(key: Buffer): MasterKeyResolver {
  if (key.length !== KEY_BYTES) {
    throw new MasterKeyUnavailableError(
      `inMemoryMasterKey: expected ${KEY_BYTES} bytes, got ${key.length}`,
    );
  }
  return {
    load: async () => key,
    describe: () => "inMemory",
  };
}

export interface KeyringMasterKeyOptions {
  /** Service name shown in macOS Keychain Access. */
  readonly service: string;
  /** Account name within the service. */
  readonly account: string;
}

/**
 * macOS-only resolver. On other platforms the load throws — callers should
 * fall through to a passphrase-based resolver (future) or `inMemory` for
 * tests.
 */
export function macOSKeychainMasterKey(
  opts: KeyringMasterKeyOptions,
): MasterKeyResolver {
  return {
    load: async () => loadOrCreateMacOSKeychainEntry(opts),
    describe: () => `keyring://${opts.service}/${opts.account}`,
  };
}

function loadOrCreateMacOSKeychainEntry(
  opts: KeyringMasterKeyOptions,
): Buffer {
  if (process.platform !== "darwin") {
    throw new MasterKeyUnavailableError(
      `macOS keychain master key requested on platform ${process.platform}; pass a different MasterKeyResolver.`,
    );
  }
  const existing = readKeychainEntry(opts);
  if (existing) {
    const buf = Buffer.from(existing, "base64");
    if (buf.length !== KEY_BYTES) {
      throw new MasterKeyUnavailableError(
        `keychain entry ${opts.service}/${opts.account} is not a ${KEY_BYTES}-byte key (got ${buf.length} bytes after base64 decode). Refusing to use.`,
      );
    }
    return buf;
  }
  const created = generateMasterKey();
  writeKeychainEntry(opts, created.toString("base64"));
  return created;
}

function readKeychainEntry(opts: KeyringMasterKeyOptions): string | null {
  try {
    const output = execFileSync(
      "security",
      [
        "find-generic-password",
        "-s",
        opts.service,
        "-a",
        opts.account,
        "-w",
      ],
      { encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] },
    );
    const trimmed = output.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function writeKeychainEntry(
  opts: KeyringMasterKeyOptions,
  base64Value: string,
): void {
  execFileSync(
    "security",
    [
      "add-generic-password",
      "-s",
      opts.service,
      "-a",
      opts.account,
      "-w",
      base64Value,
      "-U", // update if exists
    ],
    { encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] },
  );
}
