---
title: Telegram Connector
sidebarTitle: Telegram
description: Connect your agent to Telegram using the @elizaos/plugin-telegram package.
---

Connect your agent to Telegram for private chats and group conversations.

## Overview

The Telegram connector is an external ElizaOS plugin that bridges your agent to Telegram via the Bot API. It is auto-enabled by the runtime when a valid token is detected in your connector configuration.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-telegram` |
| Config key | `connectors.telegram` |
| Auto-enable trigger | `botToken`, `token`, or `apiKey` is truthy in connector config |

## Minimal Configuration

In your character file:

```json
{
  "connectors": {
    "telegram": {
      "botToken": "your-telegram-bot-token"
    }
  }
}
```

To explicitly disable the connector even when a token is present:

```json
{
  "connectors": {
    "telegram": {
      "botToken": "your-telegram-bot-token",
      "enabled": false
    }
  }
}
```

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.telegram` in your character config. If any of the fields `botToken`, `token`, or `apiKey` is truthy (and `enabled` is not explicitly `false`), the runtime automatically loads `@elizaos/plugin-telegram`.

No environment variable is required to trigger auto-enable -- it is driven entirely by the connector config object.

## Environment Variables

When the connector is loaded, the runtime pushes the following secret from your config into `process.env` for the plugin to consume:

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from [@BotFather](https://t.me/BotFather) |

## Plugin Configuration

Detailed configuration options (group behavior, webhook vs polling, media handling, bot commands, etc.) are defined by the `@elizaos/plugin-telegram` package itself. See plugin documentation for [`@elizaos/plugin-telegram`](https://www.npmjs.com/package/@elizaos/plugin-telegram) for the full set of supported options.
