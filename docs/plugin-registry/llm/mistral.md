---
title: "Mistral Plugin"
sidebarTitle: "Mistral"
description: "Mistral AI model provider for Milady."
---

The Mistral plugin connects Milady agents to Mistral AI models.

**Package:** `@elizaos/plugin-mistral`

## Installation

```bash
milady plugins install mistral
```

## Auto-Enable

The plugin auto-enables when `MISTRAL_API_KEY` is present:

```bash
export MISTRAL_API_KEY=your-mistral-api-key
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `MISTRAL_API_KEY` | Yes | Mistral AI API key from [mistral.ai](https://mistral.ai) |

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "mistral",
        "model": "mistral-large-latest"
      }
    }
  }
}
```
