---
title: "Plugin Resolution And NODE_PATH"
sidebarTitle: "Plugin Resolution"
description: "Why Milady still sets NODE_PATH in multiple runtime entry points and keeps the Bun exports patch."
---

Milady still relies on `NODE_PATH` in a few specific places because dynamic plugin imports can otherwise fail when the runtime entrypoint is not rooted at the repo-level `node_modules`.

## Keep These Guards

- `packages/agent/src/runtime/eliza.ts`
- `scripts/run-node.mjs`
- `apps/app/electrobun/src/native/agent.ts`

## Why

- dynamic `@elizaos/plugin-*` imports must resolve in CLI, desktop dev, and packaged desktop flows
- some published packages still need the Bun exports patch so Bun resolves `dist/` instead of missing `src/` files

Do not remove these path-resolution guards as cleanup unless the package-loading model changes end to end.
