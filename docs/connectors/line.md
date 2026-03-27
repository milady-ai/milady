---
title: LINE Connector
sidebarTitle: LINE
description: Connect your agent to LINE using the @elizaos/plugin-line package.
---

Connect your agent to LINE for bot messaging and customer conversations.

## Overview

The LINE connector is an elizaOS plugin that bridges your agent to LINE Messaging API. It supports rich message types, group chat, and webhook-based event handling. This connector is available from the plugin registry.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-line` |
| Config key | `connectors.line` |
| Install | `milady plugins install line` |

## Setup Requirements

- LINE Channel access token
- LINE Channel secret
- Create a Messaging API channel at [developers.line.biz](https://developers.line.biz)

## Configuration

```json
{
  "connectors": {
    "line": {
      "enabled": true
    }
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LINE_CHANNEL_ACCESS_TOKEN` | Channel access token from LINE Developer Console |
| `LINE_CHANNEL_SECRET` | Channel secret for webhook verification |
| `LINE_WEBHOOK_PATH` | Custom webhook path for receiving LINE events |
| `LINE_DM_POLICY` | DM policy (e.g., `allow`, `deny`, `allowlist`) |
| `LINE_GROUP_POLICY` | Group message policy (e.g., `allow`, `deny`) |
| `LINE_ALLOW_FROM` | Comma-separated list of allowed user IDs |
| `LINE_ENABLED` | Set to `true` to enable the LINE connector |

## Webhook Setup

After creating your Messaging API channel at [developers.line.biz](https://developers.line.biz):

1. Set the **Webhook URL** in the LINE Developer Console to point to your Milady instance (e.g., `https://your-domain.com/webhook/line` or use the path configured via `LINE_WEBHOOK_PATH`).
2. Enable **Use webhook** in the channel settings.
3. Verify the webhook is receiving events by sending a test message to your bot.

## Features

- Bot messaging and customer conversations
- Rich message types (text, sticker, image, video)
- Group chat support
- Webhook-based event handling
- Configurable DM and group access policies

## Related

- [Connectors overview](/guides/connectors#line)
