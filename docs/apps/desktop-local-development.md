---
title: "Desktop Local Development"
sidebarTitle: "Desktop Local Dev"
description: "High-signal guide for the multi-process desktop development loop."
---

Use this path when you are developing the native desktop shell.

## Commands

```bash
bun run dev:desktop
bun run dev:desktop:watch
```

## What These Flows Coordinate

- API process
- renderer build or Vite dev server
- Electrobun shell
- port allocation and propagation

The orchestrated desktop flow exists because these processes must agree on the same API and renderer endpoints. That is why this guide remains a stable path even during the docs reset.

### When default ports are busy

Desktop dev can pre-allocate replacement loopback ports so the API, proxy, and renderer stay aligned instead of partially booting against mismatched ports.
