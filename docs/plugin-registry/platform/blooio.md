---
title: "Blooio Plugin"
sidebarTitle: "Blooio"
description: "Blooio connector for Milady — iMessage and SMS messaging via the Blooio bridge service with signed webhooks."
---

The Blooio plugin connects Milady agents to iMessage and SMS messaging via the Blooio service. Inbound messages are delivered through signed webhooks for security.

**Package:** `@elizaos/plugin-blooio`

## Installation

```bash
milady plugins install blooio
```

## Setup

### 1. Get Blooio Credentials

Obtain an API key from your Blooio account.

### 2. Configure Milady

```json
{
  "connectors": {
    "blooio": {
      "enabled": true,
      "apiKey": "YOUR_BLOOIO_API_KEY",
      "webhookUrl": "https://your-domain.com/blooio/webhook"
    }
  }
}
```

Or use environment variables:

```bash
export BLOOIO_API_KEY=your-blooio-api-key
export BLOOIO_WEBHOOK_URL=https://your-domain.com/blooio/webhook
```

## Auto-Enable

The plugin auto-enables when `apiKey`, `token`, or `botToken` is present in the connector config.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `apiKey` | Yes | Blooio platform API key |
| `webhookUrl` | No | Public URL for receiving inbound messages |

## Features

- iMessage and SMS messaging via Blooio bridge
- Signed webhook verification for inbound message security
- Outbound message sending
- Session management and message routing

## Related

- [iMessage Plugin](/plugin-registry/platform/imessage) — Native macOS iMessage (no bridge needed)
- [BlueBubbles Plugin](/plugin-registry/platform/bluebubbles) — Alternative iMessage bridge
- [Connectors Guide](/guides/connectors#blooio) — Full configuration reference
