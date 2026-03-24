---
title: Nostr Connector
sidebarTitle: Nostr
description: Connect your agent to the Nostr network using the @elizaos/plugin-nostr package.
---

Connect your agent to Nostr for relay-based social posting and conversations.

## Overview

The Nostr connector is an external elizaOS plugin that bridges your agent to the Nostr protocol. It connects to relays, publishes notes, and handles direct messages. It is auto-enabled when a private key is configured.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-nostr` |
| Config key | `connectors.nostr` |
| Auto-enable trigger | `NOSTR_PRIVATE_KEY` is set and `NOSTR_ENABLED` is not `false` |

## Minimal Configuration

```json
{
  "env": {
    "NOSTR_PRIVATE_KEY": "nsec1your_private_key_here"
  },
  "connectors": {
    "nostr": {
      "enabled": true
    }
  }
}
```

## Disabling

```json
{
  "connectors": {
    "nostr": {
      "enabled": false
    }
  }
}
```

Or set the environment variable:

```bash
NOSTR_ENABLED=false
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NOSTR_PRIVATE_KEY` | Yes | Private key (nsec or hex format) for signing events |
| `NOSTR_RELAYS` | No | Comma-separated list of relay URLs (e.g., `wss://relay.damus.io,wss://nos.lol`) |
| `NOSTR_DM_POLICY` | No | DM policy: `allow`, `deny`, or `allowlist` |
| `NOSTR_ALLOW_FROM` | No | Comma-separated list of allowed npub/hex public keys for DM allowlist |
| `NOSTR_ENABLED` | No | Explicitly enable or disable the connector (`true`/`false`) |

## Setup

1. Generate a Nostr keypair if you don't have one (many Nostr clients can do this, or use tools like `nip06`).
2. Add the private key to your Milady config under `env.NOSTR_PRIVATE_KEY`.
3. Optionally configure relay URLs. If none are specified, the plugin uses sensible defaults.
4. Start Milady — the plugin connects to relays and begins listening for messages.

## Features

- **Relay connectivity** — Connect to multiple Nostr relays simultaneously
- **Note publishing** — Post notes (kind 1 events) to the network
- **Direct messages** — Handle NIP-04 encrypted direct messages
- **DM policies** — Control who can send DMs with allow/deny/allowlist modes
- **Decentralized** — No central server; the agent communicates via the Nostr relay network

## Related

- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
