---
title: "Bluesky Plugin"
sidebarTitle: "Bluesky"
description: "Bluesky connector for Milady — post, reply, and interact on the AT Protocol network."
---

The Bluesky plugin connects Milady agents to the Bluesky social network via the AT Protocol, enabling posting, replying, and social interactions.

**Package:** `@elizaos/plugin-bluesky`

## Installation

```bash
milady plugins install bluesky
```

## Setup

### 1. Get Your Bluesky Credentials

1. Go to [bsky.app](https://bsky.app) and create an account (or use an existing one)
2. Note your handle (e.g., `yourname.bsky.social`)
3. Use your account username and password (or generate an app password in Settings → App Passwords)

### 2. Configure Milady

Set the credentials via environment variables in your config:

```json
{
  "env": {
    "BLUESKY_HANDLE": "yourname.bsky.social",
    "BLUESKY_PASSWORD": "YOUR_APP_PASSWORD"
  },
  "connectors": {
    "bluesky": {
      "enabled": true
    }
  }
}
```

Or via environment variables:

```bash
export BLUESKY_HANDLE=yourname.bsky.social
export BLUESKY_PASSWORD=YOUR_APP_PASSWORD
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `enabled` | No | Set `false` to disable (default: `true`) |
| `postEnable` | No | Enable automated posting |
| `postIntervalMin` | No | Minimum minutes between posts (default: `90`) |
| `postIntervalMax` | No | Maximum minutes between posts (default: `180`) |
| `dryRun` | No | Simulate operations without executing them |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BLUESKY_HANDLE` | Yes | Bluesky handle (e.g., `yourname.bsky.social`) |
| `BLUESKY_PASSWORD` | Yes | App password (generate at Settings > App Passwords) |
| `BLUESKY_ENABLED` | No | Set to `true` to enable |
| `BLUESKY_SERVICE` | No | Bluesky PDS instance URL |
| `BLUESKY_DRY_RUN` | No | Set to `true` for testing without posting |
| `BLUESKY_ENABLE_DMS` | No | Enable direct message processing |
| `BLUESKY_POLL_INTERVAL` | No | Polling interval in seconds |

## Related

- [Connectors Guide](/guides/connectors) — General connector documentation
