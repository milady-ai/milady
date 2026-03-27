---
title: Retake Connector
sidebarTitle: Retake
description: Connect your agent to Retake using the @elizaos/plugin-retake package.
---

Connect your agent to the Retake platform for messaging and streaming.

## Overview

The Retake connector is an external elizaOS plugin that bridges your agent to the Retake platform. It is auto-enabled when an access token is configured or `enabled: true` is set.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-retake` |
| Config key | `connectors.retake` |
| Auto-enable trigger | `accessToken` or `enabled: true` |

## Minimal Configuration

```json
{
  "connectors": {
    "retake": {
      "accessToken": "your-retake-access-token"
    }
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `RETAKE_AGENT_TOKEN` | Retake platform access token |

## Setup Steps

1. Obtain an access token from the Retake platform
2. Add it to `connectors.retake` in your config or set the `RETAKE_AGENT_TOKEN` environment variable
3. Start your agent — the Retake connector will auto-enable

## Streaming

Retake also supports streaming output as a destination. See [Streaming](/skills/streaming) for details.
