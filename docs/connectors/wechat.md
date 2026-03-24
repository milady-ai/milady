---
title: WeChat Connector
sidebarTitle: WeChat
description: Connect your agent to WeChat using the @miladyai/plugin-wechat package.
---

Connect your agent to WeChat for personal and group messaging via a third-party proxy service.

## Overview

The WeChat connector is a Milady-local plugin that bridges your agent to WeChat via a user-supplied proxy service. Unlike most connectors which use official platform APIs, the WeChat connector relies on a third-party proxy that bridges WeChat's protocol. Your agent authenticates by scanning a QR code displayed in the terminal on first startup.

## Privacy Notice

The WeChat connector sends your API key and message payloads through the configured proxy service. Only point `proxyUrl` at infrastructure you operate yourself or explicitly trust for that message flow.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@miladyai/plugin-wechat` |
| Config key | `connectors.wechat` |
| Auto-enable trigger | `apiKey` is truthy at top level, or an `accounts` entry has a truthy `apiKey` |

## Minimal Configuration

In your character file:

```json
{
  "connectors": {
    "wechat": {
      "apiKey": "YOUR_API_KEY",
      "proxyUrl": "https://your-proxy-service.example.com"
    }
  }
}
```

## Disabling

To explicitly disable the connector even when an API key is present:

```json
{
  "connectors": {
    "wechat": {
      "apiKey": "YOUR_API_KEY",
      "proxyUrl": "https://your-proxy-service.example.com",
      "enabled": false
    }
  }
}
```

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.wechat` in your character config. The plugin auto-enables when:

- A top-level `apiKey` is truthy, OR
- An `accounts` map contains at least one enabled account with a truthy `apiKey`

Setting `enabled: false` at the connector or account level disables auto-enable. No environment variable is required to trigger auto-enable — it is driven entirely by the connector config object.

## Environment Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `WECHAT_API_KEY` | `apiKey` | Proxy service API key |

## Full Configuration Reference

All fields are defined under `connectors.wechat` in your character file.

### Core Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `apiKey` | string | — | Proxy service API key (required) |
| `proxyUrl` | string | — | Proxy service URL (required) |
| `webhookPort` | number | `18790` | Webhook listener port for incoming messages |
| `deviceType` | `"ipad"` \| `"mac"` | `"ipad"` | Device emulation type |
| `enabled` | boolean | — | Explicitly enable/disable |

### Feature Toggles

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `features.images` | boolean | `false` | Enable image send/receive |
| `features.groups` | boolean | `false` | Enable group chat support |

```json
{
  "connectors": {
    "wechat": {
      "apiKey": "YOUR_API_KEY",
      "proxyUrl": "https://your-proxy.example.com",
      "webhookPort": 18790,
      "deviceType": "ipad",
      "features": {
        "images": true,
        "groups": true
      }
    }
  }
}
```

### QR Code Login

On first start, the plugin displays a QR code in the terminal. Scan it with WeChat on your phone to link the session. Sessions persist automatically — subsequent starts reuse the existing session unless it has expired.

If a session expires after extended inactivity, the plugin attempts to re-login automatically. If re-login fails, a new QR code is displayed for scanning.

### Multi-Account Support

Run multiple WeChat accounts using the `accounts` map:

```json
{
  "connectors": {
    "wechat": {
      "accounts": {
        "personal": {
          "apiKey": "KEY_1",
          "proxyUrl": "https://proxy.example.com",
          "deviceType": "ipad"
        },
        "work": {
          "apiKey": "KEY_2",
          "proxyUrl": "https://proxy.example.com",
          "deviceType": "mac",
          "enabled": false
        }
      },
      "features": {
        "groups": true
      }
    }
  }
}
```

Each account has its own API key, proxy URL, and session. Per-account fields override top-level settings.

## Features

- **Text messaging** — DM conversations enabled by default
- **Group chats** — Participate in group conversations (enable with `features.groups: true`)
- **Image support** — Send and receive images (enable with `features.images: true`)
- **QR code login** — Authenticate by scanning a QR code, with automatic session persistence
- **Multi-account** — Run multiple WeChat accounts from a single agent via the `accounts` map
- **Device emulation** — Choose between iPad or Mac client emulation

## Related

- [WeChat plugin reference](/plugin-registry/platform/wechat)
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
