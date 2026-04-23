---
title: Blooio Connector
sidebarTitle: Blooio
description: Connect your agent to iMessage and SMS via the Blooio service using the @elizaos/plugin-blooio package.
---

Connect your agent to iMessage and SMS messaging via the Blooio bridge service.

## Overview

The Blooio connector is an external elizaOS plugin that bridges your agent to iMessage and SMS through the Blooio service. It uses signed webhooks for inbound messages and an API for outbound messaging. It is auto-enabled by the runtime when a valid API key is detected in your connector configuration.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-blooio` |
| Config key | `connectors.blooio` |
| Auto-enable trigger | `apiKey` is truthy in connector config |

## Minimal Configuration

In `~/.milady/milady.json`:

```json
{
  "connectors": {
    "blooio": {
      "apiKey": "YOUR_BLOOIO_API_KEY"
    }
  }
}
```

## Disabling

To explicitly disable the connector even when an API key is present:

```json
{
  "connectors": {
    "blooio": {
      "apiKey": "YOUR_BLOOIO_API_KEY",
      "enabled": false
    }
  }
}
```

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.blooio` in your config. If the `apiKey` field is truthy (and `enabled` is not explicitly `false`), the runtime automatically loads `@elizaos/plugin-blooio`.

No environment variable is required to trigger auto-enable — it is driven entirely by the connector config object.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BLOOIO_API_KEY` | Yes | Blooio service API key |
| `BLOOIO_WEBHOOK_URL` | No | URL for receiving inbound messages |
| `BLOOIO_BASE_URL` | No | Base URL for API requests |
| `BLOOIO_FROM_NUMBER` | No | Sender phone number |
| `BLOOIO_WEBHOOK_PATH` | No | Webhook endpoint path |
| `BLOOIO_WEBHOOK_PORT` | No | Webhook listener port |
| `BLOOIO_WEBHOOK_SECRET` | No | Secret key for webhook/client verification |

## Setup Steps

1. Obtain an API key from the Blooio platform
2. Add it to `connectors.blooio` in your config or set the `BLOOIO_API_KEY` environment variable
3. Start your agent — the Blooio connector will auto-enable

## Full Configuration Reference

All fields are defined under `connectors.blooio` in `milady.json`.

### Core Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `apiKey` | string | — | Blooio API key (required) |
| `webhookUrl` | string | — | Webhook URL for receiving inbound messages |
| `baseUrl` | string | — | Base URL for API requests |
| `fromNumber` | string | — | Sender phone number |
| `webhookPath` | string | — | Webhook endpoint path |
| `webhookPort` | number | — | Webhook listener port |
| `webhookSecret` | string | — | Secret key for webhook/client verification |
| `enabled` | boolean | — | Explicitly enable/disable |

### Features

- iMessage and SMS messaging via the Blooio bridge
- Signed webhook verification for inbound messages
- Outbound message sending via API

## Related

- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
