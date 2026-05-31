# 05 — Electrobun UI Architecture

Use native windows and webviews intentionally.

## BrowserWindow / BrowserView

- Load app-owned bundled assets with `views://...`.
- Use `BrowserWindow` for top-level windows and access its default `webview` for RPC/events.
- Use direct `BrowserView` creation only for advanced layout or lifecycle needs.
- Keep window creation in the Bun main process; keep view rendering in view code.
- Use `titleBarStyle`, transparent windows, and draggable regions only when the UI implements accessible custom controls.

## Nested webviews

- Use `<electrobun-webview>` for isolated embedded content.
- Always sandbox third-party/user URLs.
- Add navigation rules and HTTPS-only allowlists.
- Use partitions to isolate sessions.
- Validate `host-message` payloads from preload scripts.

## Renderer strategy

- Prefer system webview for smallest bundles and native behavior.
- Bundle CEF when you need cross-platform rendering consistency, advanced webview compositing, or modern Chromium APIs unavailable in system webviews.
- Be explicit about Linux renderer limitations and test the chosen renderer on target platforms.
