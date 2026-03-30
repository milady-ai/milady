---
title: "xAI Plugin"
sidebarTitle: "xAI (Grok)"
description: "xAI model provider for Milady — access Grok models for real-time knowledge, reasoning, and conversational AI."
---

The xAI plugin connects Milady agents to xAI's Grok models, providing access to models with real-time knowledge and strong reasoning capabilities.

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
| `XAI_API_KEY` | Yes* | xAI API key from [console.x.ai](https://console.x.ai) |
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

## Supported Models

| Model | Context | Best For |
|-------|---------|---------|
| `grok-3` | 131k | Most capable, complex reasoning |
| `grok-3-mini` | 131k | Fast reasoning with thinking mode |
| `grok-2` | 131k | General-purpose |
| `grok-2-vision` | 32k | Image understanding |

## Features

- Streaming responses
- Tool use / function calling
- Vision input (Grok 2 Vision)
- Real-time knowledge from X/Twitter
- Compatible with OpenAI SDK format
- Structured JSON output

## Related

- [OpenAI Plugin](/plugin-registry/llm/openai) — GPT-4o models
- [OpenRouter Plugin](/plugin-registry/llm/openrouter) — Route between xAI and other providers
- [Model Providers](/runtime/models) — Compare all providers
