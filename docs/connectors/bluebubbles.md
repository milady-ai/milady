---
title: BlueBubbles Connector
sidebarTitle: BlueBubbles
description: Connect your agent to iMessage via BlueBubbles using the @elizaos/plugin-bluebubbles package.
---

Connect your agent to iMessage for private chats and group conversations via a BlueBubbles server (macOS only).

## Overview

The BlueBubbles connector is an external elizaOS plugin that bridges your agent to iMessage through a BlueBubbles server running on macOS. It is auto-enabled by the runtime when both a server URL and password are detected in your connector configuration.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-bluebubbles` |
| Config key | `connectors.bluebubbles` |
| Auto-enable trigger | `serverUrl` and `password` are both truthy in connector config |

## Minimal Configuration

In your character file:

```json
{
  "connectors": {
    "bluebubbles": {
      "serverUrl": "http://localhost:1234",
      "password": "your-password"
    }
  }
}
```

## Disabling

To explicitly disable the connector even when credentials are present:

```json
{
  "connectors": {
    "bluebubbles": {
      "serverUrl": "http://localhost:1234",
      "password": "your-password",
      "enabled": false
    }
  }
}
```

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.bluebubbles` in your character config. If both `serverUrl` and `password` are truthy (and `enabled` is not explicitly `false`), the runtime automatically loads `@elizaos/plugin-bluebubbles`.

No environment variable is required to trigger auto-enable — it is driven entirely by the connector config object.

## Full Configuration Reference

All fields are defined under `connectors.bluebubbles` in your character file.

### Core Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `serverUrl` | string | — | BlueBubbles server URL (e.g., `http://192.168.1.100:1234`) |
| `password` | string | — | BlueBubbles server password |
| `name` | string | — | Account display name |
| `enabled` | boolean | — | Explicitly enable/disable |
| `capabilities` | string[] | — | Capability flags |
| `webhookPath` | string | — | Webhook endpoint path for incoming events |
| `sendReadReceipts` | boolean | — | Send read receipts to senders |
| `dmPolicy` | `"pairing"` \| `"allowlist"` \| `"open"` \| `"disabled"` | `"pairing"` | DM access policy. `"open"` requires `allowFrom` to include `"*"` |
| `allowFrom` | (string\|number)[] | — | User IDs allowed to DM |
| `groupPolicy` | `"open"` \| `"disabled"` \| `"allowlist"` | `"allowlist"` | Group join policy |
| `groupAllowFrom` | (string\|number)[] | — | Allowed group IDs |
| `historyLimit` | integer >= 0 | — | Max messages in context |
| `dmHistoryLimit` | integer >= 0 | — | History limit for DMs |
| `dms` | object | — | Per-DM history overrides keyed by DM ID. Each value: `{historyLimit?: int}` |
| `textChunkLimit` | integer > 0 | — | Max characters per message chunk |
| `chunkMode` | `"length"` \| `"newline"` | — | Long message splitting strategy |
| `mediaMaxMb` | integer > 0 | — | Max media file size in MB |
| `configWrites` | boolean | — | Allow config writes from BlueBubbles events |
| `blockStreaming` | boolean | — | Disable streaming responses |
| `blockStreamingCoalesce` | object | — | Coalescing settings: `minChars`, `maxChars`, `idleMs` |
| `markdown` | object | — | Table rendering: `tables` can be `"off"`, `"bullets"`, or `"code"` |

### Actions

| Field | Type | Description |
|-------|------|-------------|
| `actions.reactions` | boolean | React to messages with tapback emojis |
| `actions.edit` | boolean | Edit previously sent messages |
| `actions.unsend` | boolean | Unsend previously sent messages |
| `actions.reply` | boolean | Reply to specific messages in threads |
| `actions.sendWithEffect` | boolean | Send messages with iMessage effects (slam, loud, gentle, invisible ink, etc.) |
| `actions.renameGroup` | boolean | Rename group conversations |
| `actions.setGroupIcon` | boolean | Set group conversation icons |
| `actions.addParticipant` | boolean | Add participants to group conversations |
| `actions.removeParticipant` | boolean | Remove participants from group conversations |
| `actions.leaveGroup` | boolean | Leave group conversations |
| `actions.sendAttachment` | boolean | Send media attachments |

### Group Configuration

Per-group settings are defined under `groups.<group-id>`:

| Field | Type | Description |
|-------|------|-------------|
| `requireMention` | boolean | Only respond when @mentioned |
| `tools` | ToolPolicySchema | Tool access policy |
| `toolsBySender` | object | Per-sender tool policies (keyed by sender ID) |

### Heartbeat

```json
{
  "connectors": {
    "bluebubbles": {
      "heartbeat": {
        "showOk": true,
        "showAlerts": true,
        "useIndicator": true
      }
    }
  }
}
```

### Multi-Account Support

The `accounts` field allows running multiple BlueBubbles connections from a single agent:

```json
{
  "connectors": {
    "bluebubbles": {
      "accounts": {
        "home-mac": { "serverUrl": "http://192.168.1.100:1234", "password": "..." },
        "office-mac": { "serverUrl": "http://192.168.1.200:1234", "password": "..." }
      }
    }
  }
}
```

## Related

- [BlueBubbles plugin reference](/plugin-registry/platform/bluebubbles)
- [iMessage connector reference](/connectors/imessage)
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
