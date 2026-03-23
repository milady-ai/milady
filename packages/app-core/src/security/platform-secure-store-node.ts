/**
 * ## SECURITY — macOS Keychain writes (`security add-generic-password`)
 *
 * For **non-interactive** use, Apple’s CLI expects the password via **`-w <value>`**. Alternatives
 * discussed in review (stdin pipe, `sh` + temp file + `cat`) still end up passing the secret on the
 * **`security` process argv** when the tool is invoked, or they rely on a TTY prompt that Node does
 * not provide. **Hex (`-X`)** is still reversible and ends up on argv.
 *
 * **Accepted residual risk (this Node backend):** the private key is visible in **`ps` to the same
 * user (and root)** for the short lifetime of the `security` child — same class of exposure as many
 * shell Keychain examples. **Linux** uses `secret-tool` with **stdin** (`secretToolStoreWithStdin`),
 * which avoids argv for the secret bytes. **Follow-up:** call **Security.framework** / **SecItemAdd**
 * via a small native helper or **Bun FFI** so secrets never cross argv — see
 * `docs/guides/platform-secure-store.md` (macOS Node implementation + accepted risk).
 */
import { execFile, spawn } from "node:child_process";
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

async function secretToolOnPath(): Promise<boolean> {
  if (process.platform === "win32") return false;
  try {
    await execFileAsync("sh", ["-c", "command -v secret-tool >/dev/null 2>&1"]);
    return true;
  } catch {
    return false;
  }
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
      await execFileAsync(
        "security",
        [
          "add-generic-password",
          "-s",
          MILADY_AGENT_VAULT_SERVICE,
          "-a",
          account,
          "-w",
          value,
          "-U",
        ],
        { encoding: "utf8" },
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

/** Opt out: `MILADY_WALLET_OS_STORE=0` / `false` / `off`. */
export function isWalletOsStoreReadEnabled(): boolean {
  const raw = process.env.MILADY_WALLET_OS_STORE?.trim().toLowerCase();
  if (!raw) return true;
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
}
