---
title: "Nextcloud Talk Plugin"
sidebarTitle: "Nextcloud Talk"
description: "Nextcloud Talk connector for Milady — bot integration with Nextcloud Talk chat."
---

The Nextcloud Talk plugin connects Milady agents to Nextcloud Talk, enabling message handling in Nextcloud Talk conversations.

**Package:** `@elizaos/plugin-nextcloud-talk`

## Installation

```bash
milady plugins install nextcloud-talk
```

## Setup

### 1. Configure Your Nextcloud Instance

1. Ensure Nextcloud Talk is installed and enabled on your Nextcloud instance
2. Create a bot user or use an existing account for the agent
3. Note the Nextcloud server URL and credentials

### 2. Configure Milady

```json
{
  "connectors": {
    "nextcloud-talk": {
      "enabled": true
    }
  }
}
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `connectors.nextcloud-talk` | Yes | Config block for Nextcloud Talk |
| `enabled` | No | Set `false` to disable (default: `true`) |

```json
{
  "connectors": {
    "nextcloud-talk": {
      "enabled": true
    }
  }
}
```

## Related

- [Connectors Guide](/guides/connectors) — General connector documentation
