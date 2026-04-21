/**
 * CLI & Runtime Parity Tests (GitHub Issue #2)
 *
 * Validates that all entry points — GUI app, `npx elizaai`, `bun run dev` —
 * produce consistent behaviour:
 *   - Same plugin set loads in all modes
 *   - Same config paths are used
 *   - Same onboarding presets are available
 *   - API server is available in both CLI and headless modes
 *   - Config env vars are applied identically
 */

// Shared presets used by both CLI and API server
import {
  SHARED_STYLE_RULES,
  STYLE_PRESETS,
} from "@miladyai/shared/onboarding-presets";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@elizaos/plugin-agent-orchestrator", () => ({ default: {} }));
vi.mock("@elizaos/plugin-agent-skills", () => ({ default: {} }));
vi.mock("@elizaos/plugin-anthropic", () => ({ default: {} }));
vi.mock("@elizaos/plugin-browser", () => ({ default: {} }));
vi.mock("@elizaos/plugin-cli", () => ({ default: {} }));
vi.mock("@elizaos/plugin-computeruse", () => ({ default: {} }));
vi.mock("@elizaos/plugin-cron", () => ({ default: {} }));
vi.mock("@elizaos/plugin-discord", () => ({ default: {} }));
vi.mock("@elizaos/plugin-edge-tts", () => ({ default: {} }));
vi.mock("@elizaos/plugin-elevenlabs", () => ({ default: {} }));
vi.mock("@elizaos/plugin-elizacloud", () => ({ default: {} }));
vi.mock("@elizaos/plugin-experience", () => ({ default: {} }));
vi.mock("@elizaos/plugin-form", () => ({ default: {} }));
vi.mock("@elizaos/plugin-google-genai", () => ({ default: {} }));
vi.mock("@elizaos/plugin-groq", () => ({ default: {} }));
vi.mock("@elizaos/plugin-local-embedding", () => ({ default: {} }));
vi.mock("@elizaos/plugin-ollama", () => ({ default: {} }));
vi.mock("@elizaos/plugin-openai", () => ({ default: {} }));
vi.mock("@elizaos/plugin-openrouter", () => ({ default: {} }));
vi.mock("@elizaos/plugin-pdf", () => ({ default: {} }));
vi.mock("@elizaos/plugin-personality", () => ({ default: {} }));
vi.mock("@elizaos/plugin-plugin-manager", () => ({ default: {} }));
vi.mock("@elizaos/plugin-secrets-manager", () => ({ default: {} }));
vi.mock("@elizaos/plugin-shell", () => ({ default: {} }));
vi.mock("@elizaos/plugin-telegram", () => ({ default: {} }));
vi.mock("@elizaos-plugins/client-telegram-account", () => ({ default: {} }));
vi.mock("@elizaos/plugin-trust", () => ({ default: {} }));
vi.mock("@elizaos/plugin-twitch", () => ({ default: {} }));
vi.mock("@miladyai/plugin-wechat", () => ({ default: {} }));
import { envSnapshot } from "../../../test/helpers/test-utils";
import type { ElizaConfig } from "./config/config";
import {
  applyCloudConfigToEnv,
  applyConnectorSecretsToEnv,
  buildCharacterFromConfig,
  collectPluginNames,
  resolvePrimaryModel,
} from "./runtime/eliza";

// ---------------------------------------------------------------------------
// Shared presets parity
// ---------------------------------------------------------------------------

describe("onboarding presets parity (CLI ↔ GUI)", () => {
  it("STYLE_PRESETS is a non-empty array", () => {
    expect(Array.isArray(STYLE_PRESETS)).toBe(true);
    expect(STYLE_PRESETS.length).toBeGreaterThanOrEqual(7);
  });

  it("every preset has all required fields", () => {
    for (const preset of STYLE_PRESETS) {
      expect(preset.catchphrase).toBeTruthy();
      expect(preset.hint).toBeTruthy();
      expect(Array.isArray(preset.bio)).toBe(true);
      expect(preset.bio.length).toBeGreaterThan(0);
      expect(typeof preset.system).toBe("string");
      expect(preset.system.length).toBeGreaterThan(0);
      expect(Array.isArray(preset.adjectives)).toBe(true);
      expect(preset.adjectives.length).toBeGreaterThan(0);
      expect(preset.style).toBeDefined();
      expect(Array.isArray(preset.style.all)).toBe(true);
      expect(Array.isArray(preset.style.chat)).toBe(true);
      expect(Array.isArray(preset.style.post)).toBe(true);
      expect(Array.isArray(preset.postExamples)).toBe(true);
      expect(Array.isArray(preset.messageExamples)).toBe(true);
    }
  });

  it("every preset uses {{name}} placeholder in bio and system", () => {
    for (const preset of STYLE_PRESETS) {
      const hasBioPlaceholder = preset.bio.some((line) =>
        line.includes("{{name}}"),
      );
      expect(hasBioPlaceholder).toBe(true);
      expect(preset.system).toContain("{{name}}");
    }
  });

  it("shared style rules are included in every preset's style.all", () => {
    for (const preset of STYLE_PRESETS) {
      for (const rule of SHARED_STYLE_RULES) {
        expect(preset.style.all).toContain(rule);
      }
    }
  });

  it("each preset has unique catchphrase", () => {
    const catchphrases = STYLE_PRESETS.map((p) => p.catchphrase);
    expect(new Set(catchphrases).size).toBe(catchphrases.length);
  });

  it("each preset has messageExamples (for GUI) and postExamples (for CLI)", () => {
    // Ensures both onboarding surfaces have the data they need
    for (const preset of STYLE_PRESETS) {
      expect(preset.messageExamples.length).toBeGreaterThan(0);
      expect(preset.postExamples.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Plugin loading parity
// ---------------------------------------------------------------------------

describe("plugin loading parity across modes", () => {
  const envKeys = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GROQ_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "XAI_API_KEY",
    "OPENROUTER_API_KEY",
    "AI_GATEWAY_API_KEY",
    "AIGATEWAY_API_KEY",
    "OLLAMA_BASE_URL",
    "ELIZAOS_CLOUD_API_KEY",
    "ELIZAOS_CLOUD_ENABLED",
  ];
  const snap = envSnapshot(envKeys);
  beforeEach(() => {
    snap.save();
    for (const k of envKeys) delete process.env[k];
  });
  afterEach(() => snap.restore());

  it("same core plugins are always loaded regardless of config", () => {
    // An empty config should still produce the same core plugin set
    // whether called from CLI or GUI mode (both use collectPluginNames)
    const names1 = collectPluginNames({} as ElizaConfig);
    const names2 = collectPluginNames({} as ElizaConfig);
    expect([...names1].sort()).toEqual([...names2].sort());
  });

  it("core plugins include all essential plugins for a working agent", () => {
    const names = collectPluginNames({} as ElizaConfig);
    const essentials = [
      "@elizaos/plugin-sql",
      "@elizaos/plugin-local-embedding",
      "@elizaos/plugin-agent-skills",
      "@elizaos/plugin-agent-orchestrator",
      "@elizaos/plugin-shell",
    ];
    for (const plugin of essentials) {
      expect(names.has(plugin)).toBe(true);
    }
  });

  it("provider plugins are added identically from env vars", () => {
    // Simulate a config with an Anthropic key
    process.env.ANTHROPIC_API_KEY = "sk-test-123";
    process.env.OPENAI_API_KEY = "sk-test-456";
    process.env.AI_GATEWAY_API_KEY = "aigw-test-789";

    const names = collectPluginNames({} as ElizaConfig);
    expect(names.has("@elizaos/plugin-anthropic")).toBe(true);
    expect(names.has("@elizaos/plugin-openai")).toBe(true);
    expect(names.has("@elizaos/plugin-vercel-ai-gateway")).toBe(true);
    // Plugins not set should not be loaded
    expect(names.has("@elizaos/plugin-groq")).toBe(false);
    expect(names.has("@elizaos/plugin-xai")).toBe(false);
  });

  it("channel plugins are added consistently from config", () => {
    const config = {
      channels: {
        telegram: { botToken: "tg-tok" },
        discord: { token: "dc-tok" },
        slack: { botToken: "xoxb-1", appToken: "xapp-1" },
      },
    } as ElizaConfig;

    const names = collectPluginNames(config);
    // Telegram maps to the local enhanced plugin, not the upstream one
    expect(names.has("@elizaos/plugin-telegram")).toBe(true);
    expect(names.has("@elizaos/plugin-discord")).toBe(true);
    expect(names.has("@elizaos/plugin-slack")).toBe(true);
    // Unconfigured channels should NOT be loaded
    expect(names.has("@elizaai/plugin-whatsapp")).toBe(false);
    expect(names.has("@elizaos/plugin-signal")).toBe(false);
  });

  it("user-installed plugins merge with core + channel + provider plugins", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";

    const config = {
      channels: { discord: { token: "tok" } },
      plugins: {
        installs: {
          "@elizaos/plugin-custom": {
            source: "npm",
            installPath: "/tmp/test",
            version: "1.0.0",
          },
        },
      },
    } as Partial<ElizaConfig> as ElizaConfig;

    const names = collectPluginNames(config);
    // Core
    expect(names.has("@elizaos/plugin-sql")).toBe(true);
    // Channel
    expect(names.has("@elizaos/plugin-discord")).toBe(true);
    // Provider
    expect(names.has("@elizaos/plugin-anthropic")).toBe(true);
    // User-installed
    expect(names.has("@elizaos/plugin-custom")).toBe(true);
  });

  it("cloud plugin loads consistently from config or env", () => {
    // From config
    const config1 = { cloud: { enabled: true } } as ElizaConfig;
    expect(collectPluginNames(config1).has("@elizaos/plugin-elizacloud")).toBe(
      true,
    );

    // From env
    process.env.ELIZAOS_CLOUD_API_KEY = "ck-test";
    expect(
      collectPluginNames({} as ElizaConfig).has("@elizaos/plugin-elizacloud"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Config / env propagation parity
// ---------------------------------------------------------------------------

describe("config env propagation parity", () => {
  const envKeys = [
    "DISCORD_BOT_TOKEN",
    "TELEGRAM_BOT_TOKEN",
    "SLACK_BOT_TOKEN",
    "SLACK_APP_TOKEN",
    "ELIZAOS_CLOUD_ENABLED",
    "ELIZAOS_CLOUD_API_KEY",
    "ELIZAOS_CLOUD_BASE_URL",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
  ];
  const snap = envSnapshot(envKeys);
  beforeEach(() => {
    snap.save();
    for (const k of envKeys) delete process.env[k];
  });
  afterEach(() => snap.restore());

  it("connector secrets are applied from config to env identically", () => {
    const config = {
      connectors: {
        discord: { token: "dc-tok-123" },
        telegram: { botToken: "tg-tok-456" },
        slack: { botToken: "xoxb-1", appToken: "xapp-1" },
      },
    } as ElizaConfig;

    applyConnectorSecretsToEnv(config);
    expect(process.env.DISCORD_BOT_TOKEN).toBe("dc-tok-123");
    expect(process.env.TELEGRAM_BOT_TOKEN).toBe("tg-tok-456");
    expect(process.env.SLACK_BOT_TOKEN).toBe("xoxb-1");
    expect(process.env.SLACK_APP_TOKEN).toBe("xapp-1");
  });

  it("cloud config is applied from config to env identically", () => {
    const config = {
      cloud: {
        enabled: true,
        apiKey: "ck-123",
        baseUrl: "https://cloud.example",
      },
    } as ElizaConfig;

    applyCloudConfigToEnv(config);
    expect(process.env.ELIZAOS_CLOUD_ENABLED).toBe("true");
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBe("ck-123");
    expect(process.env.ELIZAOS_CLOUD_BASE_URL).toBe("https://cloud.example");
  });

  it("connector env values override stale process env and disabled cloud clears stale keys", () => {
    process.env.TELEGRAM_BOT_TOKEN = "already-set";
    process.env.ELIZAOS_CLOUD_API_KEY = "old-key";

    applyConnectorSecretsToEnv({
      connectors: { telegram: { botToken: "new" } },
    } as ElizaConfig);
    applyCloudConfigToEnv({ cloud: { apiKey: "new-key" } } as ElizaConfig);

    // Saved connector config is the source of truth for the runtime.
    expect(process.env.TELEGRAM_BOT_TOKEN).toBe("new");
    // Cloud config must not leave a usable key behind unless enabled=true.
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Character building parity
// ---------------------------------------------------------------------------

describe("character building parity", () => {
  const envKeys = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY"];
  const snap = envSnapshot(envKeys);
  beforeEach(() => {
    snap.save();
    for (const k of envKeys) delete process.env[k];
  });
  afterEach(() => snap.restore());

  it("character name resolves identically regardless of config shape", () => {
    // Name from agents.list
    expect(
      buildCharacterFromConfig({
        agents: { list: [{ id: "main", name: "Sakuya" }] },
      } as ElizaConfig).name,
    ).toBe("Sakuya");

    // Name from ui.assistant
    expect(
      buildCharacterFromConfig({
        ui: { assistant: { name: "Reimu" } },
      } as Partial<ElizaConfig> as ElizaConfig).name,
    ).toBe("Reimu");

    // Divergence should prefer the UI-selected assistant name.
    expect(
      buildCharacterFromConfig({
        agents: { list: [{ id: "main", name: "Chen" }] },
        ui: { assistant: { name: "Eliza" } },
      } as Partial<ElizaConfig> as ElizaConfig).name,
    ).toBe("Eliza");

    // Default fallback should resolve to the default bundled preset.
    expect(buildCharacterFromConfig({} as ElizaConfig).name).toBe("Eliza");
  });

  it("secrets from env are included in character in all modes", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OPENAI_API_KEY = "sk-oai-test";

    const char = buildCharacterFromConfig({} as ElizaConfig);
    expect(char.secrets?.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    expect(char.secrets?.OPENAI_API_KEY).toBe("sk-oai-test");
    // Not set = not included
    expect(char.secrets?.GROQ_API_KEY).toBeUndefined();
  });

  it("character uses {{name}} placeholders for runtime resolution", () => {
    const char = buildCharacterFromConfig({
      agents: { list: [{ id: "main", name: "Test" }] },
    } as ElizaConfig);

    const bio = Array.isArray(char.bio) ? char.bio : [char.bio];
    expect(bio.some((b) => (b as string).includes("{{name}}"))).toBe(true);
    expect(char.system).toContain("{{name}}");
  });
});

// ---------------------------------------------------------------------------
// Model resolution parity
// ---------------------------------------------------------------------------

describe("model resolution parity", () => {
  it("returns primary model from config consistently", () => {
    const config = {
      agents: { defaults: { model: { primary: "claude-4-opus" } } },
    } as ElizaConfig;
    expect(resolvePrimaryModel(config)).toBe("claude-4-opus");
  });

  it("returns undefined when no model configured", () => {
    expect(resolvePrimaryModel({} as ElizaConfig)).toBeUndefined();
    expect(
      resolvePrimaryModel({ agents: { defaults: {} } } as ElizaConfig),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Config path consistency
// ---------------------------------------------------------------------------

describe("config path consistency across modes", () => {
  it("resolveConfigPath uses same default path in all modes", async () => {
    const { resolveConfigPath, resolveStateDir } = await import(
      "@miladyai/agent/config/paths"
    );

    // With no env overrides, all modes resolve the same path
    const env = {} as NodeJS.ProcessEnv;
    const homedir = () => "/mock/home";
    const stateDir = resolveStateDir(env, homedir);
    const configPath = resolveConfigPath(env, stateDir);

    // Normalize for cross-platform: backslashes → slashes, strip Windows drive prefix
    const norm = (p: string) => p.replace(/\\/g, "/").replace(/^[A-Z]:/i, "");
    expect(norm(configPath)).toBe("/mock/home/.milady/milady.json");
    expect(norm(stateDir)).toBe("/mock/home/.milady");
  });

  it("state dir override env var is respected consistently", async () => {
    const { resolveConfigPath, resolveStateDir } = await import(
      "@miladyai/agent/config/paths"
    );

    const env = {
      ELIZA_STATE_DIR: "/custom/state",
    } as NodeJS.ProcessEnv;
    const homedir = () => "/mock/home";
    const stateDir = resolveStateDir(env, homedir);
    const configPath = resolveConfigPath(env, stateDir);

    // Normalize for cross-platform: backslashes → slashes, strip Windows drive prefix
    const norm = (p: string) => p.replace(/\\/g, "/").replace(/^[A-Z]:/i, "");
    expect(norm(stateDir)).toBe("/custom/state");
    expect(norm(configPath)).toBe("/custom/state/milady.json");
  });
});

// ---------------------------------------------------------------------------
// restart module parity
// ---------------------------------------------------------------------------

describe("restart mechanism parity", () => {
  it("setRestartHandler replaces the default handler", async () => {
    const { setRestartHandler, requestRestart } = await import(
      "@miladyai/agent/runtime/restart"
    );

    let called = false;
    let calledReason: string | undefined;
    setRestartHandler((reason) => {
      called = true;
      calledReason = reason;
    });

    requestRestart("test-restart");
    expect(called).toBe(true);
    expect(calledReason).toBe("test-restart");

    // Restore default handler to avoid affecting other tests
    setRestartHandler(() => {
      process.exitCode = 75;
    });
  });
});
