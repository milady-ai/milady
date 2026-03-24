---
title: Farcaster Connector
sidebarTitle: Farcaster
description: Connect your agent to Farcaster using the @elizaos/plugin-farcaster package.
---

Connect your agent to the Farcaster decentralized social protocol for casting, replies, and channel participation.

## Overview

The Farcaster connector is an external elizaOS plugin that bridges your agent to the Farcaster network via the Neynar API. It is auto-enabled by the runtime when a valid API key is detected in your connector configuration.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-farcaster` |
| Config key | `connectors.farcaster` |
| Auto-enable trigger | `apiKey` is truthy in connector config |

## Minimal Configuration

In your character file:

```json
{
  "connectors": {
    "farcaster": {
      "apiKey": "YOUR_NEYNAR_API_KEY",
      "signerUuid": "YOUR_SIGNER_UUID",
      "fid": 12345
    }
  }
}
```

## Disabling

To explicitly disable the connector even when an API key is present:

```json
{
  "connectors": {
    "farcaster": {
      "apiKey": "YOUR_NEYNAR_API_KEY",
      "signerUuid": "YOUR_SIGNER_UUID",
      "fid": 12345,
      "enabled": false
    }
  }
}
```

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.farcaster` in your character config. If the `apiKey` field is truthy (and `enabled` is not explicitly `false`), the runtime automatically loads `@elizaos/plugin-farcaster`.

No environment variable is required to trigger auto-enable — it is driven entirely by the connector config object.

## Full Configuration Reference

All fields are defined under `connectors.farcaster` in your character file.

### Core Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `apiKey` | string | — | Neynar API key (required) |
| `signerUuid` | string | — | Neynar signer UUID for the agent account (required) |
| `fid` | number | — | Farcaster ID of the agent account (required) |
| `enabled` | boolean | — | Explicitly enable/disable |
| `channels` | string[] | — | Farcaster channel names to monitor and participate in |
| `pollInterval` | number | `60` | Seconds between mention checks |

### Autonomous Casting

The agent can post casts autonomously at random intervals. The LLM generates cast content based on the character's personality and current context.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `castIntervalMin` | number | `120` | Minimum minutes between autonomous casts |
| `castIntervalMax` | number | `240` | Maximum minutes between autonomous casts |

```json
{
  "connectors": {
    "farcaster": {
      "apiKey": "...",
      "signerUuid": "...",
      "fid": 12345,
      "channels": ["ai", "agents"],
      "castIntervalMin": 90,
      "castIntervalMax": 180
    }
  }
}
```

### Cast Limits

Casts are limited to 320 characters. Longer responses are automatically split into cast threads.

### DM Policy

Farcaster supports direct casts (private messages via Warpcast). The connector handles incoming direct casts as DM conversations.

## Features

- **Autonomous casting** — Posts in the agent's voice at configurable intervals
- **Replies** — Responds to @mentions and replies to the agent's casts
- **Reactions** — Likes and recasts
- **Channel monitoring** — Participates in Farcaster channels
- **Direct casts** — Private DM-like messages (Warpcast feature)
- **On-chain identity** — Agent identity is tied to an Ethereum address
- **Thread splitting** — Messages over 320 characters are split into cast threads

## Multi-Account Support

Farcaster does not support multi-account configuration. Each agent runs a single Farcaster account.

## Related

- [Farcaster plugin reference](/plugin-registry/platform/farcaster)
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
