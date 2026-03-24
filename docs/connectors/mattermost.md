---
title: Mattermost Connector
sidebarTitle: Mattermost
description: Connect your agent to Mattermost using the @elizaos/plugin-mattermost package.
---

Connect your agent to a self-hosted Mattermost server for channel and DM conversations.

## Overview

The Mattermost connector is an external elizaOS plugin that bridges your agent to a Mattermost server as a bot. It is auto-enabled by the runtime when a valid bot token is detected in your connector configuration.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-mattermost` |
| Config key | `connectors.mattermost` |
| Auto-enable trigger | `botToken` is truthy in connector config |

## Minimal Configuration

In your character file:

```json
{
  "connectors": {
    "mattermost": {
      "botToken": "YOUR_BOT_TOKEN",
      "baseUrl": "https://chat.example.com"
    }
  }
}
```

## Disabling

To explicitly disable the connector even when a token is present:

```json
{
  "connectors": {
    "mattermost": {
      "botToken": "YOUR_BOT_TOKEN",
      "baseUrl": "https://chat.example.com",
      "enabled": false
    }
  }
}
```

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.mattermost` in your character config. If the `botToken` field is truthy (and `enabled` is not explicitly `false`), the runtime automatically loads `@elizaos/plugin-mattermost`.

No environment variable is required to trigger auto-enable — it is driven entirely by the connector config object.

## Environment Variables

When the connector is loaded, the runtime pushes the following secrets from your config into `process.env` for the plugin to consume:

| Variable | Source | Description |
|----------|--------|-------------|
| `MATTERMOST_BOT_TOKEN` | `botToken` | Bot token from Mattermost System Console |
| `MATTERMOST_BASE_URL` | `baseUrl` | Base URL for the Mattermost server |

## Full Configuration Reference

All fields are defined under `connectors.mattermost` in your character file.

### Core Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `botToken` | string | — | Bot token from Mattermost System Console (required) |
| `baseUrl` | string | — | Base URL for your Mattermost server (required) |
| `enabled` | boolean | — | Explicitly enable/disable |
| `chatmode` | `"dm-only"` \| `"channel-only"` \| `"all"` | `"all"` | Restrict which chat types the bot responds in |
| `requireMention` | boolean | `false` | Only respond when @mentioned |
| `oncharPrefixes` | string[] | — | Custom command prefixes that trigger agent responses |
| `configWrites` | boolean | `true` | Allow config writes from channel events |

### Chat Mode

The `chatmode` field controls where the bot responds:

| Mode | Behavior |
|------|----------|
| `"all"` | Responds in both DMs and channels (default) |
| `"dm-only"` | Responds only in direct messages |
| `"channel-only"` | Responds only in channels |

```json
{
  "connectors": {
    "mattermost": {
      "botToken": "YOUR_BOT_TOKEN",
      "baseUrl": "https://chat.example.com",
      "chatmode": "all",
      "requireMention": true,
      "oncharPrefixes": ["!", "/ask"]
    }
  }
}
```

### Self-Hosted Server Support

The Mattermost connector works with any Mattermost server deployment, including self-hosted instances. Set `baseUrl` to your server's URL and ensure the Milady host can reach it over the network.

## Multi-Account Support

Mattermost does not support multi-account configuration. Each agent runs a single Mattermost bot.

## Related

- [Mattermost plugin reference](/plugin-registry/platform/mattermost)
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
