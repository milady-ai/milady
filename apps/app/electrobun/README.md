# Milady Electrobun shell (`@miladyai/electrobun`)

This package is the **native desktop wrapper** around the Milady companion UI: it creates the `BrowserWindow`, loads the Vite renderer, wires RPC to native modules, and (on macOS) applies vibrancy, traffic-light layout, and **frameless window chrome** (drag + resize).

## Why this exists

Electrobun is the **shell**, not the agent runtime. The same Milady runtime (`dist/` / packaged `milady-dist`) is used from CLI, server, and desktop; this folder only hosts **main-process** TypeScript, **preload**, **native `.mm` helpers**, and Electrobun config.

## macOS window chrome (read this before editing)

`titleBarStyle: "hiddenInset"` removes the standard title bar. **WKWebView** then covers the client area. **Dragging** and **inner-edge resizing** are handled with **transparent native views above the web view** so AppKit owns hit testing and cursor rects — not the HTML layer.

- **Why:** WebKit applies page cursors continuously; `NSTrackingArea` under the web view could not reliably show resize cursors or receive drags, and competing `NSCursor` updates caused flicker.
- **Docs (WHYs, file map, build):** [Electrobun macOS window chrome](https://docs.milady.ai/guides/electrobun-mac-window-chrome) (or `docs/guides/electrobun-mac-window-chrome.md` in-repo).
- **Code:** `native/macos/window-effects.mm` — `ElectrobunNativeDragView` (top strip), `MiladyResizeStripView` (right / bottom / BR), `miladyChromeDepthPoints` (per-screen thickness when host passes `height ≤ 0`).
- **Main process:** `src/index.ts` — `applyMacOSWindowEffects`, `alignChrome` on resize, **move** (display changes), and webview **dom-ready** so strips stay above WKWebView after layout.
- **FFI:** `src/native/mac-window-effects.ts`.

### Rebuild native effects after changing `.mm`

```bash
cd apps/app/electrobun && bun run build:native-effects
```

Produces `src/libMacWindowEffects.dylib` (consumed via Bun FFI at runtime).

## Common commands

| Command | Purpose |
|--------|---------|
| `bun run dev` | Preload build + `electrobun dev` |
| `bun run build` | Preload + production Electrobun build |
| `bun run test` | Vitest (`src/__tests__`, etc.) |
| `bun run build:native-effects` | Compile macOS `window-effects.mm` → dylib |

## Dev screenshot loopback (`src/screenshot-dev-server.ts`)

When **`MILADY_DESKTOP_SCREENSHOT_SERVER`** is enabled (root **`dev:desktop` / `dev:desktop:watch`** sets it by default), the main process listens on **`127.0.0.1:31339`** (override **`MILADY_SCREENSHOT_SERVER_PORT`**) and serves **`/cursor-screenshot.png`** so the Milady API can proxy **`GET /api/dev/cursor-screenshot`**. **Auth:** **`Authorization: Bearer <MILADY_SCREENSHOT_SERVER_TOKEN>`** only (**why:** query params would surface in logs and Referer). **Why in Electrobun:** OS-level capture (`ScreenCaptureManager` / `screencapture`) runs in the native shell, not the API process. **Why `server.on("error")` before `listen()`:** bind failures (**`EADDRINUSE`**) must not become an unhandled **`error`** event (that can crash the desktop). Logs show **`[ScreenshotDev]`** with a port hint instead.

See [Desktop local development — observability](../../docs/apps/desktop-local-development.md).

## WebGPU status log and macOS version (Darwin)

Startup logs **`[WebGPU Browser] …`** use **`os.release()`**, which reports the **Darwin** kernel major (e.g. **25.x** on **macOS 26** Tahoe)—not the macOS marketing major in About This Mac. **Why it matters:** a single **`Darwin − 9`** rule matched macOS 11–15 but labeled Tahoe as “macOS 16” and wrong-feature-gated WKWebView WebGPU. **`getMacOSMajorVersion()`** in **`src/native/webgpu-browser-support.ts`** implements the two-part mapping; full **WHYs** and the reference table: **[Darwin vs macOS version (Electrobun WebGPU)](../../docs/apps/electrobun-darwin-macos-webgpu-version.md)**.

## Renderer-facing API base (`__MILADY_API_BASE__`) — **why** Vite watch uses the UI origin

The main process pushes **`apiBaseUpdate`** so the webview sets **`window.__MILADY_API_BASE__`** before/during UI boot.

**Watch / HMR (`MILADY_RENDERER_URL`):** when that env points at a **loopback** `http(s):` dev server (Vite), we set the base to **that origin** (e.g. `http://127.0.0.1:2138`), not `http://127.0.0.1:<MILADY_API_PORT>`.

**Why:** the loaded document is same-origin with Vite. If the client targeted the API port directly, **`fetch`** would be **cross-origin**; **WKWebView** often blocks those responses (CORS / missing `Origin`) and devtools fill with *access control checks* errors. REST is supposed to hit **`/api` on the Vite host** and use the **Vite → API proxy** (`apps/app/vite.config.ts`).

**Static / packaged UI:** no loopback dev URL → base remains **`http://127.0.0.1:<embedded-agent-port>`**. **External** mode still uses **`MILADY_DESKTOP_API_BASE`** (etc.) only.

**Code:** `resolveRendererFacingApiBase` in `src/api-base.ts`; `injectApiBase` / `_startAgent` / menu reset in `src/index.ts`. **Docs:** [Desktop local development — Renderer API base](../../docs/apps/desktop-local-development.md#renderer-api-base-vite-proxy-vs-direct-api-port).

## Related repo docs

- [Desktop app](https://docs.milady.ai/apps/desktop) — install, runtime modes, native modules.
- [Electrobun startup](../../docs/electrobun-startup.md) — agent/bootstrap guards in `src/native/agent.ts`.
- [Darwin vs macOS version (WebGPU)](../../docs/apps/electrobun-darwin-macos-webgpu-version.md) — `uname -r` vs macOS 26+, WebGPU gating rationale.
