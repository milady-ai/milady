# LifeOps browser extension

Chrome (Manifest V3) and Safari Web Extension for LifeOps. Reports
per-domain focus time to the local Milady / LifeOps agent over a
loopback WebSocket (default `ws://127.0.0.1:31339/ext`).

## Build

```sh
bun install
bun run build:chrome      # → dist/chrome/
bun run build:safari      # → dist/safari/  (consumed by ios-wrapper/)
bun run build             # both
```

## Load unpacked in Chrome

1. `bun run build:chrome`
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select `dist/chrome/`.
5. Pin the LifeOps action; click it to open the popup, or right-click →
   **Options** to change the agent WebSocket URL.

## Safari

See [`ios-wrapper/README.md`](./ios-wrapper/README.md). Requires a Mac
with Xcode; the wrapper loads the same `dist/safari/` bundle.

## What it tracks

- Per-registrable-domain focus time. Sessions open on tab/window focus
  and on `visibilitychange`; they close when focus leaves the domain.
- Buckets are flushed to the agent every `flushIntervalMs`
  (default 60 s).
- No page content is reported — only origin + focus duration.

## Privacy

- Honors the `activityReportingEnabled` toggle on the options page.
- On Chromium, `chrome.privacy.network.networkPredictionEnabled = false`
  is treated as a soft opt-out and the flush loop stays idle.

## Tests

```sh
bunx vitest run
bunx tsc --noEmit
```
