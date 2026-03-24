---
title: Twitch Connector
sidebarTitle: Twitch
description: Connect your agent to Twitch using the @elizaos/plugin-twitch package.
---

Connect your agent to Twitch for channel chat messaging and interaction.

## Overview

The Twitch connector is an external elizaOS plugin that bridges your agent to Twitch. It handles chat messaging, whispers, and channel event handling. It is auto-enabled when an access token, client ID, or `enabled: true` is configured.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-twitch` |
| Config key | `connectors.twitch` |
| Auto-enable trigger | `accessToken`, `clientId`, or `enabled: true` |

## Minimal Configuration

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

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TWITCH_ACCESS_TOKEN` | Twitch OAuth access token with chat scopes |
| `TWITCH_CLIENT_ID` | Twitch application Client ID |

## Setup Steps

1. Go to the [Twitch Developer Console](https://dev.twitch.tv/console/apps) and create a new application
2. Note the **Client ID** and generate an **Access Token** with the required chat scopes
3. Add the credentials to `connectors.twitch` in your config or set the environment variables
4. Start your agent — the Twitch connector will auto-enable

## Streaming

For live-streaming output to Twitch (separate from chat), use `@elizaos/plugin-twitch-streaming`. See [Streaming](/skills/streaming).
