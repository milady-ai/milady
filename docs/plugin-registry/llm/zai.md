---
title: "Zai Plugin"
sidebarTitle: "Zai"
description: "Zai model provider for Milady — access Homunculus Labs' Zai language models."
---

The Zai plugin connects Milady agents to Homunculus Labs' Zai models.

**Package:** `@homunculuslabs/plugin-zai`

## Installation

```bash
milady plugins install zai
```

## Auto-Enable

The plugin auto-enables when `ZAI_API_KEY` is present:

```bash
export ZAI_API_KEY=your-zai-api-key
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `ZAI_API_KEY` | Yes | Zai API key from Homunculus Labs |

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "zai"
      }
    }
  }
}
```

## Features

- Text generation
- Streaming responses

## Related

- [OpenAI Plugin](/plugin-registry/llm/openai) — GPT-4o models
- [OpenRouter Plugin](/plugin-registry/llm/openrouter) — Route between multiple providers
- [Model Providers](/runtime/models) — Compare all providers
