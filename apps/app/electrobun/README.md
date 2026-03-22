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

## Related repo docs

- [Desktop app](https://docs.milady.ai/apps/desktop) — install, runtime modes, native modules.
- [Electrobun startup](../../docs/electrobun-startup.md) — agent/bootstrap guards in `src/native/agent.ts`.
