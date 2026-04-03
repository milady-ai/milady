---
title: "Zalo Plugin"
sidebarTitle: "Zalo"
description: "Zalo connector for Milady — bot integration with the Zalo messaging platform."
---

The Zalo plugin connects Milady agents to Zalo, enabling message handling through the Zalo Official Account API.

**Package:** `@elizaos/plugin-zalo`

## Installation

```bash
milady plugins install zalo
```

## Setup

### 1. Create a Zalo Official Account

1. Go to the [Zalo Developers portal](https://developers.zalo.me/)
2. Create an application and obtain your App ID and App Secret
3. Generate an access token and refresh token for API access

### 2. Configure Milady

```json
{
  "connectors": {
    "zalo": {
      "accessToken": "YOUR_ACCESS_TOKEN",
      "refreshToken": "YOUR_REFRESH_TOKEN",
      "appId": "YOUR_APP_ID",
      "appSecret": "YOUR_APP_SECRET"
    }
  }
}
```

Or via environment variables:

```bash
export ZALO_ACCESS_TOKEN=YOUR_ACCESS_TOKEN
export ZALO_REFRESH_TOKEN=YOUR_REFRESH_TOKEN
export ZALO_APP_ID=YOUR_APP_ID
export ZALO_APP_SECRET=YOUR_APP_SECRET
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `accessToken` | Yes | Zalo API access token |
| `refreshToken` | Yes | Zalo API refresh token |
| `appId` | Yes | Zalo application ID |
| `appSecret` | Yes | Zalo application secret |
| `enabled` | No | Set `false` to disable (default: `true`) |

## Environment Variables

```bash
export ZALO_ACCESS_TOKEN=YOUR_ACCESS_TOKEN
export ZALO_REFRESH_TOKEN=YOUR_REFRESH_TOKEN
export ZALO_APP_ID=YOUR_APP_ID
export ZALO_APP_SECRET=YOUR_APP_SECRET
```

## Related

- [Connectors Guide](/guides/connectors) — General connector documentation
