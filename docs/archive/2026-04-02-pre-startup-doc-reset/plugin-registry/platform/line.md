---
title: "LINE Plugin"
sidebarTitle: "LINE"
description: "LINE connector for Milady — bot integration with the LINE messaging platform."
---

The LINE plugin connects Milady agents to LINE as a bot, enabling message handling in chats and groups.

**Package:** `@elizaos/plugin-line`

## Installation

```bash
milady plugins install line
```

## Setup

### 1. Create a LINE Messaging API Channel

1. Go to [LINE Developers Console](https://developers.line.biz/console/)
2. Create a new provider (or use an existing one)
3. Create a new **Messaging API** channel
4. Under the **Messaging API** tab, issue a **Channel access token**
5. Note the **Channel secret** from the **Basic settings** tab

### 2. Configure Milady

```json
{
  "connectors": {
    "line": {
      "channelAccessToken": "YOUR_CHANNEL_ACCESS_TOKEN",
      "channelSecret": "YOUR_CHANNEL_SECRET"
    }
  }
}
```

Or via environment variables:

```bash
export LINE_CHANNEL_ACCESS_TOKEN=YOUR_CHANNEL_ACCESS_TOKEN
export LINE_CHANNEL_SECRET=YOUR_CHANNEL_SECRET
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `channelAccessToken` | Yes | LINE Messaging API channel access token |
| `channelSecret` | Yes | LINE channel secret |
| `enabled` | No | Set `false` to disable (default: `true`) |

## Environment Variables

```bash
export LINE_CHANNEL_ACCESS_TOKEN=YOUR_CHANNEL_ACCESS_TOKEN
export LINE_CHANNEL_SECRET=YOUR_CHANNEL_SECRET
```

## Related

- [Connectors Guide](/guides/connectors) — General connector documentation
