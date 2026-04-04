import { describe, expect, it } from "vitest";
import {
  filterConfigEnvForResponse,
  SENSITIVE_ENV_RESPONSE_KEYS,
} from "./server-config-filter.js";

describe("filterConfigEnvForResponse", () => {
  it("strips all sensitive env keys from response", () => {
    const config = {
      env: {
        EVM_PRIVATE_KEY: "0xdeadbeef",
        SOLANA_PRIVATE_KEY: "base58secret",
        ELIZA_API_TOKEN: "tok_secret",
        MILADY_API_TOKEN: "tok_milady",
        ELIZAOS_CLOUD_API_KEY: "cloud_key",
        DATABASE_URL: "postgres://user:pass@host/db",
        POSTGRES_URL: "postgres://user:pass@host/db",
        GITHUB_TOKEN: "ghp_secret",
        ELIZA_WALLET_EXPORT_TOKEN: "export_tok",
        ELIZA_TERMINAL_RUN_TOKEN: "run_tok",
        HYPERSCAPE_AUTH_TOKEN: "hyper_tok",
        // Safe keys that should remain
        OPENAI_API_KEY: "sk-safe",
        OLLAMA_BASE_URL: "http://localhost:11434",
      },
    };

    const filtered = filterConfigEnvForResponse(config);
    const env = filtered.env as Record<string, unknown>;

    // All sensitive keys must be gone
    for (const key of SENSITIVE_ENV_RESPONSE_KEYS) {
      expect(env[key], `${key} should be stripped`).toBeUndefined();
    }

    // Safe keys must remain
    expect(env.OPENAI_API_KEY).toBe("sk-safe");
    expect(env.OLLAMA_BASE_URL).toBe("http://localhost:11434");
  });

  it("is case-insensitive for sensitive key matching", () => {
    const config = {
      env: {
        evm_private_key: "0xsecret",
        Evm_Private_Key: "0xsecret2",
        SAFE_KEY: "visible",
      },
    };

    const filtered = filterConfigEnvForResponse(config);
    const env = filtered.env as Record<string, unknown>;

    expect(env.evm_private_key).toBeUndefined();
    expect(env.Evm_Private_Key).toBeUndefined();
    expect(env.SAFE_KEY).toBe("visible");
  });

  it("does not mutate the original config object", () => {
    const original = {
      env: {
        EVM_PRIVATE_KEY: "0xdeadbeef",
        SAFE: "visible",
      },
      other: "preserved",
    };

    const filtered = filterConfigEnvForResponse(original);

    // Original untouched
    expect((original.env as Record<string, string>).EVM_PRIVATE_KEY).toBe(
      "0xdeadbeef",
    );
    // Filtered has it removed
    expect(
      (filtered.env as Record<string, unknown>).EVM_PRIVATE_KEY,
    ).toBeUndefined();
    // Non-env fields preserved
    expect(filtered.other).toBe("preserved");
  });

  it("returns config as-is when env is missing", () => {
    const config = { agents: { defaults: {} } };
    expect(filterConfigEnvForResponse(config)).toEqual(config);
  });

  it("returns config as-is when env is not an object", () => {
    const config = { env: "not-an-object" };
    expect(
      filterConfigEnvForResponse(config as Record<string, unknown>),
    ).toEqual(config);
  });

  it("returns config as-is when env is an array", () => {
    const config = { env: ["a", "b"] };
    expect(
      filterConfigEnvForResponse(config as Record<string, unknown>),
    ).toEqual(config);
  });

  it("handles empty env object", () => {
    const config = { env: {} };
    const filtered = filterConfigEnvForResponse(config);
    expect(filtered.env).toEqual({});
  });
});
