---
title: Blooio Connector
sidebarTitle: Blooio
description: Connect your agent to Blooio using the @elizaos/plugin-blooio package.
---

Connect your agent to the Blooio platform for messaging.

## Overview

The Blooio connector is an external elizaOS plugin that bridges your agent to the Blooio platform. It is auto-enabled when an API key is configured.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-blooio` |
| Config key | `connectors.blooio` |
| Auto-enable trigger | `apiKey`, `token`, or `botToken` |

## Minimal Configuration

```json
{
  "connectors": {
    "blooio": {
      "apiKey": "your-blooio-api-key"
    }
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BLOOIO_API_KEY` | Blooio platform API key |

## Setup Steps

1. Obtain an API key from the Blooio platform
2. Add it to `connectors.blooio` in your config or set the `BLOOIO_API_KEY` environment variable
3. Start your agent — the Blooio connector will auto-enable
