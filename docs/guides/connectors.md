---
title: "Platform Connectors"
sidebarTitle: "Connectors"
description: "Platform bridges for 29 messaging platforms — 19 auto-enabled from config (Discord, Telegram, Slack, WhatsApp, Signal, iMessage, BlueBubbles, Blooio, MS Teams, Google Chat, Twitter, Farcaster, Twitch, Mattermost, Matrix, Feishu, Nostr, Lens, Retake) plus 10 installable from the registry (Bluesky, Instagram, LINE, Zalo, Twilio, GitHub, Gmail Watch, Nextcloud Talk, Tlon, WeChat)."
---

Connectors are platform bridges that allow your agent to communicate across messaging platforms and social networks. Each connector handles authentication, message routing, session management, and platform-specific features.

## Table of Contents

1. [Supported Platforms](#supported-platforms)
2. [General Configuration](#general-configuration)
3. [Discord](#discord)
4. [Telegram](#telegram)
5. [Slack](#slack)
6. [WhatsApp](#whatsapp)
7. [Signal](#signal)
8. [iMessage](#imessage)
9. [BlueBubbles](#bluebubbles)
10. [Blooio](#blooio)
11. [Microsoft Teams](#microsoft-teams)
12. [Google Chat](#google-chat)
13. [Twitter](#twitter)
14. [Farcaster](#farcaster)
15. [Bluesky](#bluesky)
16. [Instagram](#instagram)
17. [Twitch](#twitch)
18. [Mattermost](#mattermost)
19. [WeChat](#wechat)
20. [Matrix](#matrix)
21. [Feishu / Lark](#feishu--lark)
22. [Nostr](#nostr)
23. [LINE](#line)
24. [Zalo](#zalo)
25. [Twilio](#twilio)
26. [GitHub](#github)
27. [Gmail Watch](#gmail-watch)
28. [Nextcloud Talk](#nextcloud-talk)
29. [Tlon](#tlon)
30. [Lens](#lens)
31. [Retake](#retake)
32. [Connector Lifecycle](#connector-lifecycle)
33. [Multi-Account Support](#multi-account-support)
34. [Session Management](#session-management)

---

## Supported Platforms

Connectors marked **Auto** load automatically when their config is present in `milady.json`. Connectors marked **Registry** must be installed first with `milady plugins install <package>`.

| Platform | Auth Method | DM Support | Group Support | Multi-Account | Availability |
|----------|------------|------------|---------------|---------------|-------------|
| Discord | Bot token | Yes | Yes (guilds/channels) | Yes | Auto |
| Telegram | Bot token | Yes | Yes (groups/topics) | Yes | Auto |
| Slack | Bot + App tokens | Yes | Yes (channels/threads) | Yes | Auto |
| WhatsApp | QR code (Baileys) or Cloud API | Yes | Yes | Yes | Auto |
| Signal | signal-cli HTTP API | Yes | Yes | Yes | Auto |
| iMessage | Native CLI (macOS) | Yes | Yes | Yes | Auto |
| BlueBubbles | Server URL + password | Yes | Yes | Yes | Auto |
| Blooio | API key + webhook | Yes | Yes | No | Auto |
| Microsoft Teams | App ID + password | Yes | Yes (teams/channels) | No | Auto |
| Google Chat | Service account | Yes | Yes (spaces) | Yes | Auto |
| Twitter | API keys + tokens | DMs | N/A | No | Auto |
| Farcaster | Neynar API key + signer | Casts | Yes (channels) | No | Auto |
| Twitch | Client ID + access token | Yes (chat) | Yes (channels) | No | Auto |
| Mattermost | Bot token | Yes | Yes (channels) | No | Auto |
| WeChat | Proxy API key + QR code | Yes | Yes | Yes | Registry |
| Matrix | Access token | Yes | Yes (rooms) | No | Auto |
| Feishu / Lark | App ID + secret | Yes | Yes (group chats) | No | Auto |
| Nostr | Private key (nsec/hex) | Yes (NIP-04) | N/A | No | Auto |
| Lens | API key | Yes | N/A | No | Auto |
| Retake | Access token | Yes | Yes | No | Auto |
| Bluesky | Account credentials | Posts | N/A | No | Registry |
| Instagram | Username + password | DMs | N/A | No | Registry |
| LINE | Channel access token + secret | Yes | Yes | No | Registry |
| Zalo | Access token | Yes | Yes | No | Registry |
| Twilio | Account SID + auth token | SMS/Voice | N/A | No | Registry |
| GitHub | API token | Issues/PRs | Yes (repos) | No | Registry |
| Gmail Watch | Service account / OAuth | N/A | N/A | No | Registry |
| Nextcloud Talk | Server credentials | Yes | Yes (rooms) | No | Registry |
| Tlon | Ship credentials | Yes | Yes (Urbit chats) | No | Registry |

---

## General Configuration

Connectors are configured in the `connectors` section of `milady.json`. Common fields shared across most connectors:

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable or disable the connector |
| `dmPolicy` | string | DM acceptance: `"pairing"` (default), `"open"`, or `"closed"` |
| `allowFrom` | string[] | Allowlist of user IDs (required when `dmPolicy: "open"`) |
| `groupPolicy` | string | Group message policy: `"allowlist"` (default) or `"open"` |
| `groupAllowFrom` | string[] | Allowlist of group IDs |
| `historyLimit` | number | Max messages to load from conversation history |
| `dmHistoryLimit` | number | Max messages for DM history |
| `textChunkLimit` | number | Max characters per message chunk |
| `chunkMode` | string | `"length"` or `"newline"` -- how to split long messages |
| `blockStreaming` | boolean | Disable streaming responses |
| `mediaMaxMb` | number | Max media attachment size in MB |
| `configWrites` | boolean | Allow the agent to modify its own config |
| `capabilities` | string[] | Feature flags for this connector |
| `markdown` | object | Markdown rendering settings |
| `heartbeat` | object | Channel heartbeat visibility settings |

---

## Discord

### Setup Requirements

- Discord bot token (from Discord Developer Portal)
- Bot must be invited to target servers with appropriate permissions

### Key Configuration

```json
{
  "connectors": {
    "discord": {
      "enabled": true,
      "token": "BOT_TOKEN",
      "groupPolicy": "allowlist",
      "guilds": {
        "SERVER_ID": {
          "requireMention": true,
          "channels": {
            "CHANNEL_ID": {
              "allow": true,
              "requireMention": false
            }
          }
        }
      },
      "dm": {
        "enabled": true,
        "policy": "pairing"
      }
    }
  }
}
```

### Features

- Per-guild and per-channel configuration
- DM policy with allowlists
- Reaction notifications (`off`, `own`, `all`, `allowlist`)
- Execution approvals with designated approver users
- PluralKit integration
- Reply-to mode configuration
- Intent configuration (presence, guild members)
- Actions: reactions, stickers, emoji uploads, polls, permissions, messages, threads, pins, search, member/role/channel info, voice status, events, moderation, presence

---

## Telegram

### Setup Requirements

- Bot token from @BotFather

### Key Configuration

```json
{
  "connectors": {
    "telegram": {
      "enabled": true,
      "botToken": "BOT_TOKEN",
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist",
      "groups": {
        "GROUP_ID": {
          "requireMention": true,
          "topics": {
            "TOPIC_ID": {
              "enabled": true
            }
          }
        }
      }
    }
  }
}
```

### Features

- Per-group and per-topic configuration
- Custom slash commands with validation
- Inline buttons (scope: `off`, `dm`, `group`, `all`, `allowlist`)
- Webhook mode (with webhook URL, secret, and path)
- Stream mode (`off`, `partial`, `block`)
- Reaction notifications and reaction levels
- Link preview control
- Network configuration (auto-select family)
- Proxy support

---

## Slack

### Setup Requirements

- Bot token (`xoxb-...`)
- App token (`xapp-...`) for Socket Mode
- Signing secret (for HTTP mode)

### Key Configuration

```json
{
  "connectors": {
    "slack": {
      "enabled": true,
      "mode": "socket",
      "botToken": "xoxb-...",
      "appToken": "xapp-...",
      "groupPolicy": "allowlist",
      "channels": {
        "CHANNEL_ID": {
          "allow": true,
          "requireMention": true
        }
      }
    }
  }
}
```

### Features

- Socket Mode or HTTP mode
- Per-channel configuration with allowlists
- Thread-aware history (thread or channel scope)
- User token support (read-only by default)
- Slash command integration (with ephemeral response option)
- Reply-to mode by chat type (direct, group, channel)
- DM group channels support
- Actions: reactions, messages, pins, search, permissions, member info, channel info, emoji list

---

## WhatsApp

### Setup Requirements

- Baileys: No external credentials needed (QR code scan)
- Cloud API: WhatsApp Business API access token and phone number ID

### Key Configuration

```json
{
  "connectors": {
    "whatsapp": {
      "accounts": {
        "default": {
          "enabled": true,
          "authDir": "./auth/whatsapp"
        }
      },
      "dmPolicy": "pairing",
      "sendReadReceipts": true,
      "debounceMs": 0
    }
  }
}
```

### Features

- Per-account auth directory for Baileys session persistence
- Self-chat mode for testing
- Message prefix for outgoing messages
- Acknowledgment reactions (configurable emoji, DM/group behavior)
- Debounce for rapid messages
- Per-group configuration with mention requirements
- Actions: reactions, send message, polls

See the [WhatsApp Integration Guide](/guides/whatsapp) for detailed setup instructions.

---

## Signal

### Setup Requirements

- signal-cli running in HTTP/JSON-RPC mode
- Registered Signal account

### Key Configuration

```json
{
  "connectors": {
    "signal": {
      "enabled": true,
      "account": "+1234567890",
      "httpUrl": "http://localhost:8080",
      "dmPolicy": "pairing"
    }
  }
}
```

### Features

- HTTP URL or host/port configuration
- CLI path with optional auto-start
- Startup timeout configuration (1-120 seconds)
- Receive mode (`on-start` or `manual`)
- Attachment and story handling options
- Read receipt support
- Reaction notifications and levels

---

## iMessage

### Setup Requirements

- macOS with iMessage configured
- CLI tool for iMessage access (e.g., `imessage-exporter`)

### Key Configuration

```json
{
  "connectors": {
    "imessage": {
      "enabled": true,
      "cliPath": "/usr/local/bin/imessage-exporter",
      "service": "auto",
      "dmPolicy": "pairing"
    }
  }
}
```

> **Auto-enable note:** The connector auto-enables when `cliPath` is set. Without it, the plugin will not load.

### Features

- Service selection: `imessage`, `sms`, or `auto`
- CLI path and database path configuration
- Remote host support
- Region configuration
- Attachment inclusion toggle
- Per-group mention and tool configuration

---

## BlueBubbles

### Setup Requirements

- BlueBubbles server running
- Server URL and password

### Key Configuration

```json
{
  "connectors": {
    "bluebubbles": {
      "enabled": true,
      "serverUrl": "http://localhost:1234",
      "password": "your-password",
      "dmPolicy": "pairing"
    }
  }
}
```

### Features

- iMessage bridge via BlueBubbles server
- Webhook path configuration
- Read receipt support
- Actions: reactions, edit, unsend, reply, send with effect, group management (rename, set icon, add/remove participants, leave), send attachment

---

## Blooio

Connects to iMessage and SMS messaging via the Blooio service with signed webhooks.

### Setup Requirements

- Blooio API key
- Webhook URL for receiving messages

### Key Configuration

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

**Environment variables:** `BLOOIO_API_KEY`, `BLOOIO_WEBHOOK_URL`

### Features

- iMessage and SMS messaging via Blooio bridge
- Signed webhook verification for inbound messages
- Outbound message sending
- Auto-enabled when `apiKey` is configured

---

## Microsoft Teams

### Setup Requirements

- Azure Bot registration (App ID and App Password)
- Tenant ID

### Key Configuration

```json
{
  "connectors": {
    "msteams": {
      "enabled": true,
      "botToken": "APP_PASSWORD",
      "appId": "APP_ID",
      "appPassword": "APP_PASSWORD",
      "tenantId": "TENANT_ID",
      "dmPolicy": "pairing"
    }
  }
}
```

> **Auto-enable note:** The connector auto-enables when `botToken`, `token`, or `apiKey` is present in the config. Set `botToken` to the app password to trigger auto-enable.

### Features

- Per-team and per-channel configuration
- Reply style configuration
- Webhook port and path settings
- Media host allowlists (for downloading and auth)
- SharePoint site ID for file uploads in group chats
- Up to 100MB media support (OneDrive upload)

---

## Google Chat

### Setup Requirements

- Google Cloud service account with Chat API access
- Service account JSON key file or inline config

### Key Configuration

```json
{
  "connectors": {
    "googlechat": {
      "enabled": true,
      "apiKey": "placeholder",
      "serviceAccountFile": "./service-account.json",
      "audienceType": "project-number",
      "audience": "123456789",
      "webhookPath": "/google-chat"
    }
  }
}
```

> **Auto-enable note:** Google Chat uses service-account auth, not a traditional API key. Include `"apiKey": "placeholder"` to trigger auto-enable — the actual authentication uses the service account file.

### Features

- Service account auth (file path or inline JSON)
- Audience type configuration (`app-url` or `project-number`)
- Webhook path and URL configuration
- Per-group configuration with mention requirements
- Typing indicator modes (`none`, `message`, `reaction`)
- DM policy with group chat support

---

## Twitter

### Setup Requirements

- Twitter API v2 credentials (API key, API secret key, access token, access token secret)

### Key Configuration

```json
{
  "connectors": {
    "twitter": {
      "enabled": true,
      "apiKey": "...",
      "apiSecretKey": "...",
      "accessToken": "...",
      "accessTokenSecret": "...",
      "postEnable": true,
      "postIntervalMin": 90,
      "postIntervalMax": 180
    }
  }
}
```

### Features

- Automated posting with configurable intervals and variance
- Post immediately option
- Search and mention monitoring
- Timeline algorithm selection (`weighted` or `latest`)
- Auto-respond to mentions
- Action processing toggle
- Dry run mode for testing
- Configurable max tweet length (default: 4000)

---

## Farcaster

### Setup Requirements

- Neynar API key (from [neynar.com](https://neynar.com))
- Farcaster account with a Neynar signer UUID
- Farcaster ID (FID) of the agent account

### Key Configuration

```json
{
  "connectors": {
    "farcaster": {
      "enabled": true,
      "apiKey": "YOUR_NEYNAR_API_KEY",
      "signerUuid": "YOUR_SIGNER_UUID",
      "fid": 12345,
      "channels": ["ai", "agents"],
      "castIntervalMin": 120,
      "castIntervalMax": 240
    }
  }
}
```

### Features

- Autonomous casting (posting) at configurable intervals
- Reply to @mentions and cast replies
- Channel monitoring and participation
- Reactions (likes and recasts)
- Direct casts (private messages)
- On-chain identity tied to Ethereum address
- Cast thread splitting for messages over 320 characters

---

## Bluesky

### Setup Requirements

- Bluesky account credentials (handle and app password)

### Key Configuration

```json
{
  "connectors": {
    "bluesky": {
      "enabled": true,
      "postEnable": true,
      "postIntervalMin": 90,
      "postIntervalMax": 180
    }
  }
}
```

**Environment variables:** `BLUESKY_ENABLED`, `BLUESKY_DRY_RUN`, `BLUESKY_USERNAME`, `BLUESKY_PASSWORD`, `BLUESKY_HANDLE`

### Features

- Post creation at configurable intervals
- Mention and reply monitoring
- Dry run mode for testing
- AT Protocol-based decentralized social networking

**Note:** This connector is available from the plugin registry. Install it with `milady plugins install @elizaos/plugin-bluesky`.

---

## Instagram

### Setup Requirements

- Instagram account credentials (username and password)

### Key Configuration

```json
{
  "connectors": {
    "instagram": {
      "enabled": true
    }
  }
}
```

**Environment variables:** `INSTAGRAM_USERNAME`, `INSTAGRAM_PASSWORD`, `INSTAGRAM_DRY_RUN`, `INSTAGRAM_POLL_INTERVAL`, `INSTAGRAM_POST_INTERVAL_MIN`, `INSTAGRAM_POST_INTERVAL_MAX`

### Features

- Media posting with caption generation
- Comment monitoring and response
- DM handling
- Dry run mode for testing
- Configurable posting and polling intervals

**Note:** This connector is available from the plugin registry. Install it with `milady plugins install @elizaos/plugin-instagram`.

---

## Twitch

### Setup Requirements

- Twitch application Client ID and access token
- Twitch channel to connect to

### Key Configuration

```json
{
  "connectors": {
    "twitch": {
      "enabled": true,
      "clientId": "YOUR_CLIENT_ID",
      "accessToken": "YOUR_ACCESS_TOKEN"
    }
  }
}
```

### Features

- Live chat monitoring and response
- Channel event handling
- Audience interaction management
- Auto-enabled when `clientId` or `accessToken` is configured

---

## Mattermost

### Setup Requirements

- Mattermost bot token (from System Console > Integrations > Bot Accounts)
- Mattermost server URL

### Key Configuration

```json
{
  "connectors": {
    "mattermost": {
      "enabled": true,
      "botToken": "YOUR_BOT_TOKEN",
      "baseUrl": "https://chat.example.com",
      "chatmode": "all",
      "requireMention": false
    }
  }
}
```

**Environment variables:** `MATTERMOST_BOT_TOKEN`, `MATTERMOST_BASE_URL`

### Features

- Channel and DM messaging
- Chat mode restriction (`dm-only`, `channel-only`, or `all`)
- Mention filtering (optionally require @mentions)
- Custom command prefix triggers
- Self-hosted server support

---

## WeChat

Connects to WeChat via a third-party proxy service using personal account login.

### Setup Requirements

1. Obtain an API key from the WeChat proxy service
2. Configure the proxy URL and webhook port
3. Scan QR code displayed in terminal on first startup

### Privacy Notice

The WeChat connector depends on a user-supplied proxy service. That proxy receives
your connector API key plus the message payloads and metadata needed to relay
incoming and outgoing WeChat traffic. Only point `proxyUrl` at infrastructure you
operate yourself or explicitly trust for that message flow.

### Key Configuration

```json
{
  "connectors": {
    "wechat": {
      "apiKey": "<key>",
      "proxyUrl": "https://...",
      "webhookPort": 18790,
      "deviceType": "ipad"
    }
  }
}
```

| Field | Description |
|-------|------------|
| `apiKey` | **Required** -- Proxy service API key |
| `proxyUrl` | **Required** -- Proxy service URL |
| `webhookPort` | Webhook listener port (default: 18790) |
| `deviceType` | Device emulation type: `ipad` or `mac` (default: `ipad`) |

**Environment variables:** `WECHAT_API_KEY`

**Multi-account:** Supported via `accounts` map (same pattern as WhatsApp).

### Features

- Text messaging in DMs (enabled by default)
- Group chat support (enable with `features.groups: true`)
- Image send/receive (enable with `features.images: true`)
- QR code login with automatic session persistence
- Multi-account support via accounts map

---

## Matrix

### Setup Requirements

- Matrix account on any homeserver (e.g., matrix.org or self-hosted)
- Access token for the bot account

### Key Configuration

```json
{
  "env": {
    "MATRIX_ACCESS_TOKEN": "syt_your_access_token"
  },
  "connectors": {
    "matrix": {
      "enabled": true,
      "token": "syt_your_access_token"
    }
  }
}
```

> **Auto-enable note:** The connector auto-enables when `token`, `botToken`, or `apiKey` is present in the connector config. Setting `"enabled": true` alone is not sufficient — include the `token` field.

**Environment variables:** `MATRIX_ACCESS_TOKEN`, `MATRIX_HOMESERVER`, `MATRIX_USER_ID`, `MATRIX_DEVICE_ID`, `MATRIX_ROOMS`, `MATRIX_AUTO_JOIN`, `MATRIX_ENCRYPTION`, `MATRIX_REQUIRE_MENTION`

### Features

- Room and DM messaging on any spec-compliant homeserver
- Auto-join on room invitations
- End-to-end encryption (Olm) support
- Mention filtering in rooms
- Federation support across homeservers

---

## Feishu / Lark

### Setup Requirements

- Feishu/Lark Custom App with App ID and App Secret
- Bot capability enabled on the app

### Key Configuration

```json
{
  "env": {
    "FEISHU_APP_ID": "cli_your_app_id",
    "FEISHU_APP_SECRET": "your_app_secret"
  },
  "connectors": {
    "feishu": {
      "enabled": true,
      "apiKey": "your_app_secret"
    }
  }
}
```

> **Auto-enable note:** The connector auto-enables when `apiKey`, `token`, or `botToken` is present in the connector config. Set `apiKey` to the app secret to trigger auto-enable.

**Environment variables:** `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_DOMAIN`, `FEISHU_ALLOWED_CHATS`

### Features

- Direct bot messaging and group chats
- Chat allowlist for access control
- China (`feishu.cn`) and global (`larksuite.com`) domain support
- Event subscription for real-time messages

---

## Nostr

### Setup Requirements

- Nostr private key (nsec or hex format)

### Key Configuration

```json
{
  "env": {
    "NOSTR_PRIVATE_KEY": "nsec1your_private_key"
  },
  "connectors": {
    "nostr": {
      "enabled": true,
      "token": "placeholder"
    }
  }
}
```

> **Auto-enable note:** Nostr uses key-based auth, not a traditional token. Include `"token": "placeholder"` in the connector config to trigger auto-enable — the actual authentication uses the `NOSTR_PRIVATE_KEY` environment variable.

**Environment variables:** `NOSTR_PRIVATE_KEY`, `NOSTR_RELAYS`, `NOSTR_DM_POLICY`, `NOSTR_ALLOW_FROM`, `NOSTR_ENABLED`

### Features

- Multi-relay connectivity
- Note publishing (kind 1 events)
- NIP-04 encrypted direct messages
- DM access policies (allow, deny, allowlist)
- Fully decentralized via relay network

---

## LINE

### Setup Requirements

- LINE Channel access token
- LINE Channel secret

### Key Configuration

```json
{
  "connectors": {
    "line": {
      "enabled": true
    }
  }
}
```

**Environment variables:** `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `LINE_CUSTOM_GREETING`

### Features

- Bot messaging and customer conversations
- Rich message types (text, sticker, image, video)
- Group chat support
- Webhook-based event handling

**Note:** This connector is available from the plugin registry. Install it with `milady plugins install @elizaos/plugin-line`.

---

## Zalo

### Setup Requirements

- Zalo Official Account (OA) access token

### Key Configuration

```json
{
  "connectors": {
    "zalo": {
      "enabled": true
    }
  }
}
```

**Environment variables:** `ZALO_ACCESS_TOKEN`, `ZALO_REFRESH_TOKEN`, `ZALO_APP_ID`, `ZALO_APP_SECRET`

### Features

- Official account messaging and support workflows
- Webhook-based message handling
- Customer interaction management

A personal-account variant is also available as `@elizaos/plugin-zalouser` for one-to-one messaging outside of the Official Account system.

**Note:** This connector is available from the plugin registry. Install it with `milady plugins install @elizaos/plugin-zalo`.

---

## Twilio

### Setup Requirements

- Twilio Account SID and Auth Token
- A Twilio phone number

### Key Configuration

```json
{
  "connectors": {
    "twilio": {
      "enabled": true
    }
  }
}
```

**Environment variables:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

### Features

- SMS messaging (send and receive)
- Voice call capabilities
- Webhook-based inbound message handling

**Note:** This connector is available from the plugin registry. Install it with `milady plugins install @elizaos/plugin-twilio`.

---

## GitHub

### Setup Requirements

- GitHub API token (personal access token or fine-grained token)

### Key Configuration

```json
{
  "connectors": {
    "github": {
      "enabled": true
    }
  }
}
```

**Environment variables:** `GITHUB_API_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`

### Features

- Repository management
- Issue tracking and creation
- Pull request workflows (create, review, merge)
- Code search and file access

**Note:** This connector is available from the plugin registry. Install it with `milady plugins install @elizaos/plugin-github`.

---

## Gmail Watch

### Setup Requirements

- Google Cloud service account or OAuth credentials with Gmail API access

### Key Configuration

Gmail Watch is enabled via the `features.gmailWatch` flag or environment variables rather than the `connectors` section.

### Features

- Gmail Pub/Sub message watching
- Auto-renewal of watch subscriptions
- Inbound email event handling

**Note:** This connector is available from the plugin registry. Install it with `milady plugins install @elizaos/plugin-gmail-watch`.

---

## Nextcloud Talk

### Setup Requirements

- Nextcloud server URL and credentials

### Key Configuration

```json
{
  "connectors": {
    "nextcloud-talk": {
      "enabled": true
    }
  }
}
```

### Features

- Room-based messaging
- DM and group conversation support
- Self-hosted collaboration platform integration

**Note:** This connector is available from the plugin registry. Install it with `milady plugins install @elizaos/plugin-nextcloud-talk`.

---

## Tlon

### Setup Requirements

- Tlon ship credentials (Urbit ship name and access code)

### Key Configuration

```json
{
  "connectors": {
    "tlon": {
      "enabled": true
    }
  }
}
```

**Environment variables:** `TLON_SHIP`, `TLON_CODE`, `TLON_URL`

### Features

- Urbit-based chat and social interactions
- Ship-to-ship messaging
- Group chat participation

**Note:** This connector is available from the plugin registry. Install it with `milady plugins install @elizaos/plugin-tlon`.

---

## Lens

**Plugin:** `@elizaos/plugin-lens`

```json5
{
  connectors: {
    lens: {
      apiKey: "your-lens-api-key",
    }
  }
}
```

| Env Variable | Config Path |
|-------------|-------------|
| `LENS_API_KEY` | `connectors.lens.apiKey` |

**Auto-enable triggers:** `apiKey`, `token`, or `botToken`.

**Features:**
- Lens Protocol social interactions
- Post publishing and engagement

---

## Retake

**Plugin:** `@elizaos/plugin-retake`

```json5
{
  connectors: {
    retake: {
      accessToken: "your-retake-access-token",
    }
  }
}
```

| Env Variable | Config Path |
|-------------|-------------|
| `RETAKE_AGENT_TOKEN` | `connectors.retake.accessToken` |

**Auto-enable triggers:** `accessToken` or `enabled: true`.

**Features:**
- Retake platform messaging
- Also supports streaming output — see [Streaming](/skills/streaming)

---

## Connector Lifecycle

The typical connector lifecycle follows this pattern:

1. **Install plugin** -- Connector plugins are installed as `@elizaos/plugin-{platform}` packages
2. **Configure** -- Add the platform configuration to the `connectors` section of `milady.json`
3. **Enable** -- Set `enabled: true` in the connector config
4. **Authenticate** -- Provide credentials (tokens, keys) or complete auth flow (QR code scan)
5. **Run** -- The runtime starts the connector, establishes connections, and begins message handling
6. **Monitor** -- Status probes verify connectivity; reconnection happens automatically on failures

---

## Multi-Account Support

Most connectors support multiple accounts via the `accounts` key. Each account has its own configuration, authentication, and session state:

```json
{
  "connectors": {
    "telegram": {
      "dmPolicy": "pairing",
      "accounts": {
        "main-bot": {
          "enabled": true,
          "botToken": "TOKEN_1"
        },
        "support-bot": {
          "enabled": true,
          "botToken": "TOKEN_2",
          "dmPolicy": "open",
          "allowFrom": ["*"]
        }
      }
    }
  }
}
```

Account-level settings override the base connector settings. Each account runs independently with its own connection, credentials, and session state.

---

## Session Management

All connectors manage sessions that track conversation state across platforms:

- **DM sessions** -- one session per user, governed by `dmPolicy`
- **Group sessions** -- one session per group/channel, governed by `groupPolicy`
- **History** -- configurable message history depth per session type (`historyLimit`, `dmHistoryLimit`)
- **DM configurations** -- per-user DM overrides via the `dms` record

The `dmPolicy` options are:

| Policy | Behavior |
|--------|----------|
| `pairing` | Default. Agent responds after a pairing/onboarding flow. |
| `open` | Agent responds to all DMs. Requires `allowFrom: ["*"]`. |
| `closed` | Agent does not respond to DMs. |

---

## Connector Operations Runbook

### Setup Checklist

1. Configure connector credentials under `connectors.<name>`.
2. Enable connector plugin loading via connector config or plugin allow-list.
3. Validate DM/group policy values and allow-lists before enabling `open` policies.
4. For each connector, confirm the platform bot/app is created and tokens are valid (see platform-specific notes below).
5. Test connectivity in `pairing` mode before switching to `open` mode.

### Failure Modes

**General connector failures:**

- Connector plugin not loading:
  Check connector ID mapping in `src/config/plugin-auto-enable.ts`, plugin availability, and `plugins.entries` overrides. The auto-enable layer maps connector config keys to plugin package names — a mismatch means the plugin is silently skipped.
- Auth succeeds but no messages arrive:
  Check platform webhook/socket settings and policy gates (`dmPolicy`, `groupPolicy`). For webhook-based connectors, confirm the callback URL is publicly reachable.
- Misrouted connector secrets:
  Confirm expected env vars are populated from config and not overwritten by stale env. The config schema merges env vars with file config — env takes precedence.

**Discord:**

- Bot token rejected (`401 Unauthorized`):
  Regenerate the bot token in the Discord Developer Portal. Tokens are invalidated if the bot's password is reset or the token is leaked and auto-revoked.
- Bot is online but does not respond in channels:
  Check that the bot has `MESSAGE_CONTENT` intent enabled in the Developer Portal and the `groupPolicy` is not `closed`. Confirm the bot has `Send Messages` permission in the target channel.
- Rate limited (`429 Too Many Requests`):
  Discord rate limits are per-route. The connector should back off automatically. If persistent, reduce message frequency or check for message loops (bot replying to itself).

**Telegram:**

- Webhook not receiving updates:
  Telegram requires HTTPS with a valid certificate. Use `getWebhookInfo` to check status. If using long polling, confirm no other process is polling the same bot token (Telegram allows only one consumer).
- Bot token expired or revoked:
  Re-create the bot via BotFather and update `TELEGRAM_BOT_TOKEN`. Telegram tokens do not expire automatically but can be revoked.
- Messages delayed or missing:
  Telegram buffers updates for up to 24 hours if the webhook is unreachable. After restoring connectivity, a burst of backlogged messages may arrive.

**Slack:**

- `invalid_auth` or `token_revoked`:
  Reinstall the Slack app to the workspace. Bot tokens are revoked when the app is uninstalled or workspace permissions change.
- Events not arriving:
  Confirm the Events API subscription includes the required event types (`message.im`, `message.channels`). Check the Slack app's Request URL is verified and receiving challenge responses.

**WhatsApp:**

- QR pairing fails or session drops:
  WhatsApp Web sessions expire after extended inactivity. Re-pair by scanning a new QR code via `POST /api/whatsapp/pair`. The `whatsapp-pairing` service manages session state.
- Messages not delivered:
  WhatsApp enforces strict anti-spam policies. If the number is flagged, messages are silently dropped. Confirm the business account is in good standing.
- Multi-account auth directory issues:
  Each WhatsApp account requires its own `authDir` (Baileys multi-file auth state). If multiple accounts share a directory, sessions corrupt each other.

**Signal:**

- Signal CLI not found:
  The connector requires `signal-cli` in PATH or a `cliPath` configured. For HTTP mode, set `httpUrl` or `httpHost`/`httpPort` to point to a running signal-cli REST API.
- Account registration fails:
  Signal requires a verified phone number. Use `signal-cli register` or provide a pre-registered account number via `connectors.signal.account`.
- Multi-account configuration:
  Signal supports multiple accounts via the `accounts` map. Each account must have `account`, `httpUrl`, or `cliPath` set and must not be `enabled: false`.

**Twitter:**

- API key rejected:
  Confirm `connectors.twitter.apiKey` is a valid Twitter/X API key. Free-tier keys have strict rate limits.
- Tweet fetch failures:
  The FxTwitter API (`api.fxtwitter.com`) is used for tweet verification. If rate-limited, verification requests fail silently.

**BlueBubbles:**

- Connection refused:
  Requires `serverUrl` pointing to a running BlueBubbles server AND the server `password`. Confirm both are set under `connectors.bluebubbles`.
- macOS-only:
  BlueBubbles is a macOS iMessage bridge. It will not work on Linux or Windows.

**iMessage (direct):**

- CLI path not found:
  Requires `cliPath` pointing to a valid iMessage CLI tool. macOS-only — Accessibility permissions are required.

**Farcaster:**

- API key invalid:
  Confirm `connectors.farcaster.apiKey` is set. Farcaster hub access requires a valid API key.

**Lens:**

- API key invalid:
  Confirm `connectors.lens.apiKey` is set and the Lens API is reachable.

**MS Teams:**

- Bot token rejected:
  Teams bots require Azure AD registration. Confirm the bot token is valid and the app has the required permissions in the Azure portal.

**Mattermost:**

- Token authentication fails:
  Confirm `connectors.mattermost.botToken` (env: `MATTERMOST_BOT_TOKEN`) is a valid personal access token or bot token. Check that the Mattermost server URL is configured.

**Google Chat / Feishu:**

- Token authentication fails:
  Both require service account or bot tokens. Confirm the token is valid and has the required chat API scopes.

**Matrix:**

- Homeserver connection fails:
  Confirm the Matrix homeserver URL is reachable and the access token under `connectors.matrix.token` is valid.

**Nostr:**

- Relay connection fails:
  Nostr connectors communicate via relays. Confirm relay URLs are configured and reachable. API key authentication varies by relay.

**Twitch:**

- Authentication fails:
  Confirm `connectors.twitch.accessToken` or `connectors.twitch.clientId` is set. Alternatively, set `enabled: true` to force-enable. Ensure the access token has the required chat scopes.

**Retake / Blooio:**

- Authentication fails:
  Retake uses `accessToken` or `enabled: true` for configuration detection. Blooio uses `apiKey`. Confirm credentials are set under the respective connector config.

**Bluesky:**

- Authentication fails:
  Confirm `BLUESKY_USERNAME` and `BLUESKY_PASSWORD` environment variables are set. Bluesky uses app passwords, not your main account password.

**Instagram:**

- Login fails or account locked:
  Instagram may require verification for automated logins. Use an app-specific password if available. Avoid frequent login attempts which can trigger account locks.

**LINE:**

- Webhook not receiving messages:
  Confirm `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_CHANNEL_SECRET` are set. The webhook URL must be publicly reachable with HTTPS.

**Twilio:**

- SMS not sending:
  Confirm `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` are set. Check that the phone number is SMS-capable and the account has sufficient balance.

**GitHub:**

- API token rejected:
  Confirm `GITHUB_API_TOKEN` is a valid personal access token or fine-grained token with the required repository permissions.

### Recovery Procedures

1. **Stale connector session:** Restart the agent. Connectors re-initialize their platform connections on startup. For WebSocket-based connectors (Discord, Slack), this forces a fresh handshake.
2. **Token rotation:** Update the token in `milady.json` under `connectors.<name>` and restart. Do not edit env vars in a running process — the config is read at startup.
3. **Rate limit recovery:** The agent automatically backs off on 429 responses. If the connector is fully blocked, wait for the rate limit window to expire (typically 1–60 seconds for Discord, varies by platform) and restart.

### Verification Commands

```bash
# Connector auto-enable and runtime loading
bunx vitest run src/config/plugin-auto-enable.test.ts src/runtime/eliza.test.ts

# Platform-specific connector tests
bunx vitest run src/connectors/discord-connector.test.ts

# Connector e2e tests
bunx vitest run --config vitest.e2e.config.ts test/discord-connector.e2e.test.ts test/signal-connector.e2e.test.ts

# WhatsApp pairing
bunx vitest run src/services/__tests__/whatsapp-pairing.test.ts src/api/__tests__/whatsapp-routes.test.ts

bun run typecheck
```
