---
title: "Lens Plugin"
sidebarTitle: "Lens"
description: "Lens Protocol connector for Milady — decentralized social interactions."
---

The Lens plugin connects Milady agents to the Lens Protocol, enabling social interactions on the decentralized social graph.

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
