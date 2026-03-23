---
title: Desktop webview — layout, RPC, and Eliza Cloud disconnect
sidebarTitle: Webview, RPC & cloud disconnect
description: WHY detached windows need an explicit viewport height chain, WHY Electrobun’s default RPC timeout breaks native dialogs, and WHY Eliza Cloud disconnect uses the main process plus a post-disconnect UI guard.
---

This page explains **desktop-only** behavior that is easy to misread as “random UI bugs” without the WKWebView + Electrobun context.

## Detached windows (chat, browser, settings pop-outs): content height

**Symptom:** The **native window** looks correct, but the **page content** (especially the in-app **Browser** surface) does not fill the area below the chrome — the embedded `electrobun-webview` appears squashed or short.

**Why it happens**

1. **`#root` has no intrinsic height.** `index.html` does not set `html, body, #root { height: 100% }`, so a column flex layout with `flex-1` on a child has **nothing definite** to distribute.
2. **Flex `flex: 1` needs a bounded parent.** The Milady **Browser** UI uses a column flex: toolbar + status + **viewport** (`flex: 1; min-height: 0`). Without a viewport-sized ancestor, `flex-1` collapses to content height instead of “all remaining space.”

**What Milady does**

- **`apps/app/src/main.tsx`** wraps **`DetachedShellRoot`** in **`h-screen min-h-0 w-screen flex flex-col overflow-hidden`** so the detached shell subtree gets a **real viewport box**.
- **`DetachedShellRoot`** uses **`h-full min-h-0`** on the outer shell and a **`main`** that is **`flex flex-col flex-1 min-h-0`** so surface content (chat, browser, etc.) participates in flex correctly.
- **`browser-surface.css`** uses **`flex: 1 1 auto; min-height: 0`** on **`.browser-surface`** instead of **`min-height: 100%`** (percent height is fragile when the parent chain is not all explicit).

**Code map:** `apps/app/src/main.tsx`, `packages/app-core/src/shell/DetachedShellRoot.tsx`, `packages/app-core/src/styles/browser-surface.css`, `packages/app-core/src/components/BrowserSurfaceWindow.tsx`.

---

## Electrobun RPC: default 1s `maxRequestTime`

**Symptom:** After confirming a **native** dialog, the renderer shows **`RPC request timed out`** (or actions appear to do nothing) even though the main process is still waiting on the user or on HTTP.

**Why:** Electrobun’s shared **`createRPC`** uses **`DEFAULT_MAX_REQUEST_TIME = 1000`** ms for **outgoing** renderer → Bun requests. Any handler that waits longer than 1s — **native message boxes**, **main-process `fetch` to the API**, file pickers — will hit that timeout on the **webview side** before the main process finishes.

**What Milady does**

- **`apps/app/electrobun/src/bridge/electrobun-direct-rpc.ts`** (bundled into **`preload.js`** via **`bun run build:preload`**) passes **`maxRequestTime: 600_000`** (10 minutes) into **`Electroview.defineRPC`**. Same idea in **`electrobun-bridge.ts`** for parity.
- **You must rebuild preload** after changing bridge code: from the **repo root**, **`bun run build:preload`**, or **`cd apps/app/electrobun && bun run build:preload`**.

**Why not `Infinity`:** a finite ceiling still bounds wedged RPCs; individual flows can use **`invokeDesktopBridgeRequestWithTimeout`** where we want a tighter cap.

---

## Eliza Cloud disconnect: main process + UI guard

**Symptom:** Tapping **Disconnect** on the Cloud Dashboard either **does nothing** after confirm, or shows **“Disconnected”** while **balances** and **HEALTHY** immediately return.

**Why (nothing after confirm)**

On **macOS WKWebView**, work scheduled in the renderer ( **`fetch`**, **bridge RPC** ) can **stall on the same turn** as a **native** sheet, the same class of issue as **Reset Milady** (documented in [Main-process reset](./desktop-main-process-reset.md)).

**What Milady does**

- **`agentCloudDisconnectWithConfirm`** (Bun RPC): **native confirm + `POST /api/cloud/disconnect`** in the **main** process, so the renderer does not have to run network immediately after the sheet.
- Fallback path: renderer confirm + **`agentPostCloudDisconnect`** + **`client.cloudDisconnect()`** with **timeouts** if the combined RPC is missing or fails.

**Why (toast says disconnected but UI still “connected”)**

1. **`pollCloudCredits`** runs after disconnect and trusts **`GET /api/cloud/status`**. If that snapshot still says **`connected: true`** briefly (ordering, caching, or proxy vs direct API mismatch), the poll **re-applies** credits and **HEALTHY**.
2. **`elizaCloudPreferDisconnectedUntilLoginRef`**: after a **successful** disconnect, we **ignore `connected: true`** from polls until the user starts **Connect** again or the server consistently reports **disconnected**. **Why:** user intent after disconnect is to see the **Connect** screen; trusting a laggy status would snap the dashboard back.

**Code map:** `packages/app-core/src/state/AppContext.tsx` (`handleCloudDisconnect`, `pollCloudCredits`), `apps/app/electrobun/src/rpc-handlers.ts`, `apps/app/electrobun/src/cloud-disconnect-from-main.ts`, `rpc-schema.ts`, `electrobun-bridge.ts` / `electrobun-direct-rpc.ts`.

---

## Related

- [Desktop local development](./desktop-local-development) — **`build:preload`**, dev orchestrator, observability.
- [Desktop app](./desktop) — runtime modes and features.
- [Main-process reset](./desktop-main-process-reset.md) — same **WKWebView after native dialog** theme for **Reset Milady**.
