---
title: "milady setup"
sidebarTitle: "setup"
description: "Initialize the Milady config file and agent workspace."
---

Initialize the Milady configuration file (`~/.milady/milady.json`) and bootstrap the agent workspace directory with required scaffold files. Run this command once before starting the agent for the first time, or to repair a missing or incomplete workspace.

## Usage

```bash
milady setup [options]
```

## Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--workspace <dir>` | string | (from config or `~/.milady/workspace/`) | Custom agent workspace directory to create or verify |
| `--provider <name>` | string | (none) | Model provider name for non-interactive setup (e.g., `anthropic`, `openai`, `google`, `groq`, `xai`, `openrouter`, `mistral`, `ollama`) |
| `--key <value>` | string | (none) | API key or URL for the provider. **Warning:** the key will appear in shell history — prefer `--key-stdin` for security. |
| `--key-stdin` | boolean | false | Read the API key or URL from stdin instead of passing it as an argument |
| `--no-wizard` | boolean | false | Skip the interactive model provider wizard |

Global flags:

| Flag | Description |
|------|-------------|
| `-v, --version` | Print the current Milady version and exit |
| `--help`, `-h` | Show help for this command |
| `--profile <name>` | Use a named configuration profile (state dir becomes `~/.milady-<name>/`) |
| `--dev` | Shorthand for `--profile dev` (also sets the gateway port to `19001`) |
| `--verbose` | Enable informational runtime logs |
| `--debug` | Enable debug-level runtime logs |
| `--no-color` | Disable ANSI colors |

## Examples

```bash
# Run default setup with interactive model provider wizard
milady setup

# Initialize with a custom workspace directory
milady setup --workspace ~/my-agent-workspace

# Setup for a named profile
milady --profile staging setup

# Non-interactive setup with a specific provider and key
milady setup --provider anthropic --key sk-ant-...

# Secure setup reading the key from stdin (no shell history exposure)
echo "sk-ant-..." | milady setup --provider anthropic --key-stdin

# Skip the model provider wizard entirely
milady setup --no-wizard

# Setup with an absolute path
milady setup --workspace /srv/milady/workspace
```

## Behavior

`milady setup` performs the following steps in order:

1. **Model provider wizard** -- when running interactively (TTY) and no `--provider` flag is given, an interactive wizard prompts you to choose a model provider and enter an API key. Supported providers: Anthropic (Claude), OpenAI (GPT), Google (Gemini), Groq, xAI (Grok), OpenRouter, Mistral, and Ollama (local, no key needed). The chosen key is saved to `milady.json` under the `env` section. Skip with `--no-wizard`.

2. **Load existing config** -- attempts to read `~/.milady/milady.json`. If the file does not exist (ENOENT), setup continues with default values. Any other error is re-thrown.

3. **Resolve workspace directory** -- the workspace path is resolved using this priority order:
   - `--workspace <dir>` flag (highest priority)
   - `agents.defaults.workspace` value from the loaded config
   - Built-in default (`~/.milady/workspace/`)

4. **Ensure the workspace** -- creates the workspace directory if it does not exist and writes all required bootstrap files (character definition, default settings, etc.). This step is idempotent -- running setup on an existing workspace is safe.

5. **Health check summary** -- when running interactively, a diagnostic health check summary is displayed (same checks as `milady doctor --no-ports`), showing pass/fail status for system, configuration, storage, and network checks.

6. **Report success** -- prints the resolved workspace path, the health check summary, and a suggested launch command.

## Output

```
→ No config found, using defaults
? Choose a model provider: Anthropic (Claude)
? Enter your API key: ●●●●●●●●
✓ Saved ANTHROPIC_API_KEY to config
✓ Agent workspace ready: /Users/you/.milady/workspace

System
  ✓ Runtime version
  ✓ node_modules
Configuration
  ✓ Config file
  ✓ Model provider keys
Storage
  ✓ Disk space
  ✓ Permissions

Setup complete. Run: milady start
```

If a config file exists and the wizard is skipped:

```
✓ Config loaded
✓ Agent workspace ready: /Users/you/.milady/workspace
Setup complete.
```

## Configuration File Location

The config file path is resolved from environment variables:

| Variable | Effect |
|----------|--------|
| `MILADY_CONFIG_PATH` | Use this exact path for the config file |
| `MILADY_STATE_DIR` | Look for `milady.json` inside this directory |

If neither is set, the default is `~/.milady/milady.json`.

## What the Workspace Contains

The agent workspace is the directory where Milady stores:

- Character definition files
- Memory databases
- Session state
- Plugin data

Bootstrap files are only written on first setup or if they are missing. Existing files are not overwritten.

## Related

- [milady start](/cli/start) -- start the agent runtime after setup
- [milady configure](/cli/configure) -- view configuration guidance
- [milady config](/cli/config) -- read and inspect config values
- [Environment Variables](/cli/environment) -- all environment variables
