---
title: "milady doctor"
sidebarTitle: "doctor"
description: "Run diagnostics to verify your Milady installation health."
---

The `doctor` command runs a suite of diagnostic checks to verify that your Milady installation is healthy and properly configured. It inspects the runtime environment, configuration, storage, and network, then prints a structured report with pass/fail indicators and suggested fixes.

## Usage

```bash
milady doctor [options]
```

## Options

| Flag | Description |
|------|-------------|
| `--no-ports` | Skip port availability checks |
| `--fix` | Automatically fix issues where possible |
| `--json` | Output results as JSON (CI-friendly) |

## Example Output

```
  Eliza Health Check

  System
  ✓ Runtime              Node.js v22.12.0
  ✓ node_modules         /path/to/milady/node_modules
  ✓ Build artifacts      /path/to/milady/dist
  ⚠ Eliza workspace      Not found at ../eliza (optional)

  Configuration
  ✓ Config file          /home/user/.milady/milady.json
  ✓ Model API key        ANTHROPIC_API_KEY set (Anthropic (Claude))
  ✓ Host binding         Loopback only (default)

  Storage
  ✓ State directory      /home/user/.milady
  ✓ Database             /home/user/.milady/workspace/.eliza/.elizadb
  ✓ Disk space           45.2 GB free

  Network
  ✓ Port 31337           Available
  ✓ Port 2138            Available

  Everything looks good. Ready to run milady start.
```

## Diagnostic Checks

### System

| Check | Pass Condition |
|-------|---------------|
| Runtime | Node.js >= 22 or Bun >= 1.0 |
| node_modules | `node_modules` directory exists in the project root |
| Build artifacts | `dist/entry.js` exists (warn if running from source) |
| Eliza workspace | Optional `../eliza` checkout for local @elizaos development |

### Configuration

| Check | Pass Condition |
|-------|---------------|
| Config file | `milady.json` exists and is valid JSON |
| Model API key | At least one model provider API key is set |
| Host binding | Non-loopback binds have an explicit API token |

### Storage

| Check | Pass Condition |
|-------|---------------|
| State directory | State directory exists and is writable |
| Database | PGLite database directory exists |
| Disk space | At least 1 GB free on the state volume |

### Network

| Check | Pass Condition |
|-------|---------------|
| Port 31337 | API port is available |
| Port 2138 | UI port is available |

Port checks can be skipped with `--no-ports`.

## Auto-Fix

The `--fix` flag attempts to automatically remediate fixable issues:

```bash
milady doctor --fix
```

Auto-fixable checks include:
- **Missing config file** -- runs `milady setup`
- **No model API key** -- runs `milady setup` to launch the provider wizard

Only safe sub-commands are auto-run. Manual fixes (e.g., file permissions) are shown but not executed automatically.

## JSON Output

For CI pipelines, use `--json` for machine-readable output:

```bash
milady doctor --json
```

Returns a JSON object with `summary` (pass/warn/fail/skip counts) and `checks` (detailed results array). Exits with code 1 if any checks fail.

## Related

- [milady setup](/cli/setup) -- initialize the workspace
- [milady config](/cli/config) -- inspect configuration values
- [milady models](/cli/models) -- verify model provider key configuration
- [Environment Variables](/cli/environment) -- all environment variables that affect diagnostics
