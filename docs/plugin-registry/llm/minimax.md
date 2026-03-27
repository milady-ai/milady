---
title: "MiniMax Plugin"
sidebarTitle: "MiniMax"
description: "MiniMax model provider for Milady — access MiniMax's language and multimodal models."
---

The MiniMax plugin connects Milady agents to MiniMax's language models, providing access to their text generation and multimodal capabilities.

**Package:** `@elizaos/plugin-minimax`

## Installation

```bash
milady plugins install minimax
```

## Configuration

MiniMax does not have an env-var auto-enable trigger. Enable it explicitly in your config:

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "minimax"
      }
    }
  },
  "plugins": {
    "allow": ["@elizaos/plugin-minimax"]
  }
}
```

## Features

- Text generation
- Multimodal capabilities
- Streaming responses

## Related

- [OpenAI Plugin](/plugin-registry/llm/openai) — GPT-4o models
- [OpenRouter Plugin](/plugin-registry/llm/openrouter) — Route between multiple providers
- [Model Providers](/runtime/models) — Compare all providers
