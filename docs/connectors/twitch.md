---
title: Twitch Connector
sidebarTitle: Twitch
description: Connect your agent to Twitch for live chat and channel interactions using the @elizaos/plugin-twitch package.
---

Connect your agent to Twitch for live chat monitoring, channel events, and audience interactions.

## Overview

The Twitch connector is an external elizaOS plugin that bridges your agent to Twitch. It handles chat messaging, whispers, and channel event handling. It is auto-enabled when an access token, client ID, or `enabled: true` is configured.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-twitch` |
| Config key | `connectors.twitch` |
| Auto-enable trigger | `accessToken`, `clientId`, or `enabled: true` in connector config |

## Minimal Configuration

In `~/.milady/milady.json`:

```json
{
  "connectors": {
    "twitch": {
      "clientId": "YOUR_CLIENT_ID",
      "accessToken": "YOUR_ACCESS_TOKEN"
    }
  }
}
```

## Disabling

To explicitly disable the connector even when credentials are present:

```json
{
  "connectors": {
    "twitch": {
      "clientId": "YOUR_CLIENT_ID",
      "accessToken": "YOUR_ACCESS_TOKEN",
      "enabled": false
    }
  }
}
```

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.twitch` in your config. If any of the fields `accessToken` or `clientId` is truthy, or `enabled` is explicitly `true` (and `enabled` is not explicitly `false`), the runtime automatically loads `@elizaos/plugin-twitch`.

No environment variable is required to trigger auto-enable — it is driven entirely by the connector config object.

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

## Full Configuration Reference

All fields are defined under `connectors.twitch` in `milady.json`.

### Core Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `clientId` | string | — | Twitch application Client ID |
| `accessToken` | string | — | OAuth access token with chat scopes |
| `enabled` | boolean | — | Explicitly enable/disable |

### Features

- Live chat monitoring and response
- Channel event handling
- Audience interaction management

### Streaming

A separate streaming plugin (`@elizaos/plugin-twitch-streaming`) is available for live stream management. It is configured under the `streaming.twitch` config key rather than `connectors.twitch`. See the streaming documentation for details.

## Related

- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
