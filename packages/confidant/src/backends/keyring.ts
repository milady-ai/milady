import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseReference } from "../references.js";
import type { VaultReference } from "../types.js";
import {
  BackendError,
  BackendNotConfiguredError,
  type VaultBackend,
} from "./types.js";

const exec = promisify(execFile);

/**
 * KeyringBackend persists literals as OS-keychain entries. Reference shape:
 *   keyring://{service}/{account}
 *
 * Phase 0: macOS only. Windows / Linux throw `BackendNotConfiguredError` so
 * higher layers can degrade to FileBackend without ambiguity. Adding the
 * other two platforms is mechanical and tracked separately.
 *
 * `service` defaults are decided by the caller (the runtime supplies a
 * branding-aware service name like `elizaos`). The backend itself is dumb:
 * it executes /usr/bin/security with argv arrays — no shell interpolation.
 */
export class KeyringBackend implements VaultBackend {
  readonly source = "keyring" as const;

  async resolve(ref: VaultReference): Promise<string> {
    const { service, account } = parseKeyringRef(ref);
    if (process.platform !== "darwin") {
      throw new BackendNotConfiguredError(
        this.source,
        `OS keyring access on platform ${process.platform} is not implemented in phase 0; use the file backend or supply a different backend.`,
      );
    }
    const { stdout } = await exec(
      "security",
      ["find-generic-password", "-s", service, "-a", account, "-w"],
      { encoding: "utf8", timeout: 5000 },
    );
    const value = stdout.trim();
    if (value.length === 0) {
      throw new BackendError(
        this.source,
        `keychain entry ${service}/${account} is empty`,
      );
    }
    return value;
  }

  async store(id: string, value: string): Promise<VaultReference> {
    if (process.platform !== "darwin") {
      throw new BackendNotConfiguredError(
        this.source,
        `OS keyring access on platform ${process.platform} is not implemented in phase 0`,
      );
    }
    const service = "elizaos";
    const account = id;
    await exec(
      "security",
      [
        "add-generic-password",
        "-s",
        service,
        "-a",
        account,
        "-w",
        value,
        "-U",
      ],
      { encoding: "utf8", timeout: 5000 },
    );
    return `keyring://${service}/${account}`;
  }

  async remove(ref: VaultReference): Promise<void> {
    if (process.platform !== "darwin") {
      throw new BackendNotConfiguredError(
        this.source,
        `OS keyring access on platform ${process.platform} is not implemented in phase 0`,
      );
    }
    const { service, account } = parseKeyringRef(ref);
    try {
      await exec(
        "security",
        ["delete-generic-password", "-s", service, "-a", account],
        { encoding: "utf8", timeout: 5000 },
      );
    } catch (err) {
      // `security delete-generic-password` exits 44 when the entry doesn't
      // exist — idempotent removal is the contract callers expect.
      const code = (err as { code?: number | string }).code;
      if (code === 44 || code === "44") return;
      throw err;
    }
  }
}

function parseKeyringRef(ref: VaultReference): {
  service: string;
  account: string;
} {
  const parsed = parseReference(ref);
  if (parsed.source !== "keyring") {
    throw new BackendError("keyring", `cannot resolve ref ${ref}`);
  }
  const slash = parsed.path.indexOf("/");
  if (slash <= 0 || slash === parsed.path.length - 1) {
    throw new BackendError(
      "keyring",
      `keyring reference ${JSON.stringify(ref)} must be keyring://<service>/<account>`,
    );
  }
  return {
    service: parsed.path.slice(0, slash),
    account: parsed.path.slice(slash + 1),
  };
}
