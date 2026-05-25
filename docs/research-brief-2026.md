# Research Brief — Electrobun Agentic Desktop 2026

## What Electrobun is

Electrobun is a TypeScript desktop framework that uses Bun for the main process and bundling, native bindings in C++/Objective-C/Zig, and native system webviews by default. Its documentation positions it as a small, fast alternative to Electron with optional CEF when Chromium consistency is needed.

## Core architecture facts used by this port

- Electrobun apps are Bun apps launched by a tiny native launcher; the Bun code can create windows, system trays, relay events/RPC, and call native wrappers.
- `BrowserWindow` creates native desktop windows and loads local bundled assets through `views://...` or remote URLs.
- `BrowserView` and `Electroview` support typed async RPC between Bun and the browser/view context.
- Sandbox mode disables RPC for untrusted content while allowing navigation/lifecycle events.
- `<electrobun-webview>` creates an isolated BrowserView anchored in the DOM; third-party content should use sandbox mode, navigation rules, HTTPS allowlists, partitions, and host-message validation.
- `electrobun.config.ts` controls app metadata, Bun and view entrypoints, copied assets, renderer settings, URL schemes, release base URL, platform build options, signing/notarization, and build hooks.
- Non-dev builds can produce self-extracting, ZSTD-compressed bundles, artifacts for distribution, and update metadata/patch files.
- The Updater API checks update metadata, downloads patches/full builds, and can apply/relaunch when ready.
- Bun provides TypeScript execution, package manager, bundler, test runner, `Bun.secrets`, `bun:sqlite`, and broader runtime APIs.

## Best-practice stance for agentic Electrobun apps

1. Keep privileged work in the Bun main process and expose only narrow typed RPC to views.
2. Treat model-callable tools as privileged capabilities with typed schemas, runtime validation, permission gates, timeouts, cancellation, and tests.
3. Sandbox all remote/untrusted webviews and block RPC to them.
4. Use a provider-neutral AI model adapter. Electrobun does not provide a built-in Foundation Models equivalent.
5. Prefer local deterministic behavior and local models. Use cloud models only with explicit user consent and secure key storage.
6. Use `Bun.secrets` for provider keys/tokens and never store secrets in source, localStorage, SQLite, prompts, or logs.
7. Use `bun:sqlite` for local app data when lightweight persistence is enough; add ORM/migration tooling only with a clear need.
8. Keep app actions reachable through RPC, command palette, menu/tray/context actions, and deep links where supported.
9. Release through repeatable CI: Bun install/test/typecheck, Electrobun build, artifact upload, code signing/notarization, and updater validation.
10. Keep platform differences explicit: native webview engines differ; CEF increases bundle size but improves rendering consistency.

## Source URLs

- Electrobun docs home: `https://blackboard.sh/electrobun/docs/`
- Electrobun quick start: `https://blackboard.sh/electrobun/docs/guides/quick-start/`
- Architecture overview: `https://blackboard.sh/electrobun/docs/guides/architecture/overview/`
- BrowserWindow: `https://blackboard.sh/electrobun/docs/apis/browser-window/`
- BrowserView: `https://blackboard.sh/electrobun/docs/apis/browser-view/`
- Electroview: `https://blackboard.sh/electrobun/docs/apis/browser/electroview-class/`
- Webview tag: `https://blackboard.sh/electrobun/docs/apis/browser/electrobun-webview-tag/`
- Build configuration: `https://blackboard.sh/electrobun/docs/apis/cli/build-configuration/`
- Updater: `https://blackboard.sh/electrobun/docs/apis/updater/`
- Bundling & distribution: `https://blackboard.sh/electrobun/docs/guides/bundling-and-distribution/`
- Code signing: `https://blackboard.sh/electrobun/docs/guides/code-signing/`
- Bun docs: `https://bun.com/docs`
- Bun secrets: `https://bun.com/docs/runtime/secrets`
- Bun SQLite: `https://bun.com/docs/runtime/sqlite`
- Bun test runner: `https://bun.com/docs/test`
