import { describe, expect, it } from "vitest";
import { collectConfigEnvVars, collectConnectorEnvVars } from "./env-vars";
import type { ElizaConfig } from "./types";

/** Helper to build a partial config with only the env property. */
function cfg(env: ElizaConfig["env"]): ElizaConfig {
  return { env } as ElizaConfig;
}

describe("collectConfigEnvVars", () => {
  it("returns empty object when cfg is undefined", () => {
    expect(collectConfigEnvVars(undefined)).toEqual({});
  });

  it("returns empty object when cfg.env is undefined", () => {
    expect(collectConfigEnvVars(cfg(undefined))).toEqual({});
  });

  it("collects vars sub-object entries", () => {
    const result = collectConfigEnvVars(
      cfg({ vars: { FOO: "bar", BAZ: "qux" } }),
    );
    expect(result).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("skips falsy values in vars", () => {
    const result = collectConfigEnvVars(
      cfg({
        vars: {
          KEEP: "hello",
          EMPTY: "",
        },
      }),
    );
    expect(result).toEqual({ KEEP: "hello" });
  });

  it("collects top-level string env entries", () => {
    const result = collectConfigEnvVars(
      cfg({ MY_VAR: "my-value", ANOTHER: "yes" }),
    );
    expect(result).toEqual({ MY_VAR: "my-value", ANOTHER: "yes" });
  });

  it("skips shellEnv and vars keys from top-level iteration", () => {
    const result = collectConfigEnvVars(
      cfg({
        shellEnv: "should-be-skipped",
        vars: { INNER: "from-vars" },
        REAL: "kept",
      }),
    );
    expect(result).toEqual({ INNER: "from-vars", REAL: "kept" });
  });

  it("returns only the string values from top-level", () => {
    const result = collectConfigEnvVars(
      cfg({
        VALID: "kept",
        ALSO_VALID: "also-kept",
      }),
    );
    expect(result).toEqual({ VALID: "kept", ALSO_VALID: "also-kept" });
  });

  it("skips empty and whitespace-only strings from top-level", () => {
    const result = collectConfigEnvVars(
      cfg({
        EMPTY: "",
        SPACES: "   ",
        TABS: "\t",
        VALID: "kept",
      }),
    );
    expect(result).toEqual({ VALID: "kept" });
  });

  it("top-level entries override vars entries for the same key", () => {
    const result = collectConfigEnvVars(
      cfg({
        vars: { SHARED: "from-vars" },
        SHARED: "from-top-level",
      }),
    );
    expect(result).toEqual({ SHARED: "from-top-level" });
  });

  it("correctly merges vars and top-level entries", () => {
    const result = collectConfigEnvVars(
      cfg({
        vars: {
          FROM_VARS: "vars-value",
          OVERRIDE_ME: "original",
        },
        FROM_TOP: "top-value",
        OVERRIDE_ME: "overridden",
        shellEnv: "ignored",
      }),
    );
    expect(result).toEqual({
      FROM_VARS: "vars-value",
      FROM_TOP: "top-value",
      OVERRIDE_ME: "overridden",
    });
  });

  // ── BLOCKED_STARTUP_ENV_KEYS (env var injection defense) ──────────────

  it("strips NODE_OPTIONS from top-level env (RCE prevention)", () => {
    const result = collectConfigEnvVars(
      cfg({ NODE_OPTIONS: "--require=/tmp/evil.js", SAFE: "kept" }),
    );
    expect(result).toEqual({ SAFE: "kept" });
    expect(result).not.toHaveProperty("NODE_OPTIONS");
  });

  it("strips LD_PRELOAD from top-level env", () => {
    const result = collectConfigEnvVars(
      cfg({ LD_PRELOAD: "/tmp/evil.so", SAFE: "kept" }),
    );
    expect(result).toEqual({ SAFE: "kept" });
    expect(result).not.toHaveProperty("LD_PRELOAD");
  });

  it("strips DYLD_INSERT_LIBRARIES from top-level env", () => {
    const result = collectConfigEnvVars(
      cfg({ DYLD_INSERT_LIBRARIES: "/tmp/evil.dylib", SAFE: "kept" }),
    );
    expect(result).toEqual({ SAFE: "kept" });
  });

  it("strips NODE_OPTIONS from vars sub-object", () => {
    const result = collectConfigEnvVars(
      cfg({ vars: { NODE_OPTIONS: "--require=/tmp/evil.js", SAFE: "kept" } }),
    );
    expect(result).toEqual({ SAFE: "kept" });
    expect(result).not.toHaveProperty("NODE_OPTIONS");
  });

  it("strips LD_PRELOAD from vars sub-object", () => {
    const result = collectConfigEnvVars(
      cfg({ vars: { LD_PRELOAD: "/tmp/evil.so", OK: "yes" } }),
    );
    expect(result).toEqual({ OK: "yes" });
  });

  it("blocks PATH, HOME, SHELL from env", () => {
    const result = collectConfigEnvVars(
      cfg({ PATH: "/evil", HOME: "/evil", SHELL: "/evil/sh", GOOD: "kept" }),
    );
    expect(result).toEqual({ GOOD: "kept" });
  });

  it("blocks case-insensitive variants (node_options)", () => {
    const result = collectConfigEnvVars(
      cfg({ node_options: "--require=/tmp/evil.js", SAFE: "kept" }),
    );
    expect(result).toEqual({ SAFE: "kept" });
    expect(result).not.toHaveProperty("node_options");
  });

  it("blocks HTTP_PROXY / HTTPS_PROXY (traffic hijack)", () => {
    const result = collectConfigEnvVars(
      cfg({
        HTTP_PROXY: "http://evil.com:8080",
        HTTPS_PROXY: "http://evil.com:8080",
        SAFE: "kept",
      }),
    );
    expect(result).toEqual({ SAFE: "kept" });
  });

  it("blocks auth tokens from being loaded", () => {
    const result = collectConfigEnvVars(
      cfg({
        ELIZA_API_TOKEN: "stolen",
        EVM_PRIVATE_KEY: "0xdead",
        SAFE: "kept",
      }),
    );
    expect(result).toEqual({ SAFE: "kept" });
  });

  it("blocks DATABASE_URL from env", () => {
    const result = collectConfigEnvVars(
      cfg({ DATABASE_URL: "postgres://evil", SAFE: "ok" }),
    );
    expect(result).toEqual({ SAFE: "ok" });
  });
});

describe("collectConnectorEnvVars", () => {
  it("maps Discord connector credentials to plugin env keys", () => {
    const result = collectConnectorEnvVars({
      connectors: {
        discord: {
          token: "discord-token-123",
          applicationId: "1234567890",
        },
      },
    } as ElizaConfig);

    expect(result).toEqual({
      DISCORD_API_TOKEN: "discord-token-123",
      DISCORD_BOT_TOKEN: "discord-token-123",
      DISCORD_APPLICATION_ID: "1234567890",
    });
  });

  it("supports legacy channels config aliases", () => {
    const result = collectConnectorEnvVars({
      channels: {
        telegram: {
          botToken: "123:ABC",
        },
      },
    } as ElizaConfig);

    expect(result).toEqual({
      TELEGRAM_BOT_TOKEN: "123:ABC",
    });
  });

  it("maps telegram account connector credentials to MTProto env keys", () => {
    const result = collectConnectorEnvVars({
      connectors: {
        telegramAccount: {
          phone: "+15551234567",
          appId: "12345",
          appHash: "hash-123",
          deviceModel: "Milady Desktop",
          systemVersion: "macOS 15",
        },
      },
    } as ElizaConfig);

    expect(result).toEqual({
      TELEGRAM_ACCOUNT_PHONE: "+15551234567",
      TELEGRAM_ACCOUNT_APP_ID: "12345",
      TELEGRAM_ACCOUNT_APP_HASH: "hash-123",
      TELEGRAM_ACCOUNT_DEVICE_MODEL: "Milady Desktop",
      TELEGRAM_ACCOUNT_SYSTEM_VERSION: "macOS 15",
    });
  });

  it("maps WhatsApp connector auth and policy settings to runtime env keys", () => {
    const result = collectConnectorEnvVars({
      connectors: {
        whatsapp: {
          authDir: "./auth/whatsapp",
          dmPolicy: "pairing",
          groupPolicy: "open",
          allowFrom: ["+14155550100", "+14155550101"],
          groupAllowFrom: ["+14155550102"],
        },
      },
    } as ElizaConfig);

    expect(result).toEqual({
      WHATSAPP_AUTH_DIR: "./auth/whatsapp",
      WHATSAPP_DM_POLICY: "pairing",
      WHATSAPP_GROUP_POLICY: "open",
      WHATSAPP_ALLOW_FROM: "+14155550100,+14155550101",
      WHATSAPP_GROUP_ALLOW_FROM: "+14155550102",
    });
  });

  it("maps the first enabled WhatsApp account authDir for paired-runtime startup", () => {
    const result = collectConnectorEnvVars({
      connectors: {
        whatsapp: {
          accounts: {
            disabled: {
              enabled: false,
              authDir: "./auth/disabled",
            },
            primary: {
              enabled: true,
              authDir: "./auth/primary",
            },
          },
        },
      },
    } as ElizaConfig);

    expect(result).toEqual({
      WHATSAPP_AUTH_DIR: "./auth/primary",
    });
  });
});
