---
title: "xAI Plugin"
sidebarTitle: "xAI (Grok)"
description: "xAI model provider for Milady — access Grok models for inference."
---

The xAI plugin connects Milady agents to xAI's Grok models.

**Package:** `@elizaos/plugin-xai`

## Installation

```bash
milady plugins install xai
```

## Auto-Enable

The plugin auto-enables when `XAI_API_KEY` or `GROK_API_KEY` is present:

```bash
export XAI_API_KEY=xai-...
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `XAI_API_KEY` | Yes* | xAI API key |
| `GROK_API_KEY` | Yes* | Alias for xAI API key |

\* Either variable activates the plugin.

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "xai",
        "model": "grok-3"
      }
    }
  }
}
```
