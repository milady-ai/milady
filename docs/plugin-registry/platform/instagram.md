---
title: "Instagram Plugin"
sidebarTitle: "Instagram"
description: "Instagram connector for Milady — interact with Instagram messaging and content."
---

The Instagram plugin connects Milady agents to Instagram, enabling message handling and content interactions.

**Package:** `@elizaos/plugin-instagram`

## Installation

```bash
milady plugins install instagram
```

## Setup

### 1. Get Your Instagram Credentials

1. Use your Instagram account username and password
2. For automation, consider creating a dedicated account for your agent

### 2. Configure Milady

```json
{
  "connectors": {
    "instagram": {
      "username": "YOUR_USERNAME",
      "password": "YOUR_PASSWORD"
    }
  }
}
```

Or via environment variables:

```bash
export INSTAGRAM_USERNAME=YOUR_USERNAME
export INSTAGRAM_PASSWORD=YOUR_PASSWORD
```

## Auto-Enable

Instagram does **not** auto-enable based on configuration. You must explicitly install and allow the plugin:

```bash
milady plugins install instagram
```

Then add `"instagram"` to your `plugins.allow` list in `milady.json`.

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `username` | Yes | Instagram account username |
| `password` | Yes | Instagram account password |
| `enabled` | No | Set `false` to disable (default: `true`) |

## Environment Variables

```bash
export INSTAGRAM_USERNAME=YOUR_USERNAME
export INSTAGRAM_PASSWORD=YOUR_PASSWORD
```

## Related

- [Connectors Guide](/guides/connectors) — General connector documentation
