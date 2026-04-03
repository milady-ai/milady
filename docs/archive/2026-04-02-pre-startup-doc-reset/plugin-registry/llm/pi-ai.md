---
title: "Pi AI Plugin"
sidebarTitle: "Pi AI"
description: "Pi AI model provider for Milady — access Inflection AI's Pi conversational models."
---

The Pi AI plugin connects Milady agents to Inflection AI's Pi models, known for their empathetic and conversational capabilities.

**Package:** `@elizaos/plugin-pi-ai`

## Installation

```bash
milady plugins install pi-ai
```

## Auto-Enable

The plugin auto-enables when `ELIZA_USE_PI_AI` is set:

```bash
export ELIZA_USE_PI_AI=1
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `ELIZA_USE_PI_AI` | Yes | Set to `1` to enable the Pi AI provider |

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "pi-ai"
      }
    }
  }
}
```

## Features

- Conversational AI optimized for empathetic interactions
- Streaming responses

## Related

- [Anthropic Plugin](/plugin-registry/llm/anthropic) — Claude models
- [OpenAI Plugin](/plugin-registry/llm/openai) — GPT-4o models
- [Model Providers](/runtime/models) — Compare all providers
