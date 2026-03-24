---
title: "Cohere Plugin"
sidebarTitle: "Cohere"
description: "Cohere model provider for Milady."
---

The Cohere plugin connects Milady agents to Cohere's language models.

**Package:** `@elizaos/plugin-cohere`

## Installation

```bash
milady plugins install cohere
```

## Auto-Enable

The plugin auto-enables when `COHERE_API_KEY` is present:

```bash
export COHERE_API_KEY=your-cohere-api-key
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `COHERE_API_KEY` | Yes | Cohere API key from [cohere.com](https://cohere.com) |

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "cohere",
        "model": "command-r-plus"
      }
    }
  }
}
```
