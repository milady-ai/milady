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

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `username` | Yes | Bluesky account username |
| `password` | Yes | Bluesky account password or app password |
| `handle` | Yes | Bluesky handle (e.g., `yourname.bsky.social`) |
| `enabled` | No | Set `false` to disable (default: `true`) |

## Environment Variables

```bash
export BLUESKY_USERNAME=YOUR_USERNAME
export BLUESKY_PASSWORD=YOUR_PASSWORD
export BLUESKY_HANDLE=YOUR_HANDLE
```

## Related

- [Connectors Guide](/guides/connectors) — General connector documentation
