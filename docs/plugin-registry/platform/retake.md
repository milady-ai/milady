---
title: "Retake Plugin"
sidebarTitle: "Retake"
description: "Retake connector for Milady — messaging and streaming integration with the Retake platform."
---

The Retake plugin connects Milady agents to the Retake platform, supporting both messaging and streaming output.

**Package:** `@elizaos/plugin-retake`

## Installation

```bash
milady plugins install retake
```

## Setup

### Configure Milady

```json
{
  "connectors": {
    "retake": {
      "accessToken": "your-retake-access-token"
    }
  }
}
```

Or use environment variables:

```bash
export RETAKE_ACCESS_TOKEN=your-retake-access-token
```

## Auto-Enable

The plugin auto-enables when any of these are present:

- `accessToken` in connector config
- `enabled: true` in connector config

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `accessToken` | Yes* | Retake platform access token |
| `enabled` | No | Force-enable without credentials |

\* Either `accessToken` or `enabled: true` is required.

## Features

- Retake platform messaging and interaction
- Session management and message routing
- Streaming output as a destination

## Streaming

Retake also functions as a streaming destination. When configured, agent output can be streamed live to the Retake platform alongside or instead of messaging.

## Related

- [Twitch Plugin](/plugin-registry/platform/twitch) — Another platform with streaming support
- [Connectors Guide](/guides/connectors#retake) — Full configuration reference
