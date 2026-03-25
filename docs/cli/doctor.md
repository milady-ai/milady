---
title: "milady doctor"
sidebarTitle: "doctor"
description: "Run diagnostics to verify your Milady installation and environment health."
---

The `doctor` command runs a suite of diagnostic checks to verify that your Milady installation is healthy and properly configured. It inspects the runtime environment, configuration, storage, and network, then prints a structured report with pass/fail indicators and suggested fixes.

## Usage

```bash
milady doctor [options]
```

## Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--no-ports` | boolean | true | Skip port availability checks |
| `--fix` | boolean | false | Automatically fix issues where possible |
| `--json` | boolean | false | Output results as JSON (CI-friendly) |

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
# Run all diagnostic checks
milady doctor

# Include port availability checks
milady doctor --ports

# Automatically fix issues where possible
milady doctor --fix

# Output structured JSON (for CI pipelines)
milady doctor --json
```

## Diagnostic Categories

Checks are grouped into four categories:

### System

| Check | Pass Condition |
|-------|---------------|
| Runtime version | Node.js / Bun meets minimum version requirement |
| `node_modules` | Dependencies are installed and accessible |

### Configuration

| Check | Pass Condition |
|-------|---------------|
| Config file | `~/.milady/milady.json` exists and is valid JSON |
| Environment variables | Required variables are set |
| Model provider keys | At least one model provider API key is configured |

### Storage

| Check | Pass Condition |
|-------|---------------|
| Disk space | Sufficient disk space available |
| Permissions | State directory is writable |

### Network

| Check | Pass Condition |
|-------|---------------|
| Port availability | Required ports (API, UI) are free. Skipped with `--no-ports`. |

## Output

Each check displays a status icon:

| Icon | Status | Meaning |
|------|--------|---------|
| `✓` | pass | Check passed |
| `✗` | fail | Check failed — action needed |
| `⚠` | warn | Warning — may cause issues |
| `–` | skip | Check was skipped |

Failed and warned checks include a suggested fix below the status line.

### Standard Output

```
System
  ✓ Runtime version
  ✓ node_modules

Configuration
  ✓ Config file
  ✗ Model provider keys
    → Set at least one model provider API key (e.g. ANTHROPIC_API_KEY)

Storage
  ✓ Disk space
  ✓ Permissions
```

### JSON Output

With `--json`, the output is a structured JSON object suitable for CI pipelines:

```json
{
  "summary": {
    "pass": 5,
    "fail": 1,
    "warn": 0,
    "skip": 0
  },
  "checks": [
    {
      "category": "Configuration",
      "name": "Model provider keys",
      "status": "fail",
      "fix": "Set at least one model provider API key"
    }
  ]
}
```

The exit code is `1` if any checks fail, `0` otherwise.

## Auto-Fix

With `--fix`, the doctor command automatically executes safe, predefined fixes for issues it can resolve. Only fixes prefixed with the runtime's own command namespace are executed — arbitrary shell commands are not run.

## Related

- [milady setup](/cli/setup) -- initialize the workspace
- [milady config](/cli/config) -- inspect configuration values
- [milady models](/cli/models) -- verify model provider key configuration
- [milady plugins test](/cli/plugins) -- validate custom drop-in plugins
- [Environment Variables](/cli/environment) -- all environment variables that affect diagnostics
