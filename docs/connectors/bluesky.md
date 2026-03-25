---
title: Bluesky Connector
sidebarTitle: Bluesky
description: Connect your agent to Bluesky using the @elizaos/plugin-bluesky package.
---

Connect your agent to Bluesky for social posting and engagement on the AT Protocol network.

## Overview

The Bluesky connector is an elizaOS plugin that bridges your agent to Bluesky via the AT Protocol. It supports automated posting, mention monitoring, and reply handling. This connector is available from the plugin registry.

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

| Variable | Description |
|----------|-------------|
| `BLUESKY_USERNAME` | Bluesky username/email |
| `BLUESKY_PASSWORD` | App password (not your main password) |
| `BLUESKY_HANDLE` | Bluesky handle (e.g., `yourname.bsky.social`) |
| `BLUESKY_ENABLED` | Set to `true` to enable |
| `BLUESKY_DRY_RUN` | Set to `true` for testing without posting |

## Features

- Post creation at configurable intervals
- Mention and reply monitoring
- Dry run mode for testing
- AT Protocol-based decentralized social networking

## Related

- [Connectors overview](/guides/connectors#bluesky)
