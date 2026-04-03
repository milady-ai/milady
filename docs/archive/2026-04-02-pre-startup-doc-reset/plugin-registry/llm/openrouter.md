---
title: "OpenRouter Plugin"
sidebarTitle: "OpenRouter"
description: "OpenRouter multi-provider gateway for Milady — access 200+ models from OpenAI, Anthropic, Google, Meta, and others through a single API."
---

The OpenRouter plugin connects Milady agents to OpenRouter's unified inference gateway, providing access to over 200 models from all major providers through a single API key and endpoint.

**Package:** `@elizaos/plugin-openrouter`

## Milady: pinned version and upstream bundle bug

In the Milady monorepo, **`@elizaos/plugin-openrouter` is pinned to `2.0.0-alpha.10`** (exact version in root `package.json`, reflected in `bun.lock`).

**Why pin**

- **`2.0.0-alpha.12` on npm is a bad publish:** the Node and browser ESM bundles are **truncated**. They include only rolled-up config helpers; the **main plugin object is missing**, yet the file still **exports** `openrouterPlugin` and a default alias. **Why runtime fails:** Bun (and any strict tooling) tries to load that file and errors because those bindings are **never declared** in the module.
- **Why not `^2.0.0-alpha.10`:** Semver ranges can float to **`alpha.12`**, which breaks `bun install` / lockfile refresh for everyone using OpenRouter.
- **Why we do not patch this in `patch-deps.mjs`:** Unlike a wrong export *name* in an otherwise complete file, this tarball omits the **entire implementation chunk**. A postinstall string replace cannot invent the plugin; the safe fix is **use a good version**.

**When to remove the pin**

After upstream publishes a fixed version, verify `dist/node/index.node.js` contains the full plugin (hundreds of lines, not ~80) and that `bun build …/index.node.js --target=bun` succeeds, then bump and relax the range if desired.

**Reference:** [Plugin resolution — pinned OpenRouter](/plugin-resolution-and-node-path#pinned-elizaosplugin-openrouter).

## Installation

```bash
milady plugins install openrouter
```

## Auto-Enable

The plugin auto-enables when `OPENROUTER_API_KEY` is present:

```bash
export OPENROUTER_API_KEY=sk-or-...
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key from [openrouter.ai](https://openrouter.ai) |

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "openrouter",
        "model": "anthropic/claude-sonnet-4-5"
      }
    }
  }
}
```

## Supported Models

OpenRouter provides access to models from all major providers. Use the full provider-prefixed model ID:

### OpenAI via OpenRouter

| Model ID | Description |
|---------|-------------|
| `openai/gpt-4o` | GPT-4o multimodal |
| `openai/gpt-4o-mini` | Fast and efficient |
| `openai/o1` | Reasoning model |
| `openai/o3-mini` | Fast reasoning |

### Anthropic via OpenRouter

| Model ID | Description |
|---------|-------------|
| `anthropic/claude-opus-4` | Most capable Claude |
| `anthropic/claude-sonnet-4-5` | Balanced Claude |
| `anthropic/claude-haiku-4` | Fastest Claude |

### Meta via OpenRouter

| Model ID | Description |
|---------|-------------|
| `meta-llama/llama-3.3-70b-instruct` | Llama 3.3 70B |
| `meta-llama/llama-3.1-405b-instruct` | Llama 3.1 405B |

### Google via OpenRouter

| Model ID | Description |
|---------|-------------|
| `google/gemini-2.5-pro` | Gemini 2.5 Pro |
| `google/gemini-2.5-flash` | Gemini 2.5 Flash |

Browse all models at [openrouter.ai/models](https://openrouter.ai/models).

## Model Type Mapping

| elizaOS Model Type | Default OpenRouter Model |
|-------------------|------------------------|
| `TEXT_SMALL` | `anthropic/claude-haiku-4` |
| `TEXT_LARGE` | `anthropic/claude-sonnet-4-5` |
| `TEXT_REASONING_LARGE` | `anthropic/claude-opus-4` |

## Features

- Single API key for 200+ models
- Automatic fallback to backup providers when primary is unavailable
- Cost optimization — routes to cheapest available provider
- Model comparison and A/B testing
- Usage analytics dashboard
- Streaming responses
- OpenAI-compatible API format
- Free models available (community tier)

## Provider Routing

OpenRouter supports routing preferences for cost, latency, or throughput:

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "openrouter",
        "model": "anthropic/claude-sonnet-4-5",
        "providerPreferences": {
          "order": ["Anthropic", "AWS Bedrock"],
          "allowFallbacks": true
        }
      }
    }
  }
}
```

## Free Models

OpenRouter offers free access to a selection of open-source models (rate-limited):

- `meta-llama/llama-3.2-3b-instruct:free`
- `google/gemma-2-9b-it:free`
- `mistralai/mistral-7b-instruct:free`

## Rate Limits and Pricing

Pricing is per-model and varies by provider. OpenRouter charges the same rates as the underlying provider plus a small markup on some models.

See [openrouter.ai/docs#limits](https://openrouter.ai/docs#limits) for rate limit details.

## Related

- [OpenAI Plugin](/plugin-registry/llm/openai) — Direct OpenAI integration
- [Anthropic Plugin](/plugin-registry/llm/anthropic) — Direct Anthropic integration
- [Model Providers](/runtime/models) — Compare all providers
