---
title: Plugins Overview
sidebarTitle: Overview
description: Milady's plugin system provides modular capabilities — model providers, platform connectors, DeFi integrations, and custom features.
---

Plugins are the primary extension mechanism for Milady. Every capability beyond the core runtime — from LLM providers to blockchain interactions — is delivered as a plugin.

## What is a Plugin?

A plugin is a self-contained module that registers one or more of:

- **Actions** — Things the agent can do (e.g., send a tweet, swap tokens)
- **Providers** — Context injected into the agent's prompt (e.g., wallet balance, time)
- **Evaluators** — Post-processing logic that runs after each response
- **Services** — Long-running background processes (e.g., cron jobs, event listeners)

## Plugin Categories

<CardGroup cols={2}>

<Card title="Core Plugins" icon="cube" href="/plugin-registry/knowledge">
  Essential plugins that ship with every Milady installation — knowledge, database, form, cron, shell, agent-skills, trajectory-logger, and agent-orchestrator.
</Card>

<Card title="Model Providers" icon="brain" href="/plugin-registry/llm/openai">
  LLM integrations for OpenAI, Anthropic, Google Gemini, Google Antigravity, Groq, Ollama, OpenRouter, DeepSeek, xAI, Mistral, Cohere, Together, Qwen, Minimax, Pi AI, Perplexity, Zai, Vercel AI Gateway, and Eliza Cloud.
</Card>

<Card title="Platform Connectors" icon="plug" href="/plugin-registry/platform/discord">
  Bridges to 19 messaging platforms — Discord, Telegram, Twitter, Slack, WhatsApp, Signal, iMessage, BlueBubbles, Blooio, MS Teams, Google Chat, Mattermost, Farcaster, Twitch, WeChat, Feishu, Matrix, Nostr, Lens, and Retake.
</Card>

<Card title="DeFi & Blockchain" icon="wallet" href="/plugin-registry/defi/evm">
  On-chain interactions for EVM chains and Solana — token transfers, swaps, and DeFi protocols.
</Card>

<Card title="Feature Plugins" icon="wand-magic-sparkles" href="/plugin-registry/browser">
  Extended capabilities — browser control, image generation, text-to-speech, speech-to-text, computer use, cron scheduling, vision, shell, webhooks, FAL media generation, Suno music, and more.
</Card>

</CardGroup>

## How Plugins Load

Plugins are loaded during runtime initialization in this order:

1. **Milady plugin** — The bridge plugin (`createMiladyPlugin()`) providing workspace context, session keys, emotes, custom actions, and lifecycle actions. Always first in the plugins array.
2. **Pre-registered plugins** — `@elizaos/plugin-sql` and `@elizaos/plugin-local-embedding` are pre-registered before `runtime.initialize()` to prevent race conditions.
3. **Core plugins** — Always loaded: `sql`, `local-embedding`, `form`, `knowledge`, `trajectory-logger`, `agent-orchestrator`, `cron`, `shell`, `agent-skills` (see `src/runtime/core-plugins.ts`). Additional plugins like `pdf`, `browser`, `computeruse`, `obsidian`, `vision`, `edge-tts`, and `elevenlabs` are optional and loaded when their feature flags or environment variables are configured.
4. **Auto-enabled plugins** — Connector, provider, feature, and streaming plugins are auto-enabled based on config and environment variables (see [Architecture](/plugins/architecture) for the full maps).
5. **Ejected plugins** — Local overrides discovered from `~/.milady/plugins/ejected/`. When an ejected copy exists, it takes priority over the npm-published version.
6. **User-installed plugins** — Tracked in `plugins.installs` in `milady.json`. Collected before drop-in plugins; any plugin name already present here takes precedence.
7. **Custom/drop-in plugins** — Scanned from `~/.milady/plugins/custom/` and any extra paths in `plugins.load.paths`. Plugins whose names already exist in `plugins.installs` are skipped (`mergeDropInPlugins` precedence rule).

```json
// milady.json plugin configuration
{
  "plugins": {
    "allow": ["@elizaos/plugin-openai", "discord"],
    "entries": {
      "openai": { "enabled": true }
    }
  },
  "connectors": {
    "discord": { "token": "..." }
  }
}
```

## Plugin Lifecycle

```
Install → Register → Initialize → Active → Shutdown
```

1. **Install** — Plugin package is resolved (npm or local)
2. **Register** — Actions, providers, evaluators, and services are registered with the runtime
3. **Initialize** — `init()` is called with runtime context
4. **Active** — Plugin processes events and provides capabilities
5. **Shutdown** — `cleanup()` is called on runtime stop

## Managing Plugins

### Install from Registry

```bash
milady plugins install @elizaos/plugin-openai
```

### List Installed Plugins

```bash
milady plugins list
```

### Enable/Disable

```bash
milady plugins enable plugin-name
milady plugins disable plugin-name
```

### Eject (Copy to Local)

```bash
milady plugins eject plugin-name
```

See [Plugin Eject](/plugins/plugin-eject) for details on customizing ejected plugins.

## Related

- [Plugin Architecture](/plugins/architecture) — Deep dive into the plugin system
- [Create a Plugin](/plugins/create-a-plugin) — Step-by-step tutorial
- [Plugin Development](/plugins/development) — Development guide and API
- [Plugin Registry](/plugins/registry) — Browse available plugins
