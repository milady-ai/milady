---
title: Google Chat Connector
sidebarTitle: Google Chat
description: Connect your agent to Google Chat using the @elizaos/plugin-google-chat package.
---

Connect your agent to Google Chat for DMs and space conversations.

## Overview

The Google Chat connector is an external elizaOS plugin that bridges your agent to Google Chat via a Google Cloud service account. It is auto-enabled by the runtime when a valid token or service account configuration is detected in your connector configuration.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-google-chat` |
| Config key | `connectors.googlechat` |
| Auto-enable trigger | `botToken`, `token`, or `apiKey` is truthy in connector config |

## Minimal Configuration

In your character file:

```json
{
  "connectors": {
    "googlechat": {
      "serviceAccountFile": "./service-account.json",
      "audienceType": "project-number",
      "audience": "123456789",
      "webhookPath": "/google-chat"
    }
  }
}
```

## Disabling

To explicitly disable the connector even when credentials are present:

```json
{
  "connectors": {
    "googlechat": {
      "serviceAccountFile": "./service-account.json",
      "audienceType": "project-number",
      "audience": "123456789",
      "enabled": false
    }
  }
}
```

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.googlechat` in your character config. If any of the fields `botToken`, `token`, or `apiKey` is truthy (and `enabled` is not explicitly `false`), the runtime automatically loads `@elizaos/plugin-google-chat`.

No environment variable is required to trigger auto-enable — it is driven entirely by the connector config object.

## Full Configuration Reference

All fields are defined under `connectors.googlechat` in your character file.

### Core Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `serviceAccountFile` | string | — | Path to service account JSON key file |
| `serviceAccount` | string \| object | — | Inline service account JSON (alternative to file) |
| `audienceType` | `"app-url"` \| `"project-number"` | — | Authentication audience type |
| `audience` | string | — | App URL or project number (matches `audienceType`) |
| `name` | string | — | Account display name |
| `enabled` | boolean | — | Explicitly enable/disable |
| `capabilities` | string[] | — | Capability flags |
| `webhookPath` | string | — | Webhook endpoint path (e.g., `/google-chat`) |
| `webhookUrl` | string | — | Full webhook URL override |
| `botUser` | string | — | Bot user identifier |
| `configWrites` | boolean | — | Allow config writes from Google Chat events |
| `allowBots` | boolean | — | Allow interactions from other bots |
| `requireMention` | boolean | — | Only respond when @mentioned |
| `dmPolicy` | `"pairing"` \| `"allowlist"` \| `"open"` \| `"disabled"` | `"pairing"` | DM access policy |
| `groupPolicy` | `"open"` \| `"disabled"` \| `"allowlist"` | `"allowlist"` | Group join policy |
| `groupAllowFrom` | (string\|number)[] | — | Allowed group/space IDs |
| `historyLimit` | integer >= 0 | — | Max messages in context |
| `dmHistoryLimit` | integer >= 0 | — | History limit for DMs |
| `dms` | object | — | Per-DM history overrides keyed by DM ID. Each value: `{historyLimit?: int}` |
| `textChunkLimit` | integer > 0 | — | Max characters per message chunk |
| `chunkMode` | `"length"` \| `"newline"` | — | Long message splitting strategy |
| `mediaMaxMb` | number > 0 | — | Max media file size in MB |
| `blockStreaming` | boolean | — | Disable streaming responses |
| `blockStreamingCoalesce` | object | — | Coalescing settings: `minChars`, `maxChars`, `idleMs` |
| `replyToMode` | `"off"` \| `"first"` \| `"all"` | — | Reply threading mode |
| `typingIndicator` | `"none"` \| `"message"` \| `"reaction"` | `"none"` | Typing indicator mode |

### Actions

| Field | Type | Description |
|-------|------|-------------|
| `actions.reactions` | boolean | Send reactions to messages |

### DM Configuration

The `dm` sub-object provides additional DM-level policy:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dm.enabled` | boolean | — | Enable/disable DMs |
| `dm.policy` | `"pairing"` \| `"allowlist"` \| `"open"` \| `"disabled"` | `"pairing"` | DM access policy. `"open"` requires `dm.allowFrom` to include `"*"` |
| `dm.allowFrom` | (string\|number)[] | — | User IDs allowed to DM |

### Group Configuration

Per-group settings are defined under `groups.<group-id>`:

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable/disable this group |
| `allow` | boolean | Allow messages in this group |
| `requireMention` | boolean | Only respond when @mentioned |
| `users` | (string\|number)[] | Allowed user IDs in this group |
| `systemPrompt` | string | Group-specific system prompt |

### Multi-Account Support

The `accounts` field allows running multiple Google Chat bots from a single agent:

```json
{
  "connectors": {
    "googlechat": {
      "accounts": {
        "workspace-1": {
          "serviceAccountFile": "./sa-1.json",
          "audienceType": "project-number",
          "audience": "111111111"
        },
        "workspace-2": {
          "serviceAccountFile": "./sa-2.json",
          "audienceType": "project-number",
          "audience": "222222222"
        }
      },
      "defaultAccount": "workspace-1"
    }
  }
}
```

Account-level settings override the base connector settings. Use `defaultAccount` to specify which account is used when none is explicitly selected.

## Related

- [Google Chat plugin reference](/plugin-registry/platform/googlechat)
- [MS Teams connector reference](/connectors/msteams)
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
