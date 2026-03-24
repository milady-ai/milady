---
title: Matrix Connector
sidebarTitle: Matrix
description: Connect your agent to Matrix rooms and spaces using the @elizaos/plugin-matrix package.
---

Connect your agent to Matrix for federated chat across rooms and spaces.

## Overview

The Matrix connector is an external elizaOS plugin that bridges your agent to any Matrix homeserver. It supports rooms, direct messages, end-to-end encryption, and auto-join. It is auto-enabled by the runtime when a valid access token is detected.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-matrix` |
| Config key | `connectors.matrix` |
| Auto-enable trigger | `MATRIX_ACCESS_TOKEN` environment variable is set |

## Minimal Configuration

Set the required environment variable and add a connector entry:

```json
{
  "env": {
    "MATRIX_ACCESS_TOKEN": "syt_your_access_token"
  },
  "connectors": {
    "matrix": {
      "enabled": true
    }
  }
}
```

## Disabling

To explicitly disable the connector even when a token is present:

```json
{
  "connectors": {
    "matrix": {
      "enabled": false
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MATRIX_ACCESS_TOKEN` | Yes | Access token for authenticating with the homeserver |
| `MATRIX_HOMESERVER` | No | Homeserver URL (e.g., `https://matrix.org`) |
| `MATRIX_USER_ID` | No | Bot user identifier (e.g., `@bot:matrix.org`) |
| `MATRIX_DEVICE_ID` | No | Device identifier for encryption sessions |
| `MATRIX_ROOMS` | No | Comma-separated list of room IDs to join |
| `MATRIX_AUTO_JOIN` | No | Automatically join rooms when invited (`true`/`false`) |
| `MATRIX_ENCRYPTION` | No | Enable end-to-end encryption (`true`/`false`) |
| `MATRIX_REQUIRE_MENTION` | No | Only respond when the bot is @mentioned (`true`/`false`) |

## Setup

1. Create a Matrix account for your bot on your preferred homeserver.
2. Obtain an access token. You can generate one via the Matrix client or the [admin API](https://spec.matrix.org/latest/client-server-api/#login).
3. Add the access token to your Milady config under `env.MATRIX_ACCESS_TOKEN`.
4. Optionally configure the homeserver URL, user ID, and rooms.
5. Start Milady — the plugin auto-enables when the access token is present.

## Features

- **Room support** — Join and respond in Matrix rooms
- **Direct messages** — Handle DMs with users
- **Auto-join** — Automatically accept room invitations
- **End-to-end encryption** — Optional Olm-based encryption for secure messaging
- **Mention filtering** — Optionally only respond when @mentioned in rooms
- **Federation** — Works with any Matrix homeserver that supports the client-server API

## Related

- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
