---
title: Discord Connector
sidebarTitle: Discord
description: Connect your agent to Discord using the @elizaos/plugin-discord package.
---

Connect your agent to Discord servers and DMs.

## Overview

The Discord connector is an external ElizaOS plugin that bridges your agent to Discord. It is auto-enabled by the runtime when a valid token is detected in your connector configuration.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-discord` |
| Config key | `connectors.discord` |
| Auto-enable trigger | `botToken`, `token`, or `apiKey` is truthy in connector config |

## Minimal Configuration

In your character file:

```json
{
  "connectors": {
    "discord": {
      "botToken": "your-discord-bot-token"
    }
  }
}
```

To explicitly disable the connector even when a token is present:

```json
{
  "connectors": {
    "discord": {
      "botToken": "your-discord-bot-token",
      "enabled": false
    }
  }
}
```

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.discord` in your character config. If any of the fields `botToken`, `token`, or `apiKey` is truthy (and `enabled` is not explicitly `false`), the runtime automatically loads `@elizaos/plugin-discord`.

No environment variable is required to trigger auto-enable -- it is driven entirely by the connector config object.

## Environment Variables

When the connector is loaded, the runtime pushes the following secrets from your config into `process.env` for the plugin to consume:

| Variable | Description |
|----------|-------------|
| `DISCORD_API_TOKEN` | Discord API token |
| `DISCORD_APPLICATION_ID` | Discord application ID |
| `DISCORD_BOT_TOKEN` | Discord bot token |

## Plugin Configuration

Detailed configuration options (channels, permissions, slash commands, voice support, etc.) are defined by the `@elizaos/plugin-discord` package itself. See plugin documentation for [`@elizaos/plugin-discord`](https://www.npmjs.com/package/@elizaos/plugin-discord) for the full set of supported options.
