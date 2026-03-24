---
title: WhatsApp Connector
sidebarTitle: WhatsApp
description: Connect your agent to WhatsApp using the @elizaos/plugin-whatsapp package.
---

Connect your agent to WhatsApp for private chats and group conversations via personal or business accounts.

## Overview

The WhatsApp connector is an external elizaOS plugin that bridges your agent to WhatsApp. It supports two authentication methods: **Baileys** (QR code scan, personal accounts) and **Cloud API** (WhatsApp Business API). The connector is auto-enabled by the runtime when a valid auth configuration is detected.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-whatsapp` |
| Config key | `connectors.whatsapp` |
| Auto-enable trigger | `authDir`, `authState`, `sessionPath`, or `accounts` with at least one account having `authDir` |

## Minimal Configuration

In your character file (Baileys / QR code):

```json
{
  "connectors": {
    "whatsapp": {
      "accounts": {
        "default": {
          "enabled": true,
          "authDir": "./auth/whatsapp"
        }
      }
    }
  }
}
```

Or with a top-level `authDir` (single account shorthand):

```json
{
  "connectors": {
    "whatsapp": {
      "authDir": "./whatsapp-auth"
    }
  }
}
```

## Disabling

To explicitly disable the connector even when auth config is present:

```json
{
  "connectors": {
    "whatsapp": {
      "authDir": "./whatsapp-auth",
      "enabled": false
    }
  }
}
```

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.whatsapp` in your character config. The plugin is loaded when any of the following is truthy (and `enabled` is not explicitly `false`):

- `authDir` is set at the top level
- `authState` is set at the top level
- `sessionPath` is set at the top level
- `accounts` contains at least one account with `authDir` set

No environment variable is required to trigger auto-enable -- it is driven entirely by the connector config object.

## Authentication Methods

### Baileys (QR Code)

Baileys connects via the WhatsApp Web multi-device protocol. No API keys or business accounts are needed. On first start, a QR code is printed to the terminal. Scan it with your phone (WhatsApp > Settings > Linked Devices > Link a Device) to authenticate.

**Pros**: No API costs, works with personal accounts, full feature access.
**Cons**: Requires a phone with WhatsApp linked, session can expire if phone disconnects.

### Cloud API (Business)

The WhatsApp Business Cloud API is Meta's official API. Requires a WhatsApp Business Account and access tokens from the Meta Developer Dashboard.

**Pros**: Official API, reliable uptime, webhook-based.
**Cons**: Requires business account, per-message costs may apply, approval process.

## Environment Variables

For Cloud API authentication, the following environment variables are used:

| Variable | Description |
|----------|-------------|
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Business API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID from Meta Developer Dashboard |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Webhook verification token |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp Business Account ID |

These can also be placed in the `env` section of your config file. Baileys mode does not require any environment variables.

## Full Configuration Reference

All fields are defined under `connectors.whatsapp` in your character file.

### Core Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `accounts` | object | -- | Named account configurations (see Multi-Account below) |
| `authDir` | string | -- | Directory for Baileys session files (single-account shorthand) |
| `enabled` | boolean | -- | Explicitly enable/disable |
| `dmPolicy` | `"pairing"` \| `"open"` \| `"closed"` | `"pairing"` | DM acceptance policy. `"open"` requires `allowFrom` to include `"*"` |
| `allowFrom` | string[] | -- | Allowlist of phone numbers (required when `dmPolicy: "open"`) |
| `groupPolicy` | `"open"` \| `"disabled"` \| `"allowlist"` | `"allowlist"` | Group message policy |
| `groupAllowFrom` | string[] | -- | Allowlist of group JIDs |
| `historyLimit` | number | -- | Max messages to load from conversation history |
| `dmHistoryLimit` | number | -- | Max messages for DM history |
| `textChunkLimit` | number | -- | Max characters per outgoing message chunk |
| `chunkMode` | `"length"` \| `"newline"` | -- | Long message splitting strategy |
| `mediaMaxMb` | number | `50` | Max media attachment size in MB |
| `sendReadReceipts` | boolean | -- | Send read receipts for incoming messages |
| `selfChatMode` | boolean | -- | Respond to your own messages (for testing; avoid in production) |
| `messagePrefix` | string | -- | Text prefix added to all outgoing messages |
| `debounceMs` | number | `0` | Delay in ms before responding, to allow message batching |
| `blockStreaming` | boolean | -- | Disable streaming responses |
| `groups` | object | -- | Per-group configuration overrides |

### Acknowledgment Reactions

Configure emoji reactions sent as message acknowledgments:

```json
{
  "connectors": {
    "whatsapp": {
      "ackReaction": {
        "emoji": "eyes",
        "direct": true,
        "group": "mentions"
      }
    }
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ackReaction.emoji` | string | -- | Reaction emoji to send as acknowledgment |
| `ackReaction.direct` | boolean | `true` | Send ack reactions in DMs |
| `ackReaction.group` | string | `"mentions"` | Group ack behavior: `"always"`, `"mentions"`, or `"never"` |

### Multi-Account Support

The `accounts` field allows running multiple WhatsApp sessions from a single agent. Each account gets its own Baileys auth directory and QR code pairing flow.

```json
{
  "connectors": {
    "whatsapp": {
      "accounts": {
        "account-1": {
          "enabled": true,
          "authDir": "./auth/whatsapp-1"
        },
        "account-2": {
          "enabled": true,
          "authDir": "./auth/whatsapp-2"
        }
      }
    }
  }
}
```

Each account under `accounts.<name>` supports all top-level fields plus:

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable or disable this account |
| `authDir` | string | Directory for Baileys session files (required per account) |
| `name` | string | Display name for this account |

### Self-Chat Mode

When `selfChatMode` is `true`, the agent responds to messages you send to yourself (the "Message Yourself" chat). This is useful for testing without involving other contacts. Avoid enabling in production.

```json
{
  "connectors": {
    "whatsapp": {
      "selfChatMode": true
    }
  }
}
```

## Session Persistence

Baileys saves its session state to the directory specified by `authDir`. This includes:

- Encryption credentials
- Device registration info
- Authentication keys

The session persists across restarts. A new QR code is only generated when:

- The session files in `authDir` are deleted or corrupted
- Your phone revokes the linked device (Settings > Linked Devices > remove)
- The session expires due to prolonged disconnection

**Security considerations**:

- Never commit the auth directory to version control (`auth/` should be in `.gitignore`)
- Back up the auth directory to avoid re-scanning on a new machine
- The auth directory contents grant full access to the linked WhatsApp session

## Troubleshooting

### Plugin Not Loading

Verify that at least one of the auto-enable triggers is present in your config:

- `authDir` at the top level, or
- At least one account under `accounts` with `authDir` set and `enabled: true`

### QR Code Expires

QR codes have a short TTL (typically around 20 seconds). The connector automatically generates a new QR code when the previous one expires. Make sure your phone has internet access when scanning.

### Session Expired

If reconnection fails with a session error:

1. Delete the contents of your `authDir` directory
2. Restart Milady
3. Scan the new QR code

### `dmPolicy: "open"` Validation Error

When setting `dmPolicy` to `"open"`, you must also set `allowFrom: ["*"]`. This is a safety requirement enforced by the config validator:

```json
{
  "dmPolicy": "open",
  "allowFrom": ["*"]
}
```

### Rate Limits

WhatsApp has undocumented rate limits. If the agent sends messages too rapidly, the connection may be throttled or temporarily banned. Use `debounceMs` to add delays:

```json
{
  "debounceMs": 1000
}
```

## Related

- [WhatsApp setup guide](/guides/whatsapp)
- [WhatsApp plugin reference](/plugin-registry/platform/whatsapp)
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
