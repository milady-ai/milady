---
title: "Blooio Plugin"
sidebarTitle: "Blooio"
description: "Blooio connector for Milady — platform messaging integration."
---

The Blooio plugin connects Milady agents to the Blooio platform for messaging and interaction.

**Package:** `@elizaos/plugin-blooio`

## Installation

```bash
milady plugins install blooio
```

## Setup

### Configure Milady

```json
{
  "connectors": {
    "blooio": {
      "apiKey": "your-blooio-api-key"
    }
  }
}
```

Or use environment variables:

```bash
export BLOOIO_API_KEY=your-blooio-api-key
```

## Auto-Enable

The plugin auto-enables when `apiKey`, `token`, or `botToken` is present in the connector config.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `apiKey` | Yes | Blooio platform API key |

## Features

- Blooio platform messaging
- Message routing and session management
