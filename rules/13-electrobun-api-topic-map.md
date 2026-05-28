# 13 — Electrobun API Topic Map

When researching or implementing Electrobun features, map requests to these practical areas:

- Project setup: `bunx electrobun init`, `bun install`, package scripts.
- Build configuration: `electrobun.config.ts`, Bun entrypoint, views, copy assets, URL schemes, renderer options, hooks, release base URL.
- Main process: `BrowserWindow`, `BrowserView`, events, lifecycle, updater, paths, utils.
- Browser/view process: `Electroview`, typed RPC, command palette, HTML/CSS/TS, frontend framework integration.
- Embedded content: `<electrobun-webview>`, sandbox, navigation rules, partitions, preload host messages.
- Native surfaces: application menu, context menu, tray, custom title bar/draggable regions.
- Rendering: system webview vs CEF, WGPU/native GPU surfaces when needed.
- Data/security: `Bun.secrets`, `bun:sqlite`, Bun SQL, filesystem, network allowlists.
- Agentic architecture: ModelRouter, ToolRegistry, SafetyPolicy, PermissionBroker, evals.
- Distribution: dev/canary/stable builds, artifacts folder, static host, updater, code signing, notarization.
- Testing/tooling: `bun test`, TypeScript typecheck, Electrobun dev/build, CI runners per platform.
