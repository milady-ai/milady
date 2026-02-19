---
title: Twitter/X Connector
sidebarTitle: Twitter/X
description: Connect your agent to Twitter/X using the @elizaos/plugin-twitter package.
---

Connect your agent to Twitter/X for social media engagement.

## Overview

The Twitter connector is an external ElizaOS plugin that bridges your agent to Twitter/X. It is auto-enabled by the runtime when a valid token is detected in your connector configuration.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-twitter` |
| Config key | `connectors.twitter` |
| Auto-enable trigger | `botToken`, `token`, or `apiKey` is truthy in connector config |

## Minimal Configuration

In your character file:

```json
{
  "connectors": {
    "twitter": {
      "apiKey": "your-twitter-api-key"
    }
  }
}
```

To explicitly disable the connector even when a token is present:

```json
{
  "connectors": {
    "twitter": {
      "apiKey": "your-twitter-api-key",
      "enabled": false
    }
  }
}
```

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.twitter` in your character config. If any of the fields `botToken`, `token`, or `apiKey` is truthy (and `enabled` is not explicitly `false`), the runtime automatically loads `@elizaos/plugin-twitter`.

No environment variable is required to trigger auto-enable -- it is driven entirely by the connector config object.

## Environment Variables

Unlike Discord, Telegram, and Slack, the Twitter connector does not have individual secret keys pushed into `process.env` by the runtime's `secretKeys` configuration. Twitter credentials are read directly from the `connectors.twitter` config path by the plugin.

## Plugin Configuration

Detailed configuration options (posting modes, mention handling, keyword monitoring, rate limits, content safety, etc.) are defined by the `@elizaos/plugin-twitter` package itself. See plugin documentation for [`@elizaos/plugin-twitter`](https://www.npmjs.com/package/@elizaos/plugin-twitter) for the full set of supported options.
