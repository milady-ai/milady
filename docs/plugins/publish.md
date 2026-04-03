---
title: "Publish a Plugin"
sidebarTitle: "Publish"
description: "Package, version, publish, and submit a Milady plugin safely."
---

This guide covers the publishing path for a Milady plugin: package it correctly, publish it to npm, then submit it to the community registry.

## Naming Conventions

Choose a package name that follows one of the supported patterns:

| Scope | Pattern | Example |
|-------|---------|---------|
| Official elizaOS | `@elizaos/plugin-{name}` | `@elizaos/plugin-openai` |
| Community (scoped) | `@yourorg/plugin-{name}` | `@acme/plugin-analytics` |
| Community (unscoped) | `elizaos-plugin-{name}` | `elizaos-plugin-weather` |

The runtime recognizes all three patterns for plugin discovery.

## package.json Requirements

Your plugin package should include:

```json
{
  "name": "@elizaos/plugin-my-feature",
  "version": "1.0.0",
  "description": "One-line description of what this plugin does",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist", "elizaos.plugin.json"],
  "keywords": ["elizaos", "milady", "plugin"],
  "license": "MIT",
  "peerDependencies": {
    "@elizaos/core": "next"
  }
}
```

Key points:

- declare `@elizaos/core` as a peer dependency to avoid duplicate runtime installs
- publish `elizaos.plugin.json` alongside your compiled output
- ship ESM output

## Build and Validate

Build the plugin and preview the package before publishing:

```bash
bun run build
npm publish --dry-run --access public
```

Check that the dry run only contains the compiled output, manifest, package metadata, and user-facing docs.

## Versioning

Follow semantic versioning:

- use a patch release for bug fixes
- use a minor release for new backward-compatible features
- use a major release for breaking changes

If you target the elizaOS `next` line, prefer prerelease tags such as `1.0.1-next.0`.

## Publish to npm

```bash
npm login
npm publish --access public
```

For prerelease versions:

```bash
npm publish --access public --tag next
```

## Coverage and Quality

Standalone plugins can aim higher, but the monorepo’s enforced floor remains 25% lines/functions/statements, 15% branches. Keep plugin tests deterministic and make sure CI exercises both typecheck and runtime behavior before publishing.

## Community Registry

After publishing to npm, open a PR to the community registry and include:

1. the package name
2. the source repository
3. a short description of the plugin
4. any required setup or credential notes
