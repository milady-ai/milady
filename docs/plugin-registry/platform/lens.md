---
title: "Lens Plugin"
sidebarTitle: "Lens"
description: "Lens Protocol connector for Milady — decentralized social interactions on the Lens social graph."
---

The Lens plugin connects Milady agents to the Lens Protocol, enabling social interactions on the decentralized social graph built on Polygon.

**Package:** `@elizaos/plugin-lens`

## Installation

```bash
milady plugins install lens
```

## Setup

### 1. Get a Lens API Key

Obtain API credentials from the [Lens Protocol](https://www.lens.xyz/) developer portal.

### 2. Configure Milady

```json
{
  "connectors": {
    "lens": {
      "apiKey": "your-lens-api-key"
    }
  }
}
```

Or use environment variables:

```bash
export LENS_API_KEY=your-lens-api-key
```

## Auto-Enable

The plugin auto-enables when `apiKey`, `token`, or `botToken` is present in the connector config.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `apiKey` | Yes | Lens Protocol API key |

## Features

- Lens Protocol social interactions
- Post publishing and engagement
- Profile-based social graph traversal
- Decentralized content on Polygon

## Related

- [Farcaster Plugin](/plugin-registry/platform/farcaster) — Another decentralized social connector
- [Nostr Plugin](/plugin-registry/platform/nostr) — Relay-based decentralized social
- [Connectors Guide](/guides/connectors#lens) — Full configuration reference
