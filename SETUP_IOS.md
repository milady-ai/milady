# Milady iOS — Build Map

The Milady iOS app runs **on-device, local-first**. The agent runtime lives inside a Capacitor plugin (`@elizaos/capacitor-bun-runtime`) that hosts a `JavaScriptCore` `JSContext` with a Bun-shape API surface installed by a Swift bridge. The same agent JS bundle that runs on desktop/Android runs here, just through a different host. Inference runs against a statically-linked `libllama.a` (Metal-accelerated). Persistence runs against the system `libsqlite3` (PGlite cannot work because `WebAssembly` is disabled in `JSContext` on iOS 16.4+).

No cloud is required to chat. Cloud is opt-in.

## Architecture (current)

```
┌─────────────── iOS .app (Milady) ────────────────────────────┐
│                                                              │
│  AppDelegate.swift                                           │
│   └─ on launch → ElizaBunRuntime.start()                    │
│                                                              │
│  WKWebView (React UI, full WebKit JIT)                       │
│   └─ Capacitor bridge to plugins                             │
│                                                              │
│  @elizaos/capacitor-bun-runtime  ◀── agent runtime host      │
│   ├─ JSContext (LLInt, no JIT — Apple restriction)           │
│   │   ├─ polyfill-prefix.js                                  │
│   │   │   - installs globalThis.Bun, node:* modules          │
│   │   │   - all I/O routed via __MILADY_BRIDGE__             │
│   │   └─ agent-bundle-ios.js                                 │
│   │       - the actual elizaOS agent — planner, plugins      │
│   │                                                          │
│   └─ Swift bridge implementations                            │
│       ├─ FSBridge          (FileManager)                     │
│       ├─ PathsBridge       (sandbox dirs)                    │
│       ├─ CryptoBridge      (CryptoKit + CommonCrypto)        │
│       ├─ HTTPBridge        (URLSession)                      │
│       ├─ HTTPServerBridge  (Network.framework NWListener)    │
│       ├─ SqliteBridge      (libsqlite3 + sqlite-vec)         │
│       ├─ LlamaBridge       (llama.cpp xcframework, Metal)    │
│       ├─ LogBridge         (os_log)                          │
│       └─ UIBridge          (Capacitor notifyListeners)       │
│                                                              │
│  Other Capacitor plugins (camera, location, talkmode, ...)   │
│                                                              │
│  Statically linked frameworks (in app binary)                │
│   ├─ llama.cpp (Metal-enabled, arm64-ios + simulator)        │
│   ├─ sqlite-vec (optional, for embeddings)                   │
│   └─ libsqlite3.tbd (system framework — no extra ship cost)  │
└──────────────────────────────────────────────────────────────┘
```

## How an iOS local chat request flows

1. User types in chat input (WKWebView, React UI).
2. React calls `ElizaBunRuntime.sendMessage({ message })` via Capacitor.
3. Capacitor dispatches to the Swift plugin on the agent's serial DispatchQueue.
4. Swift invokes a registered JS handler on the `JSContext` ("sendMessage" registered by the agent during boot).
5. Agent JS runs the planner loop. It calls `bridge.llama_generate(...)` for the LLM step, `bridge.sqlite_query(...)` for memory recall, etc.
6. Tokens stream back via `llama_register_stream_callback`. Each token is `bridge.ui_post_message`'d to the WebView as it arrives.
7. React UI receives the streamed events and renders them.

No HTTP server, no loopback, no network. Pure in-process Swift↔JS via JSContext.

## Build tiers

| Tier              | Channel              | Model bundled?    | Cloud opt-in default | Notes                              |
|-------------------|----------------------|-------------------|----------------------|------------------------------------|
| **App Store**     | Apple App Store      | No (download on first launch) | Off | <200 MB IPA. Privacy-first messaging |
| **TestFlight**    | App Store Connect    | No                | Off | Same binary as App Store           |
| **Dev (Xcode)**   | Direct install       | Yes (~400 MB)     | On  | All plugins enabled, web inspector |
| **Sideload**      | AltStore / SideStore | Yes               | Off | Same as Dev minus the dev plugins  |

Switch tiers via `MILADY_DISTRIBUTION_TIER=appstore|dev|sideload` env at build time. See `run-mobile-build.mjs`.

## Quick start: end-to-end iOS Simulator

Prereqs: Mac with Apple Silicon, Xcode installed, `bun` available, repo cloned with `bun install` complete.

```bash
# 1. Download the first-light model (~400 MB, one-time)
bun native/ios-bun-port/models/download-first-light.sh

# 2. End-to-end: build agent bundle, build polyfill, build iOS app, install, launch
bun run ios:simulator
```

The `ios:simulator` script:
1. Overlays the iOS Capacitor project template into `apps/app/ios/`
2. Builds the agent bundle: `cd eliza/packages/agent && bun run build:ios-jsc`
3. Builds the polyfill prefix: `cd native/ios-bun-port/polyfill && bun run build`
4. Concatenates polyfill + agent into `agent-bundle-ios.js`
5. Stages assets into the Xcode project resources
6. `pod install` in `apps/app/ios/App/`
7. `xcodebuild` for `iPhone 15 Pro` Simulator (Apple Silicon)
8. `xcrun simctl install` + `launch --console-pty`
9. Streams the console so you see agent logs as they happen

First-time cost: ~10 minutes (pod install + Xcode build).
Warm-build cost: ~30 seconds.

## Background: why this architecture

We considered three paths:

1. **Port Bun (Zig codebase) to iOS** — 4–6 months, fork-rebase tax, perf-bound by LLInt anyway. Documented at `eliza/docs/audits/mobile-2026-05-11/IOS_BUN_PORT.md` as a future option; not pursued now.
2. **`nodejs-mobile`** — V8-jitless, +10–15 MB binary, dormant upstream (last release Oct 2024, Node 18 EOL April 2025).
3. **System `JSContext` + Bun-shape Swift bridge** — Apple-blessed surface, zero engine ship cost, ~7× LLInt slowdown vs JIT (we don't get JIT either way), bridge code is ~6–10k LOC of Swift + JS. **This is what we built.**

JSContext is the same engine WKWebView uses; Apple ships it on every iOS device. Embedding it in an app means "interpreter only" (no JIT entitlement for non-WebKit apps), but interpreter-only is the only mode any embedded JS runtime gets on iOS App Store, so we're not paying a perf tax compared to the alternatives.

The `WebAssembly` finding (disabled in non-WebKit JSC since iOS 16.4) eliminates PGlite. We replaced it with native SQLite via the system `libsqlite3`, exposed through a PGlite-shape wrapper in the polyfill so agent code that imports `@electric-sql/pglite` keeps working unchanged.

## OAuth flows (Anthropic + Codex on iOS)

Local mode does not need them. Cloud-hybrid mode does. When/if the user opts in to cloud:
- **Universal Link** (preferred): `https://milady.app/oauth/callback` declared as associated domain in `App.entitlements`; `AppDelegate.application(_:continue:restorationHandler:)` dispatches to the registered OAuth handler.
- **Custom URL scheme** (fallback): `milady://oauth/callback` declared in `CFBundleURLTypes`. Less secure (other apps can register the same scheme).

Status: not yet wired. Open item from the original (cloud-hybrid-only) plan.

## Required env / build

| Env / Build flag                        | Effect                                                           |
|-----------------------------------------|------------------------------------------------------------------|
| `MILADY_DISTRIBUTION_TIER`              | `appstore` / `dev` / `sideload` — gates plugins, entitlements, model bundling |
| `ELIZA_DISPLAY_NAME`                    | Substituted into `CFBundleDisplayName` at build time             |
| `ELIZA_IOS_RUNTIME_MODE`                | `local` (default for ios-jsc) / `cloud` / `cloud-hybrid`         |
| `MILADY_FIRST_LIGHT_MODEL`              | Override model name (default `qwen2.5-0.5b-instruct-q4_k_m`)     |
| `MILADY_SKIP_MODEL_CHECK`               | Set to `1` to skip the GGUF-present check in the simulator script |

## Reference docs

- Audit + 3-tier feature matrix: `eliza/docs/audits/mobile-2026-05-11/REPORT.md`
- Hypothetical Bun-port plan (not pursued): `eliza/docs/audits/mobile-2026-05-11/IOS_BUN_PORT.md`
- Bridge contract: `native/ios-bun-port/BRIDGE_CONTRACT.md`
- Platform matrix (what works / throws): `native/ios-bun-port/PLATFORM_MATRIX.md`
- SQLite bridge details: `native/ios-bun-port/SQLITE_BRIDGE.md`
- First-light model details: `native/ios-bun-port/models/README.md`
- Current project status: `native/ios-bun-port/STATUS.md`

## Open items

- [x] iOS overlay step (Linux-friendly file ops) — already done by `run-mobile-build.mjs ios-overlay`.
- [x] Capacitor plugin `@elizaos/capacitor-bun-runtime` — landed in this session.
- [x] Polyfill bundle — landed in this session.
- [x] Agent bundle for ios-jsc target — landed in this session.
- [x] First-light model download script — landed in this session.
- [x] `bun run ios:simulator` runner — landed in this session.
- [ ] llama.cpp xcframework cross-built and linked. In progress; build harness lives in eliza at [`eliza/packages/ios-native-deps/llama.cpp/`](eliza/packages/ios-native-deps/llama.cpp/) (npm: `@elizaos/ios-native-deps`). Migrated out of `native/ios-bun-port/vendor-deps/` on 2026-05-13 — milady consumes via the eliza submodule.
- [ ] sqlite-vec for pgvector compatibility (optional; agent works without it for simple queries).
- [ ] Universal Link OAuth wiring (only matters for cloud-hybrid mode).
- [ ] `BGTaskScheduler` for trajectory rotation and auto-training.
- [ ] App Intents + Siri shortcuts.
- [ ] Privacy manifest audit for App Store submission.
- [ ] First device test (not just Simulator).
