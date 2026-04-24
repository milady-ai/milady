---
title: BlueBubbles Connector
sidebarTitle: BlueBubbles
description: Connect your agent to iMessage via a local BlueBubbles server using the @elizaos/plugin-bluebubbles package.
---

Connect your agent to iMessage through a local [BlueBubbles](https://bluebubbles.app) server running on macOS.

## Overview

The BlueBubbles connector is an elizaOS plugin that bridges your agent to iMessage via a self-hosted BlueBubbles server. Unlike the native iMessage connector (which reads the local Messages database directly), BlueBubbles works over HTTP and can be accessed from any machine on the same network. It requires a BlueBubbles server running on a Mac with Messages signed in.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-bluebubbles` |
| Config key | `connectors.bluebubbles` |
| Install | `milady plugins install @elizaos/plugin-bluebubbles` |

## Minimal Configuration

In `~/.milady/milady.json`:

```json
{
  "connectors": {
    "bluebubbles": {
      "serverUrl": "http://192.168.1.10:1234",
      "password": "your-bluebubbles-password"
    }
  }
}
```

## Disabling

To explicitly disable the connector even when credentials are present:

```json
{
  "connectors": {
    "bluebubbles": {
      "serverUrl": "http://192.168.1.10:1234",
      "password": "your-bluebubbles-password",
      "enabled": false
    }
  }
}
```

## Environment Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `BLUEBUBBLES_SERVER_URL` | `serverUrl` | BlueBubbles server URL |
| `BLUEBUBBLES_PASSWORD` | `password` | Server password (required) |

## Full Configuration Reference

All fields are defined under `connectors.bluebubbles` in `milady.json`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `serverUrl` | string | — | BlueBubbles server URL (required) |
| `password` | string | — | Server password (required) |
| `enabled` | boolean | — | Explicitly enable/disable |
| `dmPolicy` | `"pairing"` \| `"allowlist"` \| `"open"` \| `"disabled"` | `"pairing"` | DM access policy |
| `allowFrom` | string[] | — | User IDs allowed to DM |
| `groupPolicy` | `"open"` \| `"disabled"` \| `"allowlist"` | `"allowlist"` | Group message policy |
| `groupAllowFrom` | string[] | — | Allowed group IDs |
| `webhookPath` | string | — | Webhook path for inbound messages |
| `sendReadReceipts` | boolean | — | Send read receipts for incoming messages |

## Setup Steps

1. Install [BlueBubbles](https://bluebubbles.app) on a Mac with Messages signed in.
2. Start the BlueBubbles server and note the server URL and password.
3. Add the server URL and password to `connectors.bluebubbles` in your config.
4. Install the plugin: `milady plugins install @elizaos/plugin-bluebubbles`
5. Start your agent.

## Features

- iMessage messaging via BlueBubbles HTTP API
- DM and group chat support
- Read receipts
- Webhook-based inbound message delivery
- Works from any machine on the network (not limited to the Mac running Messages)

## Related

- [iMessage Connector](/connectors/imessage) — Native iMessage connector (macOS only, reads Messages database directly)
- [Blooio Connector](/connectors/blooio) — iMessage/SMS via Blooio cloud service
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
