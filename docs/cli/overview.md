---
title: "CLI Overview"
sidebarTitle: "CLI Overview"
description: "The Milady CLI installs from miladyai and remains the main terminal interface for setup, runtime, and plugin management."
---

The `milady` CLI is the terminal entry point for bootstrapping, running, and inspecting Milady.

## Install

The published npm package name is `miladyai`.

```bash
bun install -g miladyai
```

Or run it directly:

```bash
bunx miladyai
```

## Core commands

- `milady`
- `milady start`
- `milady setup`
- `milady configure`
- `milady models`
- `milady plugins install <name>`
- `milady plugins uninstall <name>`

## Current docs direction

The CLI still matters, but the product docs now begin from the first app experience: choosing a server, then choosing a provider for that server.

Use these pages next:

- [Installation](/installation)
- [Quickstart](/quickstart)
- [Configuration](/configuration)
