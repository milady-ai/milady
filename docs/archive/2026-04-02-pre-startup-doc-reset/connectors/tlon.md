---
title: Tlon Connector
sidebarTitle: Tlon
description: Connect your agent to Tlon/Urbit using the @elizaos/plugin-tlon package.
---

Connect your agent to the Urbit network via Tlon for ship-to-ship messaging.

## Overview

The Tlon connector is an elizaOS plugin that bridges your agent to the Urbit network. It supports ship-to-ship messaging and group chat participation. This connector is available from the plugin registry.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-tlon` |
| Config key | `connectors.tlon` |
| Install | `milady plugins install tlon` |

## Setup Requirements

- Tlon ship credentials (Urbit ship name and access code)

## Configuration

```json
{
  "connectors": {
    "tlon": {
      "enabled": true
    }
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TLON_SHIP` | Urbit ship name |
| `TLON_CODE` | Ship access code |
| `TLON_URL` | Ship URL |

## Features

- Urbit-based chat and social interactions
- Ship-to-ship messaging
- Group chat participation

## Related

- [Connectors overview](/guides/connectors#tlon)
