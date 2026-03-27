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

```json
{
  "connectors": {
    "bluesky": {
      "username": "YOUR_USERNAME",
      "password": "YOUR_PASSWORD",
      "handle": "YOUR_HANDLE"
    }
  }
}
```

Or via environment variables:

```bash
export BLUESKY_USERNAME=YOUR_USERNAME
export BLUESKY_PASSWORD=YOUR_PASSWORD
export BLUESKY_HANDLE=YOUR_HANDLE
```

## Auto-Enable

Bluesky does **not** auto-enable based on configuration. You must explicitly install and allow the plugin:

```bash
milady plugins install bluesky
```

Then add `"bluesky"` to your `plugins.allow` list in `milady.json`.

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `username` | Yes | Bluesky account username |
| `password` | Yes | Bluesky account password or app password |
| `handle` | Yes | Bluesky handle (e.g., `yourname.bsky.social`) |
| `enabled` | No | Set `false` to disable (default: `true`) |

## Environment Variables

```bash
export BLUESKY_HANDLE=YOUR_HANDLE
export BLUESKY_PASSWORD=YOUR_APP_PASSWORD
```

### All Variables

| Variable | Description |
|----------|-------------|
| `BLUESKY_HANDLE` | Bluesky handle (e.g., `yourname.bsky.social`) |
| `BLUESKY_PASSWORD` | App password (not your main password) |
| `BLUESKY_ENABLED` | Enables or disables the plugin |
| `BLUESKY_DRY_RUN` | Set to `true` for testing without posting |
| `BLUESKY_SERVICE` | Bluesky service URL (PDS instance) |
| `BLUESKY_ENABLE_POSTING` | Enables or disables posting |
| `BLUESKY_POST_INTERVAL_MIN` | Minimum seconds between automated posts |
| `BLUESKY_POST_INTERVAL_MAX` | Maximum seconds between automated posts |
| `BLUESKY_POLL_INTERVAL` | Polling interval in seconds for notifications |
| `BLUESKY_ENABLE_ACTION_PROCESSING` | Enables automated action processing |
| `BLUESKY_ACTION_INTERVAL` | Seconds between action-processing cycles |
| `BLUESKY_POST_IMMEDIATELY` | If `true`, posts publish immediately |
| `BLUESKY_MAX_ACTIONS_PROCESSING` | Max actions to process in a single batch |
| `BLUESKY_MAX_POST_LENGTH` | Maximum characters per post |
| `BLUESKY_ENABLE_DMS` | Enable direct message processing |

## Related

- [Connectors Guide](/guides/connectors) — General connector documentation
