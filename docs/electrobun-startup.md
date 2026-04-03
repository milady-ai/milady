---
title: "Electrobun Startup"
sidebarTitle: "Electrobun Startup"
description: "Why desktop startup guards exist and why they should not be stripped out during cleanup."
---

The Electrobun shell must stay usable even when the embedded runtime fails to start cleanly.

## Non-Negotiable Rule

Do not remove the startup guards in `apps/app/electrobun/src/native/agent.ts`.

Those guards exist so that:

- the desktop shell can still bring up the API surface
- the renderer can show a useful error instead of only `Failed to fetch`
- startup diagnostics remain visible during recovery
