---
title: "Twitch Plugin"
sidebarTitle: "Twitch"
description: "Twitch connector for Milady — channel chat messaging and interaction."
---

The Twitch plugin connects Milady agents to Twitch, enabling chat messaging and channel interaction.

**Package:** `@elizaos/plugin-twitch`

## Installation

```bash
milady plugins install twitch
```

## Setup

### 1. Create a Twitch Application

1. Go to the [Twitch Developer Console](https://dev.twitch.tv/console/apps)
2. Create a new application
3. Note the **Client ID**
4. Generate an **Access Token** with the required chat scopes

### 2. Configure Milady

```json
{
  "connectors": {
    "twitch": {
      "accessToken": "your-twitch-access-token",
      "clientId": "your-twitch-client-id"
    }
  }
}
```

Or use environment variables:

```bash
export TWITCH_ACCESS_TOKEN=your-twitch-access-token
export TWITCH_CLIENT_ID=your-twitch-client-id
```

## Auto-Enable

The plugin auto-enables when any of these are present:

- `accessToken` in connector config
- `clientId` in connector config
- `enabled: true` in connector config

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `accessToken` | Yes* | Twitch OAuth access token |
| `clientId` | Yes* | Twitch application Client ID |
| `enabled` | No | Force-enable without credentials |

\* At least one of `accessToken`, `clientId`, or `enabled: true` is required.

## Features

- Channel chat messaging
- Whisper / DM support
- Chat event handling

## Streaming

For live-streaming output to Twitch, use the separate **Twitch Streaming** plugin (`@elizaos/plugin-twitch-streaming`). See [Streaming](/skills/streaming) for setup details.
