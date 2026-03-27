---
title: "Google Antigravity Plugin"
sidebarTitle: "Google Antigravity"
description: "Google Cloud AI model provider for Milady — access Google Cloud AI Platform models via the Antigravity integration."
---

The Google Antigravity plugin connects Milady agents to Google Cloud AI Platform, providing access to Google's cloud-hosted AI models through the Google Cloud API.

**Package:** `@elizaos/plugin-google-antigravity`

## Installation

```bash
milady plugins install google-antigravity
```

## Auto-Enable

The plugin auto-enables when `GOOGLE_CLOUD_API_KEY` is present:

```bash
export GOOGLE_CLOUD_API_KEY=your-google-cloud-api-key
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `GOOGLE_CLOUD_API_KEY` | Yes | Google Cloud API key with AI Platform access |

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "google-antigravity"
      }
    }
  }
}
```

## Features

- Google Cloud AI Platform model access
- Streaming responses
- Tool use / function calling

## Related

- [Google Gemini Plugin](/plugin-registry/llm/google-genai) — Google AI Studio / Gemini models
- [OpenAI Plugin](/plugin-registry/llm/openai) — GPT-4o models
- [Model Providers](/runtime/models) — Compare all providers
