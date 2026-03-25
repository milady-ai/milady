---
title: "milady doctor"
sidebarTitle: "doctor"
description: "Run diagnostics to verify your Milady installation and configuration."
---

The `doctor` command runs a suite of diagnostic checks to verify that your Milady installation is healthy and properly configured. It inspects the runtime environment, configuration, API key availability, storage, and network connectivity, then prints a structured report with pass/fail indicators and suggested fixes.

## Usage

```bash
milady doctor [options]
```

## Options

| Flag | Description |
|------|-------------|
| `--fix` | Automatically fix issues where possible (runs safe `milady` sub-commands) |
| `--no-ports` | Skip port availability checks |
| `--json` | Output results as JSON (CI-friendly) |

## Examples

```bash
# Run all diagnostics
milady doctor

# Auto-fix what can be fixed
milady doctor --fix

# CI-friendly JSON output
milady doctor --json

# Skip network port checks
milady doctor --no-ports
```

## Diagnostic Checks

Checks are organized into four categories:

### System

| Check | Pass Condition |
|-------|---------------|
| Runtime | Node.js >= 22 or Bun >= 1.0 detected |
| CLI version | Installed version is current on the active channel |

### Configuration

| Check | Pass Condition |
|-------|---------------|
| Config file | `~/.milady/milady.json` exists and is valid JSON |
| Workspace directory | Workspace directory exists and is writable |
| Model provider | At least one model provider API key is configured |

The model provider check scans for all recognized API keys:

| Key | Alias | Provider |
|-----|-------|----------|
| `ANTHROPIC_API_KEY` | `CLAUDE_API_KEY` | Anthropic (Claude) |
| `OPENAI_API_KEY` | — | OpenAI |
| `GOOGLE_API_KEY` | `GOOGLE_GENERATIVE_AI_API_KEY` | Google (Gemini) |
| `GROQ_API_KEY` | — | Groq |
| `XAI_API_KEY` | `GROK_API_KEY` | xAI (Grok) |
| `OPENROUTER_API_KEY` | — | OpenRouter |
| `DEEPSEEK_API_KEY` | — | DeepSeek |
| `TOGETHER_API_KEY` | — | Together AI |
| `MISTRAL_API_KEY` | — | Mistral |
| `COHERE_API_KEY` | — | Cohere |
| `PERPLEXITY_API_KEY` | — | Perplexity |
| `ZAI_API_KEY` | `Z_AI_API_KEY` | Zai |
| `AI_GATEWAY_API_KEY` | `AIGATEWAY_API_KEY` | Vercel AI Gateway |
| `ELIZAOS_CLOUD_API_KEY` | — | elizaOS Cloud |
| `OLLAMA_BASE_URL` | — | Ollama (local) |

### Storage

| Check | Pass Condition |
|-------|---------------|
| State directory writable | `~/.milady/` can be written to |
| Disk space | Sufficient free space on the state directory volume |

### Network

| Check | Pass Condition |
|-------|---------------|
| API port | Port 2138 (or `MILADY_PORT`) is available for binding |
| Gateway port | Port 18789 (or `MILADY_GATEWAY_PORT`) is available for binding |

Network port checks can be skipped with `--no-ports`.

## Auto-Fix (`--fix`)

When `--fix` is passed, the doctor attempts to auto-remediate issues that have an `autoFixable` flag. Only safe `milady` sub-commands are executed automatically (e.g., `milady setup`). Manual fix suggestions (like `chmod` commands) are displayed but not executed.

## JSON Output

The `--json` flag outputs a machine-readable report for CI pipelines:

```json
{
  "summary": {
    "pass": 6,
    "warn": 1,
    "fail": 0,
    "skip": 0
  },
  "checks": [
    {
      "label": "Runtime",
      "status": "pass",
      "category": "system",
      "detail": "Node.js v22.x.x"
    }
  ]
}
```

The process exits with code 1 if any check fails.

## Related

- [milady setup](/cli/setup) -- initialize the workspace
- [milady config](/cli/config) -- inspect configuration values
- [milady models](/cli/models) -- verify model provider key configuration
- [milady plugins test](/cli/plugins) -- validate custom drop-in plugins
- [Environment Variables](/cli/environment) -- all environment variables that affect diagnostics
