---
title: "Webhooks Plugin"
sidebarTitle: "Webhooks"
description: "Webhooks plugin for Milady — receive and process incoming webhook events from external services."
---

The Webhooks plugin enables Milady agents to receive and process incoming webhook events from external services, allowing integrations with any platform that supports webhook callbacks.

**Package:** `@elizaos/plugin-webhooks`

## Installation

```bash
milady plugins install webhooks
```

## Enable via Features

```json
{
  "features": {
    "webhooks": true
  }
}
```

## Features

- Receive inbound webhook events
- Process and route webhook payloads to agent actions
- Integrates with external services via HTTP callbacks

## Related

- [Triggers Guide](/guides/triggers) — Event-driven agent behaviors
- [Cron Plugin](/plugin-registry/cron) — Scheduled task execution
