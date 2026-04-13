---
title: "Plugin Architecture"
sidebarTitle: "Architecture"
description: "Deep dive into Milady's plugin system — registration lifecycle, hook points, auto-enable mechanism, and dependency resolution."
---

The Milady plugin system is built on elizaOS core. Every capability beyond the base runtime — model providers, platform connectors, DeFi integrations, scheduling, and custom features — is delivered as a plugin.

## System Design

Plugins are isolated modules that register capabilities with the `AgentRuntime`. The runtime orchestrates plugin loading, dependency resolution, initialization, and shutdown.

```
AgentRuntime
├── Core Plugins     (always loaded)
├── Auto-enabled     (triggered by env vars / config)
├── Character        (specified in character file)
└── Local            (from plugins/ directory)
```

The source of truth for which plugins are always loaded lives in `packages/agent/src/runtime/core-plugins.ts` (re-exported by `packages/app-core/src/runtime/core-plugins.ts`):

```typescript
export const CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-sql",               // database adapter — required
  "@elizaos/plugin-local-embedding",   // local embeddings — required for memory
  "@elizaos/plugin-form",              // form handling for guided user journeys
  "knowledge",         // RAG knowledge management — required for knowledge tab
  "trajectories", // trajectory logging for debugging and RL training
  "@elizaos/plugin-agent-orchestrator",// multi-agent orchestration (PTY, SwarmCoordinator, workspace provisioning)
  "@elizaos/plugin-cron",              // scheduled jobs and automation
  "@elizaos/plugin-shell",             // shell command execution
  "@elizaos/plugin-agent-skills",      // skill execution and marketplace runtime
  "@elizaos/plugin-commands",          // slash command handling (skills auto-register as /commands)
  "@elizaos/plugin-plugin-manager",    // dynamic plugin management for registry/plugin installs
  "roles",                            // internal role-based access control (OWNER/ADMIN/NONE)
];
```

> **Note:** `@elizaos/plugin-secrets-manager`, `relationships`, `@elizaos/plugin-trust`, `@elizaos/plugin-personality`, and `@elizaos/plugin-experience` are statically imported for fast resolution but commented out of the core list. They may be re-enabled in a future release. Milady does not ship `@elizaos/plugin-todo`; todo functionality is handled by the workbench API and LifeOps-related runtime tasks.

### Optional Core Plugins

A separate list of optional core plugins can be enabled from the admin panel. These are not loaded by default due to packaging or specification constraints. The list lives in `packages/agent/src/runtime/core-plugins.ts`:

```typescript
export const OPTIONAL_CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-pdf",                   // PDF processing
  "@elizaos/plugin-cua",                   // CUA computer-use agent (cloud sandbox automation)
  "@elizaos/plugin-obsidian",              // Obsidian vault CLI integration
  "@elizaos/plugin-code",                  // code writing and file operations
  "@elizaos/plugin-repoprompt",            // RepoPrompt CLI integration
  "@elizaos/plugin-claude-code-workbench", // Claude Code companion workflows
  "@elizaos/plugin-computeruse",           // computer use automation (platform-specific)
  "@elizaos/plugin-browser",              // browser automation (requires stagehand-server)
  "@elizaos/plugin-vision",               // vision/image understanding (feature-gated)
  "@elizaos/plugin-cli",                  // CLI interface
  "@elizaos/plugin-discord",              // Discord bot integration
  "@elizaos/plugin-telegram",             // Telegram bot integration
  "@elizaos/plugin-twitch",               // Twitch integration
  "@elizaos/plugin-edge-tts",             // text-to-speech (Microsoft Edge TTS)
  "@elizaos/plugin-elevenlabs",           // ElevenLabs text-to-speech
];
```

Plugins such as `@elizaos/plugin-directives`, `@elizaos/plugin-mcp`, and `@elizaos/plugin-scheduling` are commented out in the source and may be activated in future releases.

## Plugin Hook Points

A plugin can register any combination of the following hook points:

| Hook | Type | Purpose |
|------|------|---------|
| `actions` | `Action[]` | Things the agent can do; the LLM selects actions from this list |
| `providers` | `Provider[]` | Context injected into the prompt before each LLM call |
| `evaluators` | `Evaluator[]` | Post-response assessment; can trigger follow-up actions |
| `services` | `ServiceClass[]` | Long-running background processes |
| `routes` | `Route[]` | HTTP endpoints exposed by the agent API server |
| `events` | `Record<EventName, Handler[]>` | Callbacks for runtime events |
| `models` | `Record<ModelType, Handler>` | Custom model inference handlers |

## Registration Lifecycle

```
1. Resolve      — Plugin package is located (npm, local, workspace)
2. Import       — Module is dynamically imported and shape is validated
3. Sort         — Plugins are ordered by dependencies and priority field
4. Init         — plugin.init(config, runtime) is called
5. Register     — actions, providers, services, routes, events are registered
6. Active       — Plugin responds to messages and events
7. Shutdown     — plugin.cleanup() / service.stop() called on exit
```

### Plugin Interface

```typescript
interface Plugin {
  name: string;
  description: string;

  // Lifecycle
  init?: (config: Record<string, unknown>, runtime: IAgentRuntime) => Promise<void>;

  // Hook points
  actions?: Action[];
  providers?: Provider[];
  evaluators?: Evaluator[];
  services?: ServiceClass[];
  routes?: Route[];
  events?: Record<string, Handler[]>;
  models?: Record<string, ModelHandler>;
  componentTypes?: ComponentType[];

  // Load order
  priority?: number;          // Higher = loaded later
  dependencies?: string[];    // Other plugin names this depends on
  tests?: TestSuite[];
}
```

## Auto-Enable Mechanism

Plugins are automatically enabled when their required configuration is detected. This logic lives in `packages/agent/src/config/plugin-auto-enable.ts` (extended by `packages/app-core/src/config/plugin-auto-enable.ts` for Eliza-specific connectors like WeChat) and runs before runtime initialization.

### Trigger Sources

**Environment variable API keys** — The `AUTH_PROVIDER_PLUGINS` map connects env vars to plugin package names:

```typescript
const AUTH_PROVIDER_PLUGINS = {
  ANTHROPIC_API_KEY:              "@elizaos/plugin-anthropic",
  CLAUDE_API_KEY:                 "@elizaos/plugin-anthropic",
  OPENAI_API_KEY:                 "@elizaos/plugin-openai",
  AI_GATEWAY_API_KEY:             "@elizaos/plugin-vercel-ai-gateway",
  AIGATEWAY_API_KEY:              "@elizaos/plugin-vercel-ai-gateway",
  GOOGLE_API_KEY:                 "@elizaos/plugin-google-genai",
  GOOGLE_GENERATIVE_AI_API_KEY:   "@elizaos/plugin-google-genai",
  GOOGLE_CLOUD_API_KEY:           "@elizaos/plugin-google-antigravity",
  GROQ_API_KEY:                   "@elizaos/plugin-groq",
  XAI_API_KEY:                    "@elizaos/plugin-xai",
  GROK_API_KEY:                   "@elizaos/plugin-xai",
  OPENROUTER_API_KEY:             "@elizaos/plugin-openrouter",
  OLLAMA_BASE_URL:                "@elizaos/plugin-ollama",
  ZAI_API_KEY:                    "@homunculuslabs/plugin-zai",
  DEEPSEEK_API_KEY:               "@elizaos/plugin-deepseek",
  TOGETHER_API_KEY:               "@elizaos/plugin-together",
  MISTRAL_API_KEY:                "@elizaos/plugin-mistral",
  COHERE_API_KEY:                 "@elizaos/plugin-cohere",
  PERPLEXITY_API_KEY:             "@elizaos/plugin-perplexity",
  ELIZAOS_CLOUD_API_KEY:          "@elizaos/plugin-elizacloud",
  ELIZAOS_CLOUD_ENABLED:          "@elizaos/plugin-elizacloud",
  ELIZA_USE_PI_AI:                "@elizaos/plugin-pi-ai",
  CUA_API_KEY:                    "@elizaos/plugin-cua",
  CUA_HOST:                       "@elizaos/plugin-cua",
  OBSIDIAN_VAULT_PATH:            "@elizaos/plugin-obsidian",
  REPOPROMPT_CLI_PATH:            "@elizaos/plugin-repoprompt",
  CLAUDE_CODE_WORKBENCH_ENABLED:  "@elizaos/plugin-claude-code-workbench",
};
```

**Connector configuration** — Connector blocks with a `botToken`, `token`, or `apiKey` field auto-enable the corresponding connector plugin:

```typescript
const CONNECTOR_PLUGINS = {
  telegram:    "@elizaos/plugin-telegram",
  discord:     "@elizaos/plugin-discord",
  slack:       "@elizaos/plugin-slack",
  twitter:     "@elizaos/plugin-twitter",
  whatsapp:    "@elizaos/plugin-whatsapp",
  signal:      "@elizaos/plugin-signal",
  imessage:    "@elizaos/plugin-imessage",
  farcaster:   "@elizaos/plugin-farcaster",
  lens:        "@elizaos/plugin-lens",
  msteams:     "@elizaos/plugin-msteams",
  mattermost:  "@elizaos/plugin-mattermost",
  googlechat:  "@elizaos/plugin-google-chat",
  feishu:      "@elizaos/plugin-feishu",
  matrix:      "@elizaos/plugin-matrix",
  nostr:       "@elizaos/plugin-nostr",
  blooio:      "@elizaos/plugin-blooio",
  twitch:      "@elizaos/plugin-twitch",
  wechat:      "@elizaos/plugin-wechat",  // Milady-specific (added in app-core)
};
```

> **Note:** The upstream `packages/agent` defines all `@elizaos/*` connectors. Milady's `packages/app-core` extends this map with the `wechat` entry pointing to `@elizaos/plugin-wechat`.

**Feature flags** — The `features` section of `milady.json` auto-enables feature plugins. A feature can be enabled with `features.<name>: true` or `features.<name>.enabled: true`:

```json
{
  "features": {
    "browser": true,
    "imageGen": true,
    "tts": { "enabled": true }
  }
}
```

The complete `FEATURE_PLUGINS` map:

```typescript
const FEATURE_PLUGINS = {
  browser:              "@elizaos/plugin-browser",
  cua:                  "@elizaos/plugin-cua",
  obsidian:             "@elizaos/plugin-obsidian",
  cron:                 "@elizaos/plugin-cron",
  shell:                "@elizaos/plugin-shell",
  imageGen:             "@elizaos/plugin-image-generation",
  tts:                  "@elizaos/plugin-tts",
  stt:                  "@elizaos/plugin-stt",
  agentSkills:          "@elizaos/plugin-agent-skills",
  commands:             "@elizaos/plugin-commands",
  diagnosticsOtel:      "@elizaos/plugin-diagnostics-otel",
  webhooks:             "@elizaos/plugin-webhooks",
  gmailWatch:           "@elizaos/plugin-gmail-watch",
  personality:          "@elizaos/plugin-personality",
  experience:           "@elizaos/plugin-experience",
  form:                 "@elizaos/plugin-form",
  x402:                 "@elizaos/plugin-x402",
  fal:                  "@elizaos/plugin-fal",
  suno:                 "@elizaos/plugin-suno",
  vision:               "@elizaos/plugin-vision",
  computeruse:          "@elizaos/plugin-computeruse",
  repoprompt:           "@elizaos/plugin-repoprompt",
  claudeCodeWorkbench:  "@elizaos/plugin-claude-code-workbench",
};
```

**Streaming destinations** — The `streaming` section of config auto-enables streaming plugins for live video platforms:

```typescript
const STREAMING_PLUGINS = {
  twitch:     "@elizaos/plugin-twitch-streaming",
  youtube:    "@elizaos/plugin-youtube-streaming",
  customRtmp: "@elizaos/plugin-custom-rtmp",
  pumpfun:    "@elizaos/plugin-pumpfun-streaming",
  x:          "@elizaos/plugin-x-streaming",
};
```

**Auth profiles** — Auth profiles specifying a provider name trigger loading of the matching provider plugin.

### Opting Out

Individual plugins can be disabled even when their env vars are present:

```json
{
  "plugins": {
    "entries": {
      "anthropic": { "enabled": false }
    }
  }
}
```

Setting `plugins.enabled: false` in config disables auto-enable for all optional plugins.

## Dependency Resolution

Plugins are sorted topologically before initialization. If plugin B lists plugin A in its `dependencies` array, A will always initialize before B.

The `priority` field provides coarse ordering independent of dependency edges. Lower priority values initialize earlier (default: `0`).

## Plugin Isolation

Each plugin receives:

- A reference to the shared `AgentRuntime` (read-only access to other plugins' registered capabilities)
- Its own configuration namespace
- Secrets injected by the secrets manager at init time

Plugins do not share mutable state directly — they communicate through the runtime's service registry and event system.

## Module Shape

When a plugin package is dynamically imported, the runtime checks for a plugin export in this order:

1. `module.default`
2. `module.plugin`
3. Any key whose value matches the Plugin interface shape

```typescript
interface PluginModuleShape {
  default?: Plugin;
  plugin?: Plugin;
  [key: string]: Plugin | undefined;
}
```

## Related

- [Create a Plugin](/plugins/create-a-plugin) — Build a plugin from scratch
- [Plugin Patterns](/plugins/patterns) — Common implementation patterns
- [Plugin Schemas](/plugins/schemas) — Full schema reference
- [Plugin Registry](/plugins/registry) — Browse available plugins
