---
title: Microsoft Teams Connector
sidebarTitle: MS Teams
description: Connect your agent to Microsoft Teams using the @elizaos/plugin-msteams package.
---

Connect your agent to Microsoft Teams for DMs, team channels, and threaded conversations.

## Overview

The Microsoft Teams connector is an external elizaOS plugin that bridges your agent to Teams as an Azure Bot. It is auto-enabled by the runtime when a valid token is detected in your connector configuration.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-msteams` |
| Config key | `connectors.msteams` |
| Auto-enable trigger | `botToken`, `token`, or `apiKey` is truthy in connector config |

## Minimal Configuration

In your character file:

```json
{
  "connectors": {
    "msteams": {
      "appId": "YOUR_APP_ID",
      "appPassword": "YOUR_APP_PASSWORD",
      "tenantId": "YOUR_TENANT_ID"
    }
  }
}
```

## Disabling

To explicitly disable the connector even when credentials are present:

```json
{
  "connectors": {
    "msteams": {
      "appId": "YOUR_APP_ID",
      "appPassword": "YOUR_APP_PASSWORD",
      "tenantId": "YOUR_TENANT_ID",
      "enabled": false
    }
  }
}
```

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.msteams` in your character config. If any of the fields `botToken`, `token`, or `apiKey` is truthy (and `enabled` is not explicitly `false`), the runtime automatically loads `@elizaos/plugin-msteams`.

No environment variable is required to trigger auto-enable — it is driven entirely by the connector config object.

## Environment Variables

When the connector is loaded, the runtime can consume the following secrets from environment variables as an alternative to inline config:

| Variable | Source | Description |
|----------|--------|-------------|
| `MSTEAMS_APP_ID` | `appId` | Azure Bot App ID |
| `MSTEAMS_APP_PASSWORD` | `appPassword` | Azure Bot App Password (client secret) |
| `MSTEAMS_TENANT_ID` | `tenantId` | Azure AD Tenant ID |

## Full Configuration Reference

All fields are defined under `connectors.msteams` in your character file.

### Core Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `appId` | string | — | Azure Bot App ID (Microsoft App ID) |
| `appPassword` | string | — | Azure Bot App Password (client secret) |
| `tenantId` | string | — | Azure AD Tenant ID |
| `enabled` | boolean | — | Explicitly enable/disable |
| `capabilities` | string[] | — | Capability flags |
| `configWrites` | boolean | — | Allow config writes from Teams events |
| `requireMention` | boolean | — | Only respond when @mentioned |
| `dmPolicy` | `"pairing"` \| `"allowlist"` \| `"open"` \| `"disabled"` | `"pairing"` | DM access policy. `"open"` requires `allowFrom` to include `"*"` |
| `allowFrom` | string[] | — | User IDs allowed to DM |
| `groupPolicy` | `"open"` \| `"disabled"` \| `"allowlist"` | `"allowlist"` | Group join policy |
| `groupAllowFrom` | string[] | — | Allowed group/team IDs |
| `historyLimit` | integer >= 0 | — | Max messages in context |
| `dmHistoryLimit` | integer >= 0 | — | History limit for DMs |
| `dms` | object | — | Per-DM history overrides keyed by DM ID. Each value: `{historyLimit?: int}` |
| `textChunkLimit` | integer > 0 | — | Max characters per message chunk |
| `chunkMode` | `"length"` \| `"newline"` | — | Long message splitting strategy |
| `mediaMaxMb` | number > 0 | — | Max media file size in MB (up to 100MB via OneDrive upload) |
| `blockStreamingCoalesce` | object | — | Coalescing settings: `minChars`, `maxChars`, `idleMs` |
| `replyStyle` | `"thread"` \| `"top-level"` | `"thread"` | Reply threading mode |
| `markdown` | object | — | Table rendering: `tables` can be `"off"`, `"bullets"`, or `"code"` |

### Webhook Configuration

| Field | Type | Description |
|-------|------|-------------|
| `webhook.port` | integer > 0 | Port for incoming webhook events |
| `webhook.path` | string | Path for webhook endpoint (e.g., `/api/msteams/webhook`) |

### Media Configuration

| Field | Type | Description |
|-------|------|-------------|
| `mediaAllowHosts` | string[] | Allowlist of hosts from which media can be downloaded |
| `mediaAuthAllowHosts` | string[] | Hosts that require authentication headers for media downloads |
| `sharePointSiteId` | string | SharePoint site ID for file uploads in group chats (e.g., `"contoso.sharepoint.com,guid1,guid2"`) |

### Team Configuration

Per-team settings are defined under `teams.<team-id>`:

| Field | Type | Description |
|-------|------|-------------|
| `requireMention` | boolean | Only respond when @mentioned |
| `tools` | ToolPolicySchema | Tool access policy |
| `toolsBySender` | object | Per-sender tool policies (keyed by sender ID) |
| `replyStyle` | `"thread"` \| `"top-level"` | Override reply style for this team |
| `channels` | object | Per-channel configuration (see below) |

### Channel Configuration

Per-channel settings are defined within a team under `teams.<team-id>.channels.<channel-id>`:

| Field | Type | Description |
|-------|------|-------------|
| `requireMention` | boolean | Only respond when @mentioned |
| `tools` | ToolPolicySchema | Tool access policy |
| `toolsBySender` | object | Per-sender tool policies (keyed by sender ID) |
| `replyStyle` | `"thread"` \| `"top-level"` | Override reply style for this channel |

### Heartbeat

```json
{
  "connectors": {
    "msteams": {
      "heartbeat": {
        "showOk": true,
        "showAlerts": true,
        "useIndicator": true
      }
    }
  }
}
```

## Related

- [MS Teams plugin reference](/plugin-registry/platform/msteams)
- [Google Chat connector reference](/connectors/googlechat)
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
