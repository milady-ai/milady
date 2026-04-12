/**
 * Discord Cloud Env Var Mapping Tests
 *
 * Verifies that CONNECTOR_ENV_MAP discord entries produce correct env vars,
 * aliases resolve correctly, and cloud-injected env vars match plugin expectations.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ElizaConfig } from "../src/config/types";
import {
  collectConnectorEnvVars,
  CONNECTOR_ENV_MAP,
} from "../src/config/env-vars";

function cfg(x: Record<string, unknown>): ElizaConfig {
  return x as ElizaConfig;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Snapshot of env vars we may mutate during tests. */
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {
    DISCORD_API_TOKEN: process.env.DISCORD_API_TOKEN,
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,
  };
});

afterEach(() => {
  // Restore env vars to pre-test state
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

// ---------------------------------------------------------------------------
// 1. CONNECTOR_ENV_MAP — discord entries
// ---------------------------------------------------------------------------

describe("CONNECTOR_ENV_MAP discord entries", () => {
  it("maps token field to DISCORD_API_TOKEN", () => {
    // The discord connector config field "token" should resolve to DISCORD_API_TOKEN
    expect(CONNECTOR_ENV_MAP.discord.token).toBe("DISCORD_API_TOKEN");
  });

  it("maps botToken field to DISCORD_API_TOKEN (alias)", () => {
    // botToken is an alias used by some config surfaces; must resolve to the same env var
    expect(CONNECTOR_ENV_MAP.discord.botToken).toBe("DISCORD_API_TOKEN");
  });

  it("maps applicationId field to DISCORD_APPLICATION_ID", () => {
    expect(CONNECTOR_ENV_MAP.discord.applicationId).toBe(
      "DISCORD_APPLICATION_ID",
    );
  });

  it("includes the expected discord config fields", () => {
    expect(Object.keys(CONNECTOR_ENV_MAP.discord).sort()).toEqual([
      "applicationId",
      "botToken",
      "profileAvatar",
      "profileName",
      "syncProfile",
      "token",
    ]);
  });

  it("all discord env var values are non-empty strings", () => {
    for (const [field, envKey] of Object.entries(CONNECTOR_ENV_MAP.discord)) {
      expect(envKey).toBeTruthy();
      expect(typeof envKey).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// 2. collectConnectorEnvVars — discord token resolution
// ---------------------------------------------------------------------------

describe("collectConnectorEnvVars discord token resolution", () => {
  it("extracts DISCORD_API_TOKEN from connector.discord.token", () => {
    const result = collectConnectorEnvVars(
      cfg({
        connectors: {
          discord: { token: "test-token-123" },
        },
      }),
    );

    expect(result.DISCORD_API_TOKEN).toBe("test-token-123");
  });

  it("extracts DISCORD_API_TOKEN from connector.discord.botToken", () => {
    // botToken is the alias used by cloud provisioning
    const result = collectConnectorEnvVars(
      cfg({
        connectors: {
          discord: { botToken: "bot-token-456" },
        },
      }),
    );

    expect(result.DISCORD_API_TOKEN).toBe("bot-token-456");
  });

  it("mirrors token to both DISCORD_API_TOKEN and DISCORD_BOT_TOKEN", () => {
    // The mirror ensures older plugins that read DISCORD_BOT_TOKEN still work
    const result = collectConnectorEnvVars(
      cfg({
        connectors: {
          discord: { token: "mirror-token" },
        },
      }),
    );

    expect(result.DISCORD_API_TOKEN).toBe("mirror-token");
    expect(result.DISCORD_BOT_TOKEN).toBe("mirror-token");
  });

  it("prefers token over botToken when both are set", () => {
    // The mirror logic uses token first, then botToken as fallback
    const result = collectConnectorEnvVars(
      cfg({
        connectors: {
          discord: { token: "primary-token", botToken: "secondary-token" },
        },
      }),
    );

    expect(result.DISCORD_API_TOKEN).toBe("primary-token");
    expect(result.DISCORD_BOT_TOKEN).toBe("primary-token");
  });

  it("falls back to botToken when token is empty", () => {
    const result = collectConnectorEnvVars(
      cfg({
        connectors: {
          discord: { token: "", botToken: "fallback-token" },
        },
      }),
    );

    expect(result.DISCORD_API_TOKEN).toBe("fallback-token");
    expect(result.DISCORD_BOT_TOKEN).toBe("fallback-token");
  });

  it("extracts DISCORD_APPLICATION_ID when present", () => {
    const result = collectConnectorEnvVars(
      cfg({
        connectors: {
          discord: { token: "tok", applicationId: "app-id-789" },
        },
      }),
    );

    expect(result.DISCORD_APPLICATION_ID).toBe("app-id-789");
  });

  it("omits DISCORD_APPLICATION_ID when not set", () => {
    const result = collectConnectorEnvVars(
      cfg({
        connectors: {
          discord: { token: "tok" },
        },
      }),
    );

    // applicationId not in config → should not appear in env
    expect(result.DISCORD_APPLICATION_ID).toBeUndefined();
  });

  it("skips empty/whitespace-only token values", () => {
    const result = collectConnectorEnvVars(
      cfg({
        connectors: {
          discord: { token: "   ", botToken: "   " },
        },
      }),
    );

    // Both are whitespace → mirror should not fire
    expect(result.DISCORD_API_TOKEN).toBeUndefined();
    expect(result.DISCORD_BOT_TOKEN).toBeUndefined();
  });

  it("skips non-string token values", () => {
    const result = collectConnectorEnvVars(
      cfg({
        connectors: {
          discord: { token: 12345 },
        },
      }),
    );

    // Non-string values are silently ignored
    expect(result.DISCORD_API_TOKEN).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Cloud-injected env vars match plugin expectations
// ---------------------------------------------------------------------------

describe("cloud-injected env var parity", () => {
  it("cloud container DISCORD_API_TOKEN maps to the same var the plugin reads", () => {
    // Cloud provisioning injects DISCORD_API_TOKEN directly into the container.
    // The discord connector config field "token" also maps to DISCORD_API_TOKEN.
    // They must agree so the plugin auto-enables correctly.
    const cloudInjectedVar = "DISCORD_API_TOKEN";
    const connectorMappedVar = CONNECTOR_ENV_MAP.discord.token;
    expect(connectorMappedVar).toBe(cloudInjectedVar);
  });

  it("cloud container with bot token produces valid connector env vars", () => {
    // Simulates: cloud provisioning wrote botToken into the agent config
    const result = collectConnectorEnvVars(
      cfg({
        connectors: {
          discord: {
            botToken: "cloud-provisioned-bot-token",
            applicationId: "cloud-app-id",
          },
        },
      }),
    );

    // Must produce all env vars the discord plugin needs at startup
    expect(result.DISCORD_API_TOKEN).toBe("cloud-provisioned-bot-token");
    expect(result.DISCORD_BOT_TOKEN).toBe("cloud-provisioned-bot-token");
    expect(result.DISCORD_APPLICATION_ID).toBe("cloud-app-id");
  });
});

// ---------------------------------------------------------------------------
// 4. Missing token → validation error, not crash
// ---------------------------------------------------------------------------

describe("missing discord token handling", () => {
  it("returns empty object when discord connector config is missing", () => {
    const result = collectConnectorEnvVars(cfg({ connectors: {} }));

    expect(result).toEqual({});
  });

  it("returns empty object when connectors key is absent", () => {
    const result = collectConnectorEnvVars(cfg({}));
    expect(result).toEqual({});
  });

  it("returns empty object when config is undefined", () => {
    const result = collectConnectorEnvVars(undefined);
    expect(result).toEqual({});
  });

  it("handles discord connector with no token fields gracefully", () => {
    const result = collectConnectorEnvVars(
      cfg({
        connectors: {
          discord: { applicationId: "app-only" },
        },
      }),
    );

    // No token → no DISCORD_API_TOKEN or DISCORD_BOT_TOKEN
    expect(result.DISCORD_API_TOKEN).toBeUndefined();
    expect(result.DISCORD_BOT_TOKEN).toBeUndefined();
    // applicationId still extracted via the standard field loop
    expect(result.DISCORD_APPLICATION_ID).toBe("app-only");
  });

  it("handles null connector config without crashing", () => {
    const result = collectConnectorEnvVars(
      cfg({
        connectors: {
          discord: null,
        },
      }),
    );

    expect(result).toEqual({});
  });

  it("handles array connector config without crashing", () => {
    const result = collectConnectorEnvVars(
      cfg({
        connectors: {
          discord: ["unexpected"],
        },
      }),
    );

    expect(result).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// 5. Legacy channels key support
// ---------------------------------------------------------------------------

describe("legacy channels key", () => {
  it("reads discord config from channels key (legacy)", () => {
    // Older configs used "channels" instead of "connectors"
    const result = collectConnectorEnvVars(
      cfg({
        channels: {
          discord: { token: "legacy-token" },
        },
      }),
    );

    expect(result.DISCORD_API_TOKEN).toBe("legacy-token");
    expect(result.DISCORD_BOT_TOKEN).toBe("legacy-token");
  });
});
