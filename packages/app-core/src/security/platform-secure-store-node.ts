/**
 * ## SECURITY — macOS Keychain writes
 *
 * **`security add-generic-password -w`** puts the secret on the child **argv** (visible in `ps`).
 * **Writes** therefore use a small **Security.framework** helper (`milady-keychain-store`) that reads
 * the secret on **stdin** — same model as **Linux** `secret-tool store` (`secretToolStoreWithStdin`).
 * **Reads** still use `security find-generic-password -w`, which prints the secret to the pipe (not
 * argv). **Build:** `packages/app-core/native/macos/milady-keychain-store` (`swift build -c release`)
 * or set **`MILADY_MACOS_KEYCHAIN_HELPER`** to the binary path. See
 * `docs/guides/platform-secure-store.md`.
 */
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import { access, constants as fsConstants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  keychainAccountForSecretKind,
  MILADY_AGENT_VAULT_SERVICE,
} from "./agent-vault-id";
import type {
  PlatformSecureStore,
  PlatformSecureStoreBackend,
  SecureStoreGetResult,
  SecureStoreSecretKind,
  SecureStoreSetResult,
} from "./platform-secure-store";

const execFileAsync = promisify(execFile);

function isDarwin(): boolean {
  return process.platform === "darwin";
}

function isLinux(): boolean {
  return process.platform === "linux";
}

function secretToolStoreWithStdin(
  args: string[],
  secretLine: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("secret-tool", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        Object.assign(
          new Error(stderr.trim() || `secret-tool exited ${code}`),
          {
            stderr,
            code,
          },
        ),
      );
    });
    const line = secretLine.endsWith("\n") ? secretLine : `${secretLine}\n`;
    child.stdin.write(line, "utf8");
    child.stdin.end();
  });
}

function resolveMacosKeychainStoreHelper(): string | null {
  const envPath = process.env.MILADY_MACOS_KEYCHAIN_HELPER?.trim();
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidate = path.resolve(
    here,
    "../../native/macos/milady-keychain-store/.build/release/milady-keychain-store",
  );
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  return null;
}

/** Store generic Keychain password via Security.framework helper (secret on stdin, not argv). */
function macKeychainStoreWithStdin(
  service: string,
  account: string,
  secretLine: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const helper = resolveMacosKeychainStoreHelper();
    if (!helper) {
      reject(
        new Error(
          "macOS keychain helper missing: build packages/app-core/native/macos/milady-keychain-store (swift build -c release) or set MILADY_MACOS_KEYCHAIN_HELPER",
        ),
      );
      return;
    }
    const child = spawn(helper, [service, account], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        Object.assign(
          new Error(stderr.trim() || `milady-keychain-store exited ${code}`),
          {
            stderr,
            code,
          },
        ),
      );
    });
    const line = secretLine.endsWith("\n") ? secretLine : `${secretLine}\n`;
    child.stdin.write(line, "utf8");
    child.stdin.end();
  });
}

/** True if `secret-tool` is on `PATH` and executable — no shell (security-sensitive probe). */
async function secretToolOnPath(): Promise<boolean> {
  if (process.platform === "win32") return false;
  const segments = (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean);
  for (const dir of segments) {
    const candidate = path.join(dir, "secret-tool");
    try {
      await access(candidate, fsConstants.X_OK);
      return true;
    } catch {
      /* try next PATH segment */
    }
  }
  return false;
}

function macErrReason(
  stderr: string,
  code: number | null,
): SecureStoreGetResult {
  const s = stderr.toLowerCase();
  if (
    s.includes("could not be found") ||
    s.includes("the specified item could not be found")
  ) {
    return { ok: false, reason: "not_found" };
  }
  if (s.includes("user canceled") || s.includes("user cancelled")) {
    return { ok: false, reason: "denied" };
  }
  return {
    ok: false,
    reason: code === 44 || code === 45 ? "denied" : "error",
    message: stderr.trim().slice(0, 300),
  };
}

class MacOSKeychainPlatformSecureStore implements PlatformSecureStore {
  readonly backend: PlatformSecureStoreBackend = "macos_keychain";

  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync("security", ["-h"], { encoding: "utf8" });
      return true;
    } catch {
      return false;
    }
  }

  async get(
    vaultId: string,
    kind: SecureStoreSecretKind,
  ): Promise<SecureStoreGetResult> {
    const account = keychainAccountForSecretKind(vaultId, kind);
    try {
      const { stdout } = await execFileAsync(
        "security",
        [
          "find-generic-password",
          "-s",
          MILADY_AGENT_VAULT_SERVICE,
          "-a",
          account,
          "-w",
        ],
        { encoding: "utf8" },
      );
      const value = stdout.trim();
      if (!value) {
        return { ok: false, reason: "not_found" };
      }
      return { ok: true, value };
    } catch (err: unknown) {
      const e = err as { stderr?: string; code?: number };
      return macErrReason(String(e.stderr ?? err), e.code ?? null);
    }
  }

  async set(
    vaultId: string,
    kind: SecureStoreSecretKind,
    value: string,
  ): Promise<SecureStoreSetResult> {
    const account = keychainAccountForSecretKind(vaultId, kind);
    try {
      await macKeychainStoreWithStdin(
        MILADY_AGENT_VAULT_SERVICE,
        account,
        value,
      );
      return { ok: true };
    } catch (err: unknown) {
      const stderr = String((err as { stderr?: string }).stderr ?? err);
      return {
        ok: false,
        reason: "error",
        message: stderr.trim().slice(0, 300),
      };
    }
  }

  async delete(vaultId: string, kind: SecureStoreSecretKind): Promise<void> {
    const account = keychainAccountForSecretKind(vaultId, kind);
    try {
      await execFileAsync("security", [
        "delete-generic-password",
        "-s",
        MILADY_AGENT_VAULT_SERVICE,
        "-a",
        account,
      ]);
    } catch {
      // ignore — item may not exist
    }
  }
}

/** Linux: `secret-tool` from libsecret (GNOME Keyring / KWallet Secret Service). */
class LinuxSecretToolPlatformSecureStore implements PlatformSecureStore {
  readonly backend: PlatformSecureStoreBackend = "linux_secret_service";

  async isAvailable(): Promise<boolean> {
    return secretToolOnPath();
  }

  private account(vaultId: string, kind: SecureStoreSecretKind): string {
    return keychainAccountForSecretKind(vaultId, kind);
  }

  async get(
    vaultId: string,
    kind: SecureStoreSecretKind,
  ): Promise<SecureStoreGetResult> {
    const account = this.account(vaultId, kind);
    try {
      const { stdout } = await execFileAsync(
        "secret-tool",
        ["lookup", "service", MILADY_AGENT_VAULT_SERVICE, "account", account],
        { encoding: "utf8" },
      );
      const value = stdout.trim();
      if (!value) return { ok: false, reason: "not_found" };
      return { ok: true, value };
    } catch (err: unknown) {
      const e = err as { stderr?: string; code?: number };
      const stderr = String(e.stderr ?? "");
      if (e.code === 1 || stderr.includes("not found")) {
        return { ok: false, reason: "not_found" };
      }
      return {
        ok: false,
        reason: "error",
        message: stderr.trim().slice(0, 300),
      };
    }
  }

  async set(
    vaultId: string,
    kind: SecureStoreSecretKind,
    value: string,
  ): Promise<SecureStoreSetResult> {
    const account = this.account(vaultId, kind);
    try {
      await secretToolStoreWithStdin(
        [
          "store",
          "--label=Milady agent wallet",
          "service",
          MILADY_AGENT_VAULT_SERVICE,
          "account",
          account,
        ],
        value,
      );
      return { ok: true };
    } catch (err: unknown) {
      const e = err as { stderr?: string };
      return {
        ok: false,
        reason: "error",
        message: String(e.stderr ?? err)
          .trim()
          .slice(0, 300),
      };
    }
  }

  async delete(vaultId: string, kind: SecureStoreSecretKind): Promise<void> {
    const account = this.account(vaultId, kind);
    try {
      await execFileAsync("secret-tool", [
        "clear",
        "service",
        MILADY_AGENT_VAULT_SERVICE,
        "account",
        account,
      ]);
    } catch {
      // ignore
    }
  }
}

class NonePlatformSecureStore implements PlatformSecureStore {
  constructor(readonly backend: PlatformSecureStoreBackend = "none") {}

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async get(): Promise<SecureStoreGetResult> {
    return { ok: false, reason: "unavailable" };
  }

  async set(): Promise<SecureStoreSetResult> {
    return { ok: false, reason: "unavailable" };
  }

  async delete(): Promise<void> {}
}

/**
 * Node-side factory: macOS Keychain, Linux `secret-tool`, or unavailable placeholder.
 * Windows Credential Manager is not wired yet (`none`).
 */
export function createNodePlatformSecureStore(): PlatformSecureStore {
  if (isDarwin()) {
    return new MacOSKeychainPlatformSecureStore();
  }
  if (isLinux()) {
    return new LinuxSecretToolPlatformSecureStore();
  }
  return new NonePlatformSecureStore();
}

/**
 * Opt-in: set `MILADY_WALLET_OS_STORE=1` / `true` / `on` / `yes` to hydrate wallet keys from the
 * OS store into `process.env` at API startup. Unset defaults to **off** (keys stay out of the process
 * unless explicitly enabled). `0` / `false` / `off` / `no` keep reads disabled.
 */
export function isWalletOsStoreReadEnabled(): boolean {
  const raw = process.env.MILADY_WALLET_OS_STORE?.trim().toLowerCase();
  if (!raw) return false;
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") {
    return false;
  }
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}
