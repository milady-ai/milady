---
title: Signal Connector
sidebarTitle: Signal
description: Connect your agent to Signal using the @elizaos/plugin-signal package.
---

Connect your agent to Signal for private and group messaging via signal-cli.

## Overview

The Signal connector is an external elizaOS plugin that bridges your agent to Signal via signal-cli running in HTTP or JSON-RPC mode. It is auto-enabled by the runtime when a valid account configuration is detected.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-signal` |
| Config key | `connectors.signal` |
| Auto-enable trigger | `token`/`botToken`/`apiKey`, OR any of `authDir`/`account`/`httpUrl`/`httpHost`/`httpPort`/`cliPath`, OR `accounts` with configured entries |

## Minimal Configuration

In `~/.milady/milady.json`:

```json
{
  "connectors": {
    "signal": {
      "account": "+1234567890",
      "httpUrl": "http://localhost:8080",
      "dmPolicy": "pairing"
    }
  }
}
```

## Setup

### 1. Install signal-cli

Install [signal-cli](https://github.com/AsamK/signal-cli) and register or link a Signal account:

```bash
signal-cli -a +1234567890 register
signal-cli -a +1234567890 verify CODE
```

### 2. Start signal-cli in HTTP Mode

```bash
signal-cli -a +1234567890 daemon --http localhost:8080
```

### 3. Configure Milady

Add the `connectors.signal` block to `milady.json` as shown in the minimal configuration above.

## Disabling

To explicitly disable the connector even when an account is configured:

```json
{
  "connectors": {
    "signal": {
      "account": "+1234567890",
      "httpUrl": "http://localhost:8080",
      "enabled": false
    }
  }
}
```

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.signal` in your config. The plugin auto-enables when any of the following conditions are met (and `enabled` is not explicitly `false`):

- `account` is set together with `httpUrl`
- `cliPath` is set (signal-cli binary path for auto-start)
- `accounts` contains at least one configured entry

No environment variable is required to trigger auto-enable — it is driven entirely by the connector config object.

## Environment Variables

The runtime injects the following environment variables from your `connectors.signal` config into `process.env` via `CHANNEL_ENV_MAP`, so the plugin can read them at startup:

| Env Variable | Source Config Field | Description |
|---|---|---|
| `SIGNAL_AUTH_DIR` | `authDir` | Path to signal-cli data directory |
| `SIGNAL_ACCOUNT_NUMBER` | `account` | Signal phone number (E.164) |
| `SIGNAL_HTTP_URL` | `httpUrl` | HTTP URL for signal-cli daemon |
| `SIGNAL_CLI_PATH` | `cliPath` | Path to signal-cli binary |

You do not need to set these manually — they are derived from the connector config at runtime.

## Full Configuration Reference

All fields are defined under `connectors.signal` in `milady.json`.

### Core Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `account` | string | — | Signal phone number in E.164 format (e.g. `+1234567890`) |
| `httpUrl` | string | — | HTTP URL for signal-cli daemon (e.g. `http://localhost:8080`) |
| `httpHost` | string | — | Hostname alternative to `httpUrl` |
| `httpPort` | integer > 0 | — | Port alternative to `httpUrl` |
| `cliPath` | string | — | Path to signal-cli binary for auto-start |
| `autoStart` | boolean | — | Auto-start signal-cli when the connector loads |
| `startupTimeoutMs` | integer (1000-120000) | — | Milliseconds to wait for CLI startup (1-120 seconds) |
| `receiveMode` | `"on-start"` \| `"manual"` | `"on-start"` | When to begin receiving messages |
| `name` | string | — | Account display name |
| `enabled` | boolean | — | Explicitly enable/disable |
| `capabilities` | string[] | — | Capability flags |
| `configWrites` | boolean | — | Allow config writes from Signal events |

### Message Handling

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ignoreAttachments` | boolean | — | Ignore incoming attachments (default behaviour includes them) |
| `ignoreStories` | boolean | — | Ignore story messages (default behaviour excludes them) |
| `sendReadReceipts` | boolean | — | Send read receipts for received messages |
| `historyLimit` | integer >= 0 | — | Max messages in context |
| `dmHistoryLimit` | integer >= 0 | — | History limit for DMs |
| `dms` | object | — | Per-DM history overrides keyed by DM ID. Each value: `{historyLimit?: int}` |
| `textChunkLimit` | integer > 0 | — | Max characters per message chunk |
| `chunkMode` | `"length"` \| `"newline"` | — | Long message splitting strategy |
| `mediaMaxMb` | integer > 0 | — | Max media file size in MB |
| `markdown` | object | — | Table rendering: `tables` can be `"off"`, `"bullets"`, or `"code"` |

### Access Policies

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dmPolicy` | `"pairing"` \| `"allowlist"` \| `"open"` \| `"disabled"` | `"pairing"` | DM access policy. `"open"` requires `allowFrom` to include `"*"` |
| `allowFrom` | (string\|number)[] | — | User IDs allowed to DM |
| `groupPolicy` | `"open"` \| `"disabled"` \| `"allowlist"` | `"allowlist"` | Group join policy |
| `groupAllowFrom` | (string\|number)[] | — | User IDs allowed in groups |

### Streaming Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `blockStreaming` | boolean | — | Disable streaming entirely |
| `blockStreamingCoalesce` | object | — | Coalescing settings: `minChars`, `maxChars`, `idleMs` |

### Actions

| Field | Type | Description |
|-------|------|-------------|
| `actions.reactions` | boolean | Send reactions |

### Reaction Notifications

| Field | Type | Description |
|-------|------|-------------|
| `reactionNotifications` | `"off"` \| `"own"` \| `"all"` \| `"allowlist"` | Which reactions trigger notifications |
| `reactionAllowlist` | (string\|number)[] | User IDs whose reactions trigger notifications (when `reactionNotifications` is `"allowlist"`) |
| `reactionLevel` | `"off"` \| `"ack"` \| `"minimal"` \| `"extensive"` | Reaction response verbosity |

### Heartbeat

```json
{
  "connectors": {
    "signal": {
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

The `accounts` field allows running multiple Signal accounts from a single agent:

```json
{
  "connectors": {
    "signal": {
      "accounts": {
        "personal": {
          "account": "+1234567890",
          "httpUrl": "http://localhost:8080",
          "dmPolicy": "pairing"
        },
        "work": {
          "account": "+0987654321",
          "httpUrl": "http://localhost:8081",
          "dmPolicy": "allowlist",
          "allowFrom": ["+1111111111"]
        }
      }
    }
  }
}
```

Each account entry accepts all the same fields as the top-level `connectors.signal` configuration. Top-level fields act as defaults that individual accounts can override.

## Validation

- When `dmPolicy` is `"open"`, the `allowFrom` array must include `"*"`.
- `startupTimeoutMs` must be between 1000 and 120000 (1-120 seconds).

## Related

- [Signal plugin reference](/plugin-registry/platform/signal)
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
