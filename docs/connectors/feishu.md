---
title: Feishu / Lark Connector
sidebarTitle: Feishu
description: Connect your agent to Feishu (Lark) using the @elizaos/plugin-feishu package.
---

Connect your agent to Feishu (known as Lark outside China) for bot interactions, group chats, and workflow notifications.

## Overview

The Feishu connector is an external elizaOS plugin that integrates your agent with the Feishu/Lark platform. It supports bot messaging, group chats, and is auto-enabled when valid application credentials are configured.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-feishu` |
| Config key | `connectors.feishu` |
| Auto-enable trigger | `FEISHU_APP_ID` and `FEISHU_APP_SECRET` are set |

## Minimal Configuration

```json
{
  "env": {
    "FEISHU_APP_ID": "cli_your_app_id",
    "FEISHU_APP_SECRET": "your_app_secret"
  },
  "connectors": {
    "feishu": {
      "enabled": true
    }
  }
}
```

## Disabling

```json
{
  "connectors": {
    "feishu": {
      "enabled": false
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FEISHU_APP_ID` | Yes | Feishu/Lark application ID (`cli_xxx` format) for bot authentication |
| `FEISHU_APP_SECRET` | Yes | Feishu/Lark application secret for bot authentication |
| `FEISHU_DOMAIN` | No | Domain to use: `feishu` for China or `lark` for global. Defaults to `feishu` |
| `FEISHU_ALLOWED_CHATS` | No | JSON-encoded array of chat IDs authorized to interact with the bot |
| `FEISHU_TEST_CHAT_ID` | No | Chat ID used by the test suite for validation |

## Setup

1. Go to the [Feishu Open Platform](https://open.feishu.cn/) (or [Lark Developer](https://open.larksuite.com/) for global).
2. Create a new Custom App and note the **App ID** and **App Secret**.
3. Under **Bot**, enable the bot capability for your app.
4. Configure **Event Subscriptions** with a request URL pointing to your Milady instance.
5. Add the required permissions: `im:message`, `im:message.group_at_msg`, `im:message.p2p_msg`.
6. Publish the app version and have an admin approve it.
7. Add the credentials to your Milady config.

## Features

- **Bot messaging** — Respond to direct messages from users
- **Group chats** — Participate in group conversations
- **Chat allowlist** — Restrict the bot to specific authorized chats
- **China and global support** — Works with both `feishu.cn` and `larksuite.com` domains

## Related

- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
