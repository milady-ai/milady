---
title: "Perplexity Plugin"
sidebarTitle: "Perplexity"
description: "Perplexity model provider for Milady — search-augmented language models."
---

The Perplexity plugin connects Milady agents to Perplexity's search-augmented language models.

**Package:** `@elizaos/plugin-perplexity`

## Installation

```bash
milady plugins install perplexity
```

## Auto-Enable

The plugin auto-enables when `PERPLEXITY_API_KEY` is present:

```bash
export PERPLEXITY_API_KEY=pplx-...
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `PERPLEXITY_API_KEY` | Yes | Perplexity API key from [perplexity.ai](https://perplexity.ai) |

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "perplexity",
        "model": "llama-3.1-sonar-large-128k-online"
      }
    }
  }
}
```
