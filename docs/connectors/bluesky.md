---
title: Bluesky Connector
sidebarTitle: Bluesky
description: Connect your agent to Bluesky using the @elizaos/plugin-bluesky package.
---

Connect your agent to Bluesky for social posting and engagement on the AT Protocol network.

## Overview

The Bluesky connector is an elizaOS plugin that bridges your agent to Bluesky via the AT Protocol. It supports automated posting, mention monitoring, and reply handling.

Unlike the 19 auto-enabled connectors (Discord, Telegram, etc.), Bluesky is a **registry plugin** that must be installed manually before use. It is not auto-enabled from connector config alone.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-bluesky` |
| Config key | `connectors.bluesky` |
| Install | `milady plugins install bluesky` |

## Setup Requirements

- Bluesky account credentials (handle and app password)
- Generate an app password at [bsky.app/settings/app-passwords](https://bsky.app/settings/app-passwords)

## Configuration

```json
{
  "connectors": {
    "bluesky": {
      "enabled": true,
      "postEnable": true,
      "postIntervalMin": 90,
      "postIntervalMax": 180
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BLUESKY_HANDLE` | Yes | Bluesky handle (e.g., `yourname.bsky.social`) |
| `BLUESKY_PASSWORD` | Yes | App password (not your main password -- generate at bsky.app/settings/app-passwords) |
| `BLUESKY_ENABLED` | No | Set to `true` to enable |
| `BLUESKY_SERVICE` | No | Bluesky PDS instance URL (defaults to the main Bluesky service) |
| `BLUESKY_DRY_RUN` | No | Set to `true` for testing without posting |
| `BLUESKY_ENABLE_POSTING` | No | Enable or disable post creation |
| `BLUESKY_ENABLE_DMS` | No | Enable processing of direct messages via the chat.bsky API |
| `BLUESKY_POLL_INTERVAL` | No | Polling interval in seconds |

## Features

- Post creation at configurable intervals
- Mention and reply monitoring
- Dry run mode for testing
- AT Protocol-based decentralized social networking

## Related

- [Connectors overview](/guides/connectors#bluesky)
