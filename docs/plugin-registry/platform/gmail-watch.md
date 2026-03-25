---
title: "Gmail Watch Plugin"
sidebarTitle: "Gmail Watch"
description: "Gmail Watch connector for Milady — monitor Gmail inboxes and respond to incoming emails."
---

The Gmail Watch plugin connects Milady agents to Gmail, enabling monitoring of incoming emails and automated responses.

**Package:** `@elizaos/plugin-gmail-watch`

## Installation

```bash
milady plugins install gmail-watch
```

## Setup

### 1. Enable the Feature Flag

The Gmail Watch plugin is activated via the `features.gmailWatch` flag in your Milady configuration:

```json
{
  "features": {
    "gmailWatch": true
  }
}
```

### 2. Configure Gmail API Access

Follow the Google Cloud Console setup to enable the Gmail API and obtain OAuth credentials for your agent.

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `features.gmailWatch` | Yes | Set `true` to enable the Gmail Watch plugin |

```json
{
  "features": {
    "gmailWatch": true
  }
}
```

## Related

- [Connectors Guide](/guides/connectors) — General connector documentation
