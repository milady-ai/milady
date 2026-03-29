/**
 * Plugin Auto-Enable — Unit Tests
 *
 * Tests for:
 * - applyPluginAutoEnable (connector, auth profile, env var, feature flag, hooks rules)
 * - CONNECTOR_PLUGINS / AUTH_PROVIDER_PLUGINS mappings
 */
import { describe, expect, it, vi } from "vitest";

// Mock all static plugin star-imports in eliza.ts to avoid ESM resolution
// failures from heavy transitive dependencies at static-analysis time.
vi.mock("@elizaos/plugin-agent-orchestrator", () => ({ default: {} }));
vi.mock("@elizaos/plugin-agent-skills", () => ({ default: {} }));
vi.mock("@elizaos/plugin-anthropic", () => ({ default: {} }));
vi.mock("@elizaos/plugin-browser", () => ({ default: {} }));
vi.mock("@elizaos/plugin-cli", () => ({ default: {} }));
vi.mock("@elizaos/plugin-coding-agent", () => ({ default: {} }));
vi.mock("@elizaos/plugin-computeruse", () => ({ default: {} }));
vi.mock("@elizaos/plugin-cron", () => ({ default: {} }));
vi.mock("@elizaos/plugin-edge-tts", () => ({ default: {} }));
vi.mock("@elizaos/plugin-elevenlabs", () => ({ default: {} }));
vi.mock("@elizaos/plugin-elizacloud", () => ({ default: {} }));
vi.mock("@elizaos/plugin-experience", () => ({ default: {} }));
vi.mock("@elizaos/plugin-form", () => ({ default: {} }));
vi.mock("@elizaos/plugin-google-genai", () => ({ default: {} }));
vi.mock("@elizaos/plugin-groq", () => ({ default: {} }));
vi.mock("@elizaos/plugin-knowledge", () => ({ default: {} }));
vi.mock("@elizaos/plugin-local-embedding", () => ({ default: {} }));
vi.mock("@elizaos/plugin-ollama", () => ({ default: {} }));
vi.mock("@elizaos/plugin-openai", () => ({ default: {} }));
vi.mock("@elizaos/plugin-openrouter", () => ({ default: {} }));
vi.mock("@elizaos/plugin-pdf", () => ({ default: {} }));
vi.mock("@elizaos/plugin-personality", () => ({ default: {} }));
vi.mock("@elizaos/plugin-plugin-manager", () => ({ default: {} }));
vi.mock("@elizaos/plugin-rolodex", () => ({ default: {} }));
vi.mock("@elizaos/plugin-secrets-manager", () => ({ default: {} }));
vi.mock("@elizaos/plugin-shell", () => ({ default: {} }));
vi.mock("@elizaos/plugin-trajectory-logger", () => ({ default: {} }));
vi.mock("@elizaos/plugin-trust", () => ({ default: {} }));

import {
  type ApplyPluginAutoEnableParams,
  AUTH_PROVIDER_PLUGINS,
  applyPluginAutoEnable,
  CONNECTOR_PLUGINS,
  isStreamingDestinationConfigured,
  STREAMING_PLUGINS,
} from "./plugin-auto-enable";
import { CONNECTOR_IDS } from "./schema";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Build minimal ApplyPluginAutoEnableParams with defaults. */
function makeParams(
  overrides: Partial<ApplyPluginAutoEnableParams> = {},
): ApplyPluginAutoEnableParams {
  return {
    config: {},
    env: {},
    ...overrides,
  };
}

// ============================================================================
//  1. applyPluginAutoEnable — base behavior
// ============================================================================

describe("applyPluginAutoEnable", () => {
  it("returns unchanged config when plugins.enabled is false", () => {
    const params = makeParams({
      config: { plugins: { enabled: false } },
      env: { OPENAI_API_KEY: "sk-test" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(changes).toHaveLength(0);
    expect(config.plugins?.allow).toBeUndefined();
  });

  it("returns empty changes when no triggers are present", () => {
    const { changes } = applyPluginAutoEnable(makeParams());
    expect(changes).toHaveLength(0);
  });

  it("initializes plugins.allow array when absent", () => {
    const params = makeParams({ env: { OPENAI_API_KEY: "sk-test" } });
    const { config } = applyPluginAutoEnable(params);

    expect(Array.isArray(config.plugins?.allow)).toBe(true);
  });
});

// ============================================================================
//  2. Channel auto-enable
// ============================================================================

describe("applyPluginAutoEnable — connectors", () => {
  it("enables plugin for a connector with an apiKey", () => {
    const params = makeParams({
      config: {
        connectors: {
          twitter: { apiKey: "key-123" },
        },
      },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("twitter");
    expect(changes.some((c) => c.includes("twitter"))).toBe(true);
  });

  it("enables plugin for a connector with a token", () => {
    const params = makeParams({
      config: {
        connectors: {
          twitter: { token: "tok-123" },
        },
      },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("twitter");
    expect(changes.some((c) => c.includes("twitter"))).toBe(true);
  });

  it("skips connector when explicitly disabled", () => {
    const params = makeParams({
      config: {
        connectors: {
          twitter: { enabled: false, apiKey: "key-123" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("twitter");
  });

  it("skips connector without authentication credentials", () => {
    const params = makeParams({
      config: {
        connectors: {
          twitter: { someOtherField: "value" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("twitter");
  });

  it("supports legacy channels key for backward compat", () => {
    const params = makeParams({
      config: {
        channels: {
          twitter: { apiKey: "legacy-tok" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("twitter");
  });

  it("enables twitter when consumerKey is set", () => {
    const params = makeParams({
      config: {
        connectors: {
          twitter: { consumerKey: "ck-123" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("twitter");
  });

  it("enables twitter when bearerToken is set", () => {
    const params = makeParams({
      config: {
        connectors: {
          twitter: { bearerToken: "bt-123" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("twitter");
  });

  it("enables linkedin when apiKey is set", () => {
    const params = makeParams({
      config: {
        connectors: {
          linkedin: { apiKey: "li-key-123" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("linkedin");
  });

  it("enables reddit when apiKey is set", () => {
    const params = makeParams({
      config: {
        connectors: {
          reddit: { apiKey: "reddit-key-123" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("reddit");
  });
});

// ============================================================================
//  3. Auth profile auto-enable
// ============================================================================

describe("applyPluginAutoEnable — auth profiles", () => {
  it("enables plugin for an auth profile with matching provider", () => {
    const params = makeParams({
      config: {
        auth: {
          profiles: {
            main: { provider: "openai", mode: "api_key" as const },
          },
        },
      },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("openai");
    expect(changes.some((c) => c.includes("auth profile"))).toBe(true);
  });

  it("skips auth profile with unrecognized provider", () => {
    const params = makeParams({
      config: {
        auth: {
          profiles: {
            custom: { provider: "my-custom-llm", mode: "api_key" as const },
          },
        },
      },
    });
    const { changes } = applyPluginAutoEnable(params);

    expect(changes).toHaveLength(0);
  });
});

// ============================================================================
//  4. Env var auto-enable
// ============================================================================

describe("applyPluginAutoEnable — env vars", () => {
  it("enables plugin when its API key env var is set", () => {
    const params = makeParams({
      env: { ANTHROPIC_API_KEY: "sk-ant-test" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("anthropic");
    expect(changes.some((c) => c.includes("ANTHROPIC_API_KEY"))).toBe(true);
  });

  it("enables repoprompt plugin when REPOPROMPT_CLI_PATH is set", () => {
    const params = makeParams({
      env: { REPOPROMPT_CLI_PATH: "/usr/local/bin/rp-cli" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("repoprompt");
    expect(changes.some((c) => c.includes("REPOPROMPT_CLI_PATH"))).toBe(true);
  });

  it("enables claude code workbench plugin when CLAUDE_CODE_WORKBENCH_ENABLED is set", () => {
    const params = makeParams({
      env: { CLAUDE_CODE_WORKBENCH_ENABLED: "1" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("claude-code-workbench");
    expect(
      changes.some((c) => c.includes("CLAUDE_CODE_WORKBENCH_ENABLED")),
    ).toBe(true);
  });

  it("skips env var with empty string value", () => {
    const params = makeParams({ env: { OPENAI_API_KEY: "" } });
    const { changes } = applyPluginAutoEnable(params);

    expect(changes).toHaveLength(0);
  });

  it("skips env var with whitespace-only value", () => {
    const params = makeParams({ env: { OPENAI_API_KEY: "   " } });
    const { changes } = applyPluginAutoEnable(params);

    expect(changes).toHaveLength(0);
  });

  it("respects plugin entry enabled=false override", () => {
    const params = makeParams({
      config: {
        plugins: { entries: { anthropic: { enabled: false } } },
      },
      env: { ANTHROPIC_API_KEY: "sk-ant-test" },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("anthropic");
  });

  it("handles multiple env vars enabling different plugins", () => {
    const params = makeParams({
      env: {
        OPENAI_API_KEY: "sk-test",
        GROQ_API_KEY: "gsk-test",
        XAI_API_KEY: "xai-test",
      },
    });
    const { config } = applyPluginAutoEnable(params);
    const allow = config.plugins?.allow ?? [];

    expect(allow).toContain("openai");
    expect(allow).toContain("groq");
    expect(allow).toContain("xai");
  });

  it("auto-enables obsidian plugin when OBSIDIAN_VAULT_PATH is set", () => {
    const params = makeParams({
      env: { OBSIDIAN_VAULT_PATH: "/tmp/vault" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("obsidian");
    expect(changes.some((c) => c.includes("OBSIDIAN_VAULT_PATH"))).toBe(true);
  });

  it("does not duplicate entries in allow list", () => {
    const params = makeParams({
      env: {
        ANTHROPIC_API_KEY: "key1",
        CLAUDE_API_KEY: "key2",
      },
    });
    const { config } = applyPluginAutoEnable(params);
    const allow = config.plugins?.allow ?? [];

    const anthropicEntries = allow.filter((p) => p === "anthropic");
    expect(anthropicEntries).toHaveLength(1);
  });

  it("auto-enables cua plugin when CUA_API_KEY is set", () => {
    const params = makeParams({
      env: { CUA_API_KEY: "cua-key" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("cua");
    expect(changes.some((c) => c.includes("CUA_API_KEY"))).toBe(true);
  });

  it("auto-enables cua plugin when CUA_HOST is set", () => {
    const params = makeParams({
      env: { CUA_HOST: "https://cua.example" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("cua");
    expect(changes.some((c) => c.includes("CUA_HOST"))).toBe(true);
  });

  it("respects cua enabled=false override for env auto-enable", () => {
    const params = makeParams({
      config: {
        plugins: { entries: { cua: { enabled: false } } },
      },
      env: { CUA_API_KEY: "cua-key" },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("cua");
  });

  it("respects x402 enabled=false override for env auto-enable", () => {
    const params = makeParams({
      config: {
        plugins: { entries: { x402: { enabled: false } } },
      },
      env: { X402_API_KEY: "x402-key" },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("x402");
  });

  it("does not duplicate cua when both CUA_API_KEY and CUA_HOST are set", () => {
    const params = makeParams({
      env: { CUA_API_KEY: "cua-key", CUA_HOST: "https://cua.example" },
    });
    const { config } = applyPluginAutoEnable(params);
    const allow = config.plugins?.allow ?? [];

    const cuaEntries = allow.filter((p) => p === "cua");
    expect(cuaEntries).toHaveLength(1);
  });

  it("auto-enables steward plugin when STEWARD_API_URL is set", () => {
    const params = makeParams({
      env: { STEWARD_API_URL: "https://steward.example" },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("@stwd/eliza-plugin");
  });
});

// ============================================================================
//  5. Feature flag auto-enable
// ============================================================================

describe("applyPluginAutoEnable — features", () => {
  it("enables plugin when feature is set to true", () => {
    const params = makeParams({
      config: { features: { browser: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("browser");
    expect(changes.some((c) => c.includes("feature: browser"))).toBe(true);
  });

  it("enables repoprompt plugin when feature flag is enabled", () => {
    const params = makeParams({
      config: { features: { repoprompt: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("repoprompt");
    expect(changes.some((c) => c.includes("feature: repoprompt"))).toBe(true);
  });

  it("enables claude code workbench plugin when feature flag is enabled", () => {
    const params = makeParams({
      config: { features: { claudeCodeWorkbench: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("claude-code-workbench");
    expect(
      changes.some((c) => c.includes("feature: claudeCodeWorkbench")),
    ).toBe(true);
  });

  it("enables plugin when feature is an object with enabled not false", () => {
    const params = makeParams({
      config: { features: { cron: { schedule: "* * * * *" } } },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("cron");
  });

  it("skips feature when enabled is explicitly false", () => {
    const params = makeParams({
      config: { features: { shell: { enabled: false } } },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("shell");
  });

  it("skips unrecognized feature names", () => {
    const params = makeParams({
      config: { features: { customFeature: true } },
    });
    const { changes } = applyPluginAutoEnable(params);

    expect(changes).toHaveLength(0);
  });

  it("enables obsidian plugin when features.obsidian = true", () => {
    const params = makeParams({
      config: { features: { obsidian: true } },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("obsidian");
  });

  it("enables x402 plugin when features.x402 = true", () => {
    const params = makeParams({
      config: { features: { x402: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("x402");
    expect(changes.some((c) => c.includes("feature: x402"))).toBe(true);
  });

  it("enables cua plugin when features.cua = true", () => {
    const params = makeParams({
      config: { features: { cua: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("cua");
    expect(changes.some((c) => c.includes("feature: cua"))).toBe(true);
  });

  it("skips x402 feature when features.x402.enabled is explicitly false", () => {
    const params = makeParams({
      config: { features: { x402: { enabled: false } } },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("x402");
  });

  it("enables computeruse plugin when features.computeruse = true", () => {
    const params = makeParams({
      config: { features: { computeruse: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("computeruse");
    expect(changes.some((c) => c.includes("feature: computeruse"))).toBe(true);
  });
});

// ============================================================================
//  6. Hooks auto-enable
// ============================================================================

describe("applyPluginAutoEnable — hooks", () => {
  it("enables webhooks plugin when hooks.token is set", () => {
    const params = makeParams({
      config: { hooks: { token: "whk-secret" } as Record<string, unknown> },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("webhooks");
  });

  it("skips webhooks when hooks.enabled is false", () => {
    const params = makeParams({
      config: {
        hooks: { enabled: false, token: "whk-secret" } as Record<
          string,
          unknown
        >,
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("webhooks");
  });

  it("enables gmail-watch plugin when hooks.gmail.account is set", () => {
    const params = makeParams({
      config: {
        hooks: { gmail: { account: "user@gmail.com" } } as Record<
          string,
          unknown
        >,
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("gmail-watch");
  });
});

// ============================================================================
//  7. Subscription provider auto-enable
// ============================================================================

describe("applyPluginAutoEnable — subscription provider", () => {
  it("force-enables anthropic plugin when subscriptionProvider is anthropic-subscription", () => {
    const params = makeParams({
      config: {
        agents: {
          defaults: { subscriptionProvider: "anthropic-subscription" },
        },
      },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("anthropic");
    expect(changes.some((c) => c.includes("subscription"))).toBe(true);
  });

  it("force-enables openai plugin when subscriptionProvider is openai-codex", () => {
    const params = makeParams({
      config: {
        agents: { defaults: { subscriptionProvider: "openai-codex" } },
      },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("openai");
    expect(changes.some((c) => c.includes("subscription"))).toBe(true);
  });

  it("overrides explicit enabled=false for the subscription plugin", () => {
    const params = makeParams({
      config: {
        plugins: { entries: { anthropic: { enabled: false } } },
        agents: {
          defaults: { subscriptionProvider: "anthropic-subscription" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("anthropic");
    expect(config.plugins?.entries?.anthropic?.enabled).toBe(true);
  });

  it("does nothing when subscriptionProvider is not set", () => {
    const params = makeParams({
      config: { agents: { defaults: {} } },
    });
    const { changes } = applyPluginAutoEnable(params);

    expect(changes.every((c) => !c.includes("subscription"))).toBe(true);
  });
});

// ============================================================================
//  8. Mapping constants
// ============================================================================

describe("CONNECTOR_PLUGINS", () => {
  it("maps twitter to @elizaos/plugin-twitter", () => {
    expect(CONNECTOR_PLUGINS.twitter).toBe("@elizaos/plugin-twitter");
  });

  it("maps linkedin to @elizaos/plugin-linkedin", () => {
    expect(CONNECTOR_PLUGINS.linkedin).toBe("@elizaos/plugin-linkedin");
  });

  it("maps reddit to @elizaos/plugin-reddit", () => {
    expect(CONNECTOR_PLUGINS.reddit).toBe("@elizaos/plugin-reddit");
  });

  it("contains 3 connector mappings", () => {
    expect(Object.keys(CONNECTOR_PLUGINS)).toHaveLength(3);
  });

  it("has keys matching CONNECTOR_IDS from schema", () => {
    expect([...Object.keys(CONNECTOR_PLUGINS)].sort()).toEqual(
      [...CONNECTOR_IDS].sort(),
    );
  });
});

describe("AUTH_PROVIDER_PLUGINS", () => {
  it("maps OPENAI_API_KEY to openai plugin", () => {
    expect(AUTH_PROVIDER_PLUGINS.OPENAI_API_KEY).toBe("@elizaos/plugin-openai");
  });

  it("maps both ANTHROPIC_API_KEY and CLAUDE_API_KEY to anthropic plugin", () => {
    expect(AUTH_PROVIDER_PLUGINS.ANTHROPIC_API_KEY).toBe(
      "@elizaos/plugin-anthropic",
    );
    expect(AUTH_PROVIDER_PLUGINS.CLAUDE_API_KEY).toBe(
      "@elizaos/plugin-anthropic",
    );
  });

  it("maps OBSIDIAN_VAULT_PATH and OBSIDAN_VAULT_PATH to obsidian plugin", () => {
    expect(AUTH_PROVIDER_PLUGINS.OBSIDIAN_VAULT_PATH).toBe(
      "@elizaos/plugin-obsidian",
    );
    expect(AUTH_PROVIDER_PLUGINS.OBSIDAN_VAULT_PATH).toBe(
      "@elizaos/plugin-obsidian",
    );
  });

  it("maps CUA env keys to cua plugin", () => {
    expect(AUTH_PROVIDER_PLUGINS.CUA_API_KEY).toBe("@elizaos/plugin-cua");
    expect(AUTH_PROVIDER_PLUGINS.CUA_HOST).toBe("@elizaos/plugin-cua");
  });
});

// ============================================================================
//  Streaming destination auto-enable
// ============================================================================

describe("STREAMING_PLUGINS mapping", () => {
  it("maps known streaming destinations to plugin packages", () => {
    expect(STREAMING_PLUGINS.youtube).toBe("@elizaos/plugin-youtube-streaming");
    expect(STREAMING_PLUGINS.x).toBe("@elizaos/plugin-x-streaming");
  });
});

describe("isStreamingDestinationConfigured", () => {
  it("returns false for null/undefined config", () => {
    expect(isStreamingDestinationConfigured("youtube", null)).toBe(false);
    expect(isStreamingDestinationConfigured("youtube", undefined)).toBe(false);
  });

  it("returns false for non-object config", () => {
    expect(isStreamingDestinationConfigured("youtube", "string")).toBe(false);
    expect(isStreamingDestinationConfigured("youtube", 42)).toBe(false);
  });

  it("returns false when enabled is explicitly false", () => {
    expect(
      isStreamingDestinationConfigured("youtube", {
        enabled: false,
        streamKey: "sk",
      }),
    ).toBe(false);
  });

  it("detects youtube via streamKey", () => {
    expect(
      isStreamingDestinationConfigured("youtube", { streamKey: "xxxx-xxxx" }),
    ).toBe(true);
  });

  it("detects X when both streamKey and rtmpUrl are present", () => {
    expect(
      isStreamingDestinationConfigured("x", {
        streamKey: "live_abc",
        rtmpUrl: "rtmp://example.com/live",
      }),
    ).toBe(true);
  });

  it("rejects X when only streamKey is present (missing rtmpUrl)", () => {
    expect(
      isStreamingDestinationConfigured("x", {
        streamKey: "live_abc",
      }),
    ).toBe(false);
  });

  it("returns false for unknown destination names", () => {
    expect(
      isStreamingDestinationConfigured("unknown", { streamKey: "sk" }),
    ).toBe(false);
  });
});

describe("applyPluginAutoEnable — streaming destinations", () => {
  it("auto-enables youtube-streaming plugin when youtube streamKey is set", () => {
    const { config, changes } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: { youtube: { streamKey: "xxxx-xxxx" } },
        } as never,
      }),
    );
    expect(config.plugins?.allow).toContain("youtube-streaming");
    expect(changes.some((c) => c.includes("streaming: youtube"))).toBe(true);
  });

  it("auto-enables x-streaming plugin when x has streamKey and rtmpUrl", () => {
    const { config, changes } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: {
            x: {
              streamKey: "live_abc",
              rtmpUrl: "rtmp://x.com/live",
            },
          },
        } as never,
      }),
    );
    expect(config.plugins?.allow).toContain("x-streaming");
    expect(changes.some((c) => c.includes("streaming: x"))).toBe(true);
  });

  it("skips activeDestination meta field", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: {
            activeDestination: "youtube",
            youtube: { streamKey: "xxxx-xxxx" },
          },
        } as never,
      }),
    );
    // activeDestination should not result in any plugin — only youtube should be added
    const allow = config.plugins?.allow ?? [];
    expect(allow).toContain("youtube-streaming");
    expect(allow).not.toContain("activeDestination");
  });

  it("does not auto-enable streaming plugin when enabled is explicitly false", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: { youtube: { enabled: false, streamKey: "xxxx-xxxx" } },
        } as never,
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain("youtube-streaming");
  });

  it("does not auto-enable streaming plugin when shortId is disabled in plugins.entries", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: { youtube: { streamKey: "xxxx-xxxx" } },
          plugins: { entries: { "youtube-streaming": { enabled: false } } },
        } as never,
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain("youtube-streaming");
  });

  it("does not auto-enable when streaming config is empty", () => {
    const { changes } = applyPluginAutoEnable(
      makeParams({
        config: { streaming: {} } as never,
      }),
    );
    expect(changes.filter((c) => c.includes("streaming:"))).toHaveLength(0);
  });
});
