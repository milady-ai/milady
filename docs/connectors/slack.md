---
title: Slack Connector
sidebarTitle: Slack
description: Connect your agent to Slack workspaces using the @elizaos/plugin-slack package.
---

Connect your agent to Slack for workplace messaging and automation.

## Overview

The Slack connector is an external ElizaOS plugin that bridges your agent to Slack workspaces. It is auto-enabled by the runtime when a valid token is detected in your connector configuration.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-slack` |
| Config key | `connectors.slack` |
| Auto-enable trigger | `botToken`, `token`, or `apiKey` is truthy in connector config |

## Minimal Configuration

In your character file:

```json
{
  "connectors": {
    "slack": {
      "botToken": "xoxb-your-bot-token"
    }
  }
}
```

To explicitly disable the connector even when a token is present:

```json
{
  "connectors": {
    "slack": {
      "botToken": "xoxb-your-bot-token",
      "enabled": false
    }
  }
}
```

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.slack` in your character config. If any of the fields `botToken`, `token`, or `apiKey` is truthy (and `enabled` is not explicitly `false`), the runtime automatically loads `@elizaos/plugin-slack`.

No environment variable is required to trigger auto-enable -- it is driven entirely by the connector config object.

## Environment Variables

When the connector is loaded, the runtime pushes the following secrets from your config into `process.env` for the plugin to consume:

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Slack bot token (`xoxb-...`) |
| `SLACK_APP_TOKEN` | Slack app-level token (`xapp-...`) |
| `SLACK_USER_TOKEN` | Slack user token |

## Plugin Configuration

Detailed configuration options (channels, socket mode, slash commands, interactive components, event subscriptions, etc.) are defined by the `@elizaos/plugin-slack` package itself. See plugin documentation for [`@elizaos/plugin-slack`](https://www.npmjs.com/package/@elizaos/plugin-slack) for the full set of supported options.
