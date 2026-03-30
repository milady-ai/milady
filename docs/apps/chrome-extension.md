---
title: Chrome Extension
sidebarTitle: Chrome Extension
description: Release-status and architecture notes for the Milady Browser Relay extension.
---

<Warning>
Release `v2.0.0-alpha.125` does not ship an in-repo Chrome extension app, and the Browser Relay extension is not part of the shipped release surface for this repository checkout.
</Warning>

## Release status

The **Milady Browser Relay** remains a planned or separately distributed extension. This repository does not contain the extension source, an unpacked extension directory, or a supported in-repo installation path for release `v2.0.0-alpha.125`.

Use this page as the single source of truth for that status:

- There is no in-repo Chrome extension directory in this release checkout.
- The Dashboard may still report relay status fields when a compatible extension is installed separately.
- If you need browser automation from the shipped release today, prefer the `@elizaos/plugin-browser` plugin and its Stagehand-based flow.

## What this page still documents

The Browser Relay concept is still useful context because other runtime surfaces reference it. When separately distributed, the extension is intended to:

- Bridge browser tabs to the Milady agent runtime over a local WebSocket relay.
- Attach Chrome DevTools Protocol sessions to tabs for navigation, DOM inspection, screenshots, and scripted interaction.
- Surface relay reachability and extension-path diagnostics inside the Dashboard and REST diagnostics APIs.

## Current recommendation

For release `v2.0.0-alpha.125`, treat browser control as one of these:

1. A separately distributed Browser Relay package with its own source and install instructions.
2. A browser-capable runtime plugin such as `@elizaos/plugin-browser`.

Do not expect the main Milady repository to provide a loadable unpacked extension directory for this release.

## Architecture summary

When the Browser Relay exists as a separate distribution, the expected topology is:

```text
Chrome Tab <-> Browser Relay Extension <-> Local Relay Server <-> Milady Agent Runtime
```

The extension owns the Chrome debugger session, while the local relay server brokers messages between the extension and the agent runtime.

## Related

- [Apps Overview](/apps/overview)
- [Dashboard](/apps/dashboard)
- [plugin-browser](https://www.npmjs.com/package/@elizaos/plugin-browser)
