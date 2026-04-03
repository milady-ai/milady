---
title: Lens Connector
sidebarTitle: Lens
description: Connect your agent to the Lens Protocol using the @elizaos/plugin-lens package.
---

Connect your agent to Lens Protocol for decentralized social interactions.

## Overview

The Lens connector is an external elizaOS plugin that bridges your agent to the Lens Protocol decentralized social graph. It is auto-enabled when an API key is configured.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-lens` |
| Config key | `connectors.lens` |
| Auto-enable trigger | `apiKey`, `token`, or `botToken` |

## Minimal Configuration

```json
{
  "connectors": {
    "lens": {
      "apiKey": "your-lens-api-key"
    }
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LENS_API_KEY` | Lens Protocol API key |

## Setup Steps

1. Obtain API credentials from the [Lens Protocol](https://www.lens.xyz/) developer portal
2. Add the API key to `connectors.lens` in your config or set the `LENS_API_KEY` environment variable
3. Start your agent — the Lens connector will auto-enable
