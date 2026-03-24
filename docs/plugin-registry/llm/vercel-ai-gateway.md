---
title: "Vercel AI Gateway Plugin"
sidebarTitle: "Vercel AI Gateway"
description: "Vercel AI Gateway provider for Milady — unified multi-provider access via Vercel's AI SDK."
---

The Vercel AI Gateway plugin connects Milady agents to Vercel's AI Gateway, providing unified access to multiple model providers through a single endpoint.

**Package:** `@elizaos/plugin-vercel-ai-gateway`

## Installation

```bash
milady plugins install vercel-ai-gateway
```

## Auto-Enable

The plugin auto-enables when `AI_GATEWAY_API_KEY` or `AIGATEWAY_API_KEY` is present:

```bash
export AI_GATEWAY_API_KEY=your-gateway-key
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `AI_GATEWAY_API_KEY` | Yes* | Vercel AI Gateway API key |
| `AIGATEWAY_API_KEY` | Yes* | Alias for the gateway API key |

\* Either variable activates the plugin.

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "vercel-ai-gateway"
      }
    }
  }
}
```
