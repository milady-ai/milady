---
title: "Retake Plugin"
sidebarTitle: "Retake"
description: "Retake connector for Milady — messaging and streaming integration."
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

- Retake platform messaging
- Session management

## Streaming

Retake also supports streaming output as a destination. See [Streaming](/skills/streaming) for details.
