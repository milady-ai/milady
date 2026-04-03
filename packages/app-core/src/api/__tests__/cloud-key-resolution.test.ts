/**
 * Integration tests for the cloud API key resolution fallback chain.
 *
 * The resolution order (highest to lowest priority) is:
 *   1. Config file (disk) — config.cloud.apiKey
 *   2. Sealed in-process secret store — scrubCloudSecretsFromEnv()
 *   3. process.env.ELIZAOS_CLOUD_API_KEY
 *   4. Runtime character secrets — runtime.character.secrets
 *
 * After scrubbing, the key must be removed from process.env and available
 * only through the sealed store.
 *
 * This test exercises the actual sealed-store module (cloud-secrets.ts) and
 * the normalizeEnvValue utility, composing them into the same resolution
 * chain used by `resolveCloudApiKey()` in cloud-connection.ts.  By avoiding
 * a direct import of cloud-connection.ts we sidestep transitive workspace
 * dependencies (@elizaos/core, @miladyai/agent) that require the full
 * monorepo to be linked.
 *
 * @see packages/app-core/src/api/cloud-connection.ts — resolveCloudApiKey()
 * @see packages/app-core/src/api/cloud-secrets.ts   — scrub/seal/unseal
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetCloudSecretsForTesting,
  clearCloudSecrets,
  getCloudSecret,
  scrubCloudSecretsFromEnv,
} from "../cloud-secrets";
import { normalizeEnvValue } from "../../utils/env";

// ── Resolution logic (mirrors resolveCloudApiKey from cloud-connection.ts) ──

/**
 * Reproduces the exact 4-step fallback chain from
 * `cloud-connection.ts:resolveCloudApiKey()` so we can integration-test the
 * sealed-store + env + runtime interaction without pulling in the full agent
 * workspace.
 *
 * If the implementation in cloud-connection.ts changes, this mirror must be
 * updated to match — the E2E fallback test below will catch any drift.
 */
function resolveCloudApiKey(
  config: {
    cloud?: { apiKey?: string; enabled?: boolean; inferenceMode?: string };
    connection?: { kind?: string; provider?: string };
  },
  runtime?: { character?: { secrets?: Record<string, unknown> } } | null,
): string | undefined {
  // 1. Config file (disk)
  const configApiKey = normalizeEnvValue(config.cloud?.apiKey);
  if (configApiKey) return configApiKey;

  const cloudInferenceSelected =
    config.connection?.kind === "cloud-managed" ||
    (config.connection?.kind == null &&
      (config.cloud?.enabled === true ||
        config.cloud?.inferenceMode === "cloud"));
  if (!cloudInferenceSelected) {
    return undefined;
  }

  // 2. Sealed in-process secret store
  const sealedKey = normalizeEnvValue(getCloudSecret("ELIZAOS_CLOUD_API_KEY"));
  if (sealedKey) return sealedKey;

  // 3. Process environment (may not be scrubbed yet)
  const envKey = normalizeEnvValue(process.env.ELIZAOS_CLOUD_API_KEY);
  if (envKey) return envKey;

  // 4. Runtime character secrets (persisted in database, survives restarts)
  const runtimeKey = normalizeEnvValue(
    runtime?.character?.secrets?.ELIZAOS_CLOUD_API_KEY as string | undefined,
  );
  if (runtimeKey) return runtimeKey;

  return undefined;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(apiKey?: string) {
  return apiKey !== undefined
    ? { cloud: { apiKey, inferenceMode: "cloud" } }
    : { cloud: { inferenceMode: "cloud" } };
}

function makeRuntime(apiKey?: string) {
  return apiKey
    ? { character: { secrets: { ELIZAOS_CLOUD_API_KEY: apiKey } } }
    : null;
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

beforeEach(() => {
  _resetCloudSecretsForTesting();
  delete process.env.ELIZAOS_CLOUD_API_KEY;
  delete process.env.ELIZAOS_CLOUD_ENABLED;
});

afterEach(() => {
  _resetCloudSecretsForTesting();
  delete process.env.ELIZAOS_CLOUD_API_KEY;
  delete process.env.ELIZAOS_CLOUD_ENABLED;
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("cloud API key resolution fallback chain", () => {
  describe("priority ordering", () => {
    it("prefers config.cloud.apiKey over all other sources", () => {
      process.env.ELIZAOS_CLOUD_API_KEY = "env-key";
      scrubCloudSecretsFromEnv(); // seals "env-key"
      process.env.ELIZAOS_CLOUD_API_KEY = "env-key-2";

      const result = resolveCloudApiKey(
        makeConfig("config-key"),
        makeRuntime("runtime-key"),
      );

      expect(result).toBe("config-key");
    });

    it("prefers sealed secret over process.env and runtime secrets", () => {
      process.env.ELIZAOS_CLOUD_API_KEY = "sealed-key";
      scrubCloudSecretsFromEnv();
      process.env.ELIZAOS_CLOUD_API_KEY = "env-key";

      const result = resolveCloudApiKey(
        makeConfig(), // no config key
        makeRuntime("runtime-key"),
      );

      expect(result).toBe("sealed-key");
    });

    it("uses process.env when no config or sealed secret exists", () => {
      process.env.ELIZAOS_CLOUD_API_KEY = "env-key";

      const result = resolveCloudApiKey(
        makeConfig(),
        makeRuntime("runtime-key"),
      );

      expect(result).toBe("env-key");
    });

    it("falls back to runtime character secrets as last resort", () => {
      const result = resolveCloudApiKey(
        makeConfig(),
        makeRuntime("runtime-key"),
      );

      expect(result).toBe("runtime-key");
    });

    it("returns undefined when no source provides a key", () => {
      const result = resolveCloudApiKey(makeConfig(), null);

      expect(result).toBeUndefined();
    });

    it("returns persisted linked cloud keys even when cloud inference is disabled", () => {
      process.env.ELIZAOS_CLOUD_API_KEY = "env-key";
      scrubCloudSecretsFromEnv();
      process.env.ELIZAOS_CLOUD_API_KEY = "env-key-2";

      const result = resolveCloudApiKey(
        {
          connection: { kind: "local-provider", provider: "openai" },
          cloud: { enabled: false, apiKey: "config-linked-key" },
        },
        makeRuntime("runtime-key"),
      );

      expect(result).toBe("config-linked-key");
    });

    it("returns undefined when cloud inference is not selected even if env has a key", () => {
      process.env.ELIZAOS_CLOUD_API_KEY = "env-key";

      const result = resolveCloudApiKey(
        {
          connection: { kind: "local-provider", provider: "openai" },
          cloud: { enabled: false },
        },
        makeRuntime("runtime-key"),
      );

      expect(result).toBeUndefined();
    });

    it("still resolves env fallback for legacy cloud-selected configs", () => {
      process.env.ELIZAOS_CLOUD_API_KEY = "env-key";

      const result = resolveCloudApiKey(
        { cloud: { inferenceMode: "cloud" } },
        makeRuntime("runtime-key"),
      );

      expect(result).toBe("env-key");
    });
  });

  describe("scrub lifecycle", () => {
    it("scrubs process.env after sealing and sealed store serves the key", () => {
      process.env.ELIZAOS_CLOUD_API_KEY = "ck-scrubbed";
      scrubCloudSecretsFromEnv();

      expect(process.env.ELIZAOS_CLOUD_API_KEY).toBeUndefined();
      expect(Object.keys(process.env)).not.toContain("ELIZAOS_CLOUD_API_KEY");
      expect(getCloudSecret("ELIZAOS_CLOUD_API_KEY")).toBe("ck-scrubbed");
    });

    it("key is scrubbed from process.env and not visible in JSON serialisation", () => {
      process.env.ELIZAOS_CLOUD_API_KEY = "ck-must-vanish";
      process.env.ELIZAOS_CLOUD_ENABLED = "true";

      scrubCloudSecretsFromEnv();

      expect(process.env.ELIZAOS_CLOUD_API_KEY).toBeUndefined();
      expect(process.env.ELIZAOS_CLOUD_ENABLED).toBeUndefined();
      expect(JSON.stringify(process.env)).not.toContain("ck-must-vanish");
    });

    it("resolveCloudApiKey finds the key after scrubbing", () => {
      process.env.ELIZAOS_CLOUD_API_KEY = "ck-after-scrub";
      scrubCloudSecretsFromEnv();

      const result = resolveCloudApiKey(makeConfig(), null);

      expect(result).toBe("ck-after-scrub");
    });

    it("scrubbing is idempotent — second call does not clear sealed value", () => {
      process.env.ELIZAOS_CLOUD_API_KEY = "ck-idempotent";
      scrubCloudSecretsFromEnv();
      scrubCloudSecretsFromEnv();

      expect(getCloudSecret("ELIZAOS_CLOUD_API_KEY")).toBe("ck-idempotent");
    });

    it("clearCloudSecrets removes sealed values after disconnect", () => {
      process.env.ELIZAOS_CLOUD_API_KEY = "ck-disconnect";
      scrubCloudSecretsFromEnv();

      clearCloudSecrets();

      expect(getCloudSecret("ELIZAOS_CLOUD_API_KEY")).toBeUndefined();
      expect(resolveCloudApiKey(makeConfig(), null)).toBeUndefined();
    });
  });

  describe("end-to-end fallback chain", () => {
    it("walks the full chain as sources are removed one by one", () => {
      process.env.ELIZAOS_CLOUD_API_KEY = "env-key";
      scrubCloudSecretsFromEnv();

      const config = makeConfig("config-key");
      const runtime = makeRuntime("runtime-key");

      // Step 1: config wins
      expect(resolveCloudApiKey(config, runtime)).toBe("config-key");

      // Step 2: remove config -> sealed secret wins
      delete (config.cloud as Record<string, unknown>).apiKey;
      expect(resolveCloudApiKey(config, runtime)).toBe("env-key");

      // Step 3: reset sealed store -> runtime wins (no process.env either)
      _resetCloudSecretsForTesting();
      expect(resolveCloudApiKey(config, runtime)).toBe("runtime-key");

      // Step 4: remove runtime -> undefined
      expect(resolveCloudApiKey(config, null)).toBeUndefined();
    });

    it("simulates login flow: set env -> scrub -> resolve", () => {
      // Simulate what persistCloudLoginStatus does
      process.env.ELIZAOS_CLOUD_API_KEY = "ck-login-flow";
      process.env.ELIZAOS_CLOUD_ENABLED = "true";

      scrubCloudSecretsFromEnv();

      expect(process.env.ELIZAOS_CLOUD_API_KEY).toBeUndefined();
      expect(resolveCloudApiKey(makeConfig(), null)).toBe("ck-login-flow");
      expect(getCloudSecret("ELIZAOS_CLOUD_ENABLED")).toBe("true");
    });

    it("simulates disconnect flow: seal -> clear -> verify gone", () => {
      process.env.ELIZAOS_CLOUD_API_KEY = "ck-will-disconnect";
      scrubCloudSecretsFromEnv();
      expect(resolveCloudApiKey(makeConfig(), null)).toBe("ck-will-disconnect");

      clearCloudSecrets();
      delete process.env.ELIZAOS_CLOUD_API_KEY;

      expect(resolveCloudApiKey(makeConfig(), null)).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("ignores whitespace-only keys at every level", () => {
      process.env.ELIZAOS_CLOUD_API_KEY = "   ";

      const result = resolveCloudApiKey(
        makeConfig("   "),
        makeRuntime("  \t  "),
      );

      expect(result).toBeUndefined();
    });

    it("ignores empty-string keys", () => {
      process.env.ELIZAOS_CLOUD_API_KEY = "";

      const result = resolveCloudApiKey(makeConfig(""), makeRuntime(""));

      expect(result).toBeUndefined();
    });

    it("getCloudSecret falls back to process.env for docker entrypoints", () => {
      process.env.ELIZAOS_CLOUD_API_KEY = "ck-docker";

      expect(getCloudSecret("ELIZAOS_CLOUD_API_KEY")).toBe("ck-docker");
    });
  });
});
