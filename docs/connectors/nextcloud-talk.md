---
title: Nextcloud Talk Connector
sidebarTitle: Nextcloud Talk
description: Connect your agent to Nextcloud Talk using the @elizaos/plugin-nextcloud-talk package.
---

Connect your agent to Nextcloud Talk for self-hosted collaboration messaging.

## Overview

The Nextcloud Talk connector is an elizaOS plugin that bridges your agent to Nextcloud Talk rooms. It supports DM and group conversations on self-hosted Nextcloud instances. This connector is available from the plugin registry.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-nextcloud-talk` |
| Config key | `connectors.nextcloud-talk` |
| Install | `milady plugins install nextcloud-talk` |

## Setup Requirements

- Nextcloud server URL and credentials

## Configuration

```json
{
  "connectors": {
    "nextcloud-talk": {
      "enabled": true
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTCLOUD_URL` | No | Nextcloud server URL |
| `NEXTCLOUD_BOT_SECRET` | No | Bot secret for authentication |
| `NEXTCLOUD_WEBHOOK_HOST` | No | Host address for webhook listener |
| `NEXTCLOUD_WEBHOOK_PORT` | No | Port for webhook listener |
| `NEXTCLOUD_WEBHOOK_PATH` | No | Webhook endpoint path |
| `NEXTCLOUD_WEBHOOK_PUBLIC_URL` | No | Public-facing webhook URL |
| `NEXTCLOUD_ALLOWED_ROOMS` | No | Comma-separated list of allowed room IDs |
| `NEXTCLOUD_ENABLED` | No | Set to `true` to enable |

## Features

- Room-based messaging
- DM and group conversation support
- Self-hosted collaboration platform integration
- Webhook-based message delivery

## Related

- [Connectors overview](/guides/connectors#nextcloud-talk)
