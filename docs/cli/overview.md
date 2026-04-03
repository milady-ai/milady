---
title: CLI Overview
sidebarTitle: Overview
description: The Milady CLI is the primary interface for managing agents, plugins, configuration, and deployment from the terminal.
---

The `milady` CLI is the primary interface for managing the Milady AI agent. Every command is registered through the Commander.js framework and supports `--help` for inline documentation.

## Installation

```bash
bun install -g miladyai
```

Or run directly:

```bash
bunx miladyai
```

## Global Flags

| Flag | Description |
|------|-------------|
| `--help`, `-h` | Show help for any command |
| `-v, --version` | Print version number |
| `--profile <name>` | Use a named configuration profile (state dir becomes `~/.milady-<name>/`) |
| `--dev` | Shorthand for `--profile dev` (also sets the gateway port to `19001`) |
| `--verbose` | Enable informational runtime logs |
| `--debug` | Enable debug-level runtime logs |
| `--connection-key [key]` | Set or auto-generate a connection key for remote access |
| `--no-color` | Disable ANSI colors |

## Commands

<CardGroup cols={2}>

<Card title="start" icon="play" href="/cli/start">
  Start the elizaOS agent runtime.
</Card>



<Card title="setup" icon="gear" href="/cli/setup">
  Initialize the config file and bootstrap the agent workspace directory.
</Card>

<Card title="configure" icon="sliders" href="/cli/configure">
  Display configuration guidance and common environment variables.
</Card>

<Card title="config" icon="file-code" href="/cli/config">
  Read and inspect configuration values with get, path, and show subcommands.
</Card>

<Card title="run" icon="play" href="/cli/start">
  Alias for `start` — start the agent runtime.
</Card>

<Card title="dashboard" icon="gauge" href="/cli/dashboard">
  Open the Control UI in your default web browser.
</Card>

<Card title="models" icon="brain" href="/cli/models">
  Show configured model providers by checking environment variables.
</Card>

<Card title="plugins" icon="plug" href="/cli/plugins">
  Browse, search, install, and manage elizaOS plugins. Subcommands: `install`, `list`, `uninstall`, `search`, `info`, `installed`, `refresh`, `test`, `add-path`, `paths`, `config`, `open`.
</Card>

<Card title="update" icon="arrow-up" href="/cli/update">
  Check for and install updates with release channel support (stable, beta, nightly).
</Card>

<Card title="db" icon="database" href="/cli/db">
  Manage the local database — reset agent state and conversation history.
</Card>

<Card title="doctor" icon="stethoscope" href="/cli/doctor">
  Check environment health and diagnose common issues.
</Card>

</CardGroup>

## Quick Reference

```bash
# Start the agent
milady

# Start agent in headless server mode (alias: milady run)
milady start

# Run setup
milady setup

# Install a plugin
milady plugins install twitter

# List installed plugins
milady plugins installed

# Search the plugin registry
milady plugins search twitter

# Check for updates
milady update

# Show model provider status
milady models

# Reset local database
milady db reset

# Run health checks
milady doctor
```

## Environment Variables

See [Environment Reference](/cli/environment) for a complete list of environment variables that affect CLI behavior.

## Related

- [Installation](/installation) — Install Milady
- [Quickstart](/quickstart) — Get started in minutes
- [Configuration](/configuration) — Configuration file reference
