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
      "enablePosting": true,
      "postIntervalMin": 90,
      "postIntervalMax": 180,
      "enableDms": true
    }
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BLUESKY_HANDLE` | Bluesky handle (e.g., `yourname.bsky.social`) |
| `BLUESKY_PASSWORD` | App password (not your main password) |
| `BLUESKY_ENABLED` | Enables or disables the Bluesky plugin |
| `BLUESKY_DRY_RUN` | Set to `true` for testing without posting |
| `BLUESKY_SERVICE` | Bluesky service URL (PDS instance) |
| `BLUESKY_MAX_POST_LENGTH` | Maximum characters allowed in a post |
| `BLUESKY_POLL_INTERVAL` | Polling interval in seconds for fetching notifications |
| `BLUESKY_ENABLE_POSTING` | Enables or disables posting to Bluesky |
| `BLUESKY_POST_INTERVAL_MIN` | Minimum interval in seconds between automated posts |
| `BLUESKY_POST_INTERVAL_MAX` | Maximum interval in seconds between automated posts |
| `BLUESKY_ENABLE_ACTION_PROCESSING` | Enables automated action processing for Bluesky events |
| `BLUESKY_ACTION_INTERVAL` | Interval in seconds between action-processing cycles |
| `BLUESKY_POST_IMMEDIATELY` | If `true`, posts are published immediately instead of waiting for schedule |
| `BLUESKY_MAX_ACTIONS_PROCESSING` | Maximum number of actions to process in a single batch |
| `BLUESKY_ENABLE_DMS` | Enable direct message processing via the chat.bsky API |

## Features

- Post creation at configurable intervals
- Mention and reply monitoring
- Direct message handling
- Dry run mode for testing
- AT Protocol-based decentralized social networking
- Configurable action processing

## Related

- [Connectors overview](/guides/connectors#bluesky)
