import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deriveAgentVaultId,
  keychainAccountForSecretKind,
  MILADY_AGENT_VAULT_SERVICE,
  resolveCanonicalStateDir,
} from "./agent-vault-id";

describe("agent-vault-id", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses MILADY_AGENT_VAULT_SERVICE constant for docs parity", () => {
    expect(MILADY_AGENT_VAULT_SERVICE).toBe("ai.milady.agent.vault");
  });

  it("resolveCanonicalStateDir prefers ELIZA_STATE_DIR", () => {
    const dir = path.join(os.tmpdir(), `milady-vault-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    vi.stubEnv("ELIZA_STATE_DIR", dir);
    try {
      expect(resolveCanonicalStateDir()).toBe(fs.realpathSync(dir));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("deriveAgentVaultId is stable for the same canonical dir", () => {
    const dir = path.join(os.tmpdir(), `milady-vault2-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    const real = fs.realpathSync(dir);
    vi.stubEnv("ELIZA_STATE_DIR", dir);
    const a = deriveAgentVaultId(real);
    const b = deriveAgentVaultId(real);
    expect(a).toBe(b);
    expect(a.startsWith("mldy1-")).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("keychainAccountForSecretKind encodes vault + kind", () => {
    expect(
      keychainAccountForSecretKind("mldy1-abc", "wallet.evm_private_key"),
    ).toBe("mldy1-abc:wallet.evm_private_key");
  });
});
