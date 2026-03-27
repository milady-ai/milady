---
title: Instagram Connector
sidebarTitle: Instagram
description: Connect your agent to Instagram using the @elizaos/plugin-instagram package.
---

Connect your agent to Instagram for media posting, comment monitoring, and DM handling.

## Overview

The Instagram connector is an elizaOS plugin that bridges your agent to Instagram. It supports media posting with caption generation, comment response, and direct message handling. This connector is available from the plugin registry.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-instagram` |
| Config key | `connectors.instagram` |
| Install | `milady plugins install instagram` |

## Setup Requirements

- Instagram account credentials (username and password)

## Configuration

```json
{
  "connectors": {
    "instagram": {
      "enabled": true
    }
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `INSTAGRAM_USERNAME` | Instagram username for authentication |
| `INSTAGRAM_PASSWORD` | Instagram password for authentication |
| `INSTAGRAM_VERIFICATION_CODE` | Two-factor authentication verification code |
| `INSTAGRAM_PROXY` | Proxy URL for Instagram API requests |

## Features

- Media posting with caption generation
- Comment monitoring and response
- DM handling
- Two-factor authentication support
- Proxy support for API requests

## Related

- [Connectors overview](/guides/connectors#instagram)
