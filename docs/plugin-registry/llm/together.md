---
title: "Together AI Plugin"
sidebarTitle: "Together AI"
description: "Together AI model provider for Milady — access open-source models via Together's inference platform."
---

The Together AI plugin connects Milady agents to Together's inference platform, providing access to a wide range of open-source models.

**Package:** `@elizaos/plugin-together`

## Installation

```bash
milady plugins install together
```

## Auto-Enable

The plugin auto-enables when `TOGETHER_API_KEY` is present:

```bash
export TOGETHER_API_KEY=your-together-api-key
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `TOGETHER_API_KEY` | Yes | Together AI API key from [together.ai](https://together.ai) |

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "together",
        "model": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo"
      }
    }
  }
}
```
