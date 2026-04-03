---
title: "Native Modules"
sidebarTitle: "Native Modules"
description: "Compatibility reference for the Electrobun native RPC bridge during the docs reset."
---

The Milady desktop shell exposes native capabilities through the direct Electrobun RPC bridge, not through legacy Electron IPC patterns.

## Public Renderer Contract

Renderer code talks to the host through `window.__MILADY_ELECTROBUN_RPC__`.

- Request/response calls use `request.<method>(params)`.
- Push events use `onMessage("agentStatusUpdate", listener)` and related channel names.
- Keep this page aligned to the direct RPC bridge contract. Do not reintroduce legacy renderer-to-main IPC guidance here.

```ts
const rpc = window.__MILADY_ELECTROBUN_RPC__;

const status = await rpc.request.agentStart();

rpc.onMessage("agentStatusUpdate", (payload) => {
  console.log(payload.state);
});
```

## Capture Notes

App-window capture uses native OS tooling rather than a renderer-owned capture API.

- macOS: `screencapture`
- Windows: PowerShell `System.Drawing.CopyFromScreen`

This page stays intentionally small during the docs reset. Its job is to preserve the repo-tested contract for the native module bridge and the desktop capture path.
