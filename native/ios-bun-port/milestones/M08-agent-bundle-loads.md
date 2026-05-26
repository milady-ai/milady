# M08 — Agent bundle loads, Bun globals work

**Owner:** TBD
**Status:** Not started
**Predecessors:** M07
**Successors:** M09

## Goal

`eliza/packages/agent/dist-mobile/agent-bundle.js` loads and runs inside `libbun.a` on simulator. `Bun.serve` starts a loopback HTTP server. Agent reaches "ready" state.

## Acceptance Criteria

- [ ] `build-mobile-bundle.mjs --target=ios` produces an iOS-shaped agent bundle:
  - All Bun globals available
  - Mobile stubs swapped for iOS-specific stubs (the throwing kind for `child_process`, `Bun.spawn`, etc.)
  - PGlite wired through Capacitor Filesystem path (NOT in-WebView IDB)
- [ ] The bundle loads via `bun_embedded_run("bun", "agent-bundle.js")` in the HelloApp.
- [ ] `Bun.serve({ port: 31337, ... })` starts a loopback HTTP server.
- [ ] `curl http://127.0.0.1:31337/api/agents` (called from the WKWebView) returns valid JSON.
- [ ] Agent's `startEliza()` returns a runtime object with all expected services registered.
- [ ] All `node:*` imports resolve (Bun's built-in compat handles them).
- [ ] PGlite opens its database file at `<stateDir>/workspace/.elizadb`.
- [ ] Plugin auto-resolution via `STATIC_ELIZA_PLUGINS` succeeds for the core plugin set.

## Pre-flight work

Before this milestone can start, `build-mobile-bundle.mjs` must learn about iOS. The work:

1. Add `--target=ios` flag that selects `mobile-stubs/ios-*.cjs` stubs instead of the generic Android stubs.
2. Generate a different `plugins-manifest.json` for iOS that excludes plugins which require `bun:ffi` of arbitrary libs (the AOSP local-inference plugin, etc.) and uses the new `@elizaos/plugin-ios-bun-bridge` for local inference.
3. PGlite extension paths (`pglite.wasm`, `initdb.wasm`, `pglite.data`, `vector.tar.gz`, `fuzzystrmatch.tar.gz`) must land in the iOS app bundle as resources, with PGlite's `new URL("./pglite.wasm", import.meta.url)` resolution finding them.
4. Generate an `ios-runtime-config.json` baked into the bundle: storage paths, allowed inference backends, etc.

## Effort estimate

- Nominal: 2 weeks
- With "PGlite doesn't load right" debugging: 3 weeks

## Risks

- **PGlite startup is slow.** Cold-start of PGlite is several hundred ms even on desktop. On iOS LLInt it might be 3–5s. If this is user-visible, defer DB open until after first render.
- **`Bun.serve` on loopback may need `NSLocalNetworkUsageDescription`** if iOS classifies it as a local network bind. Test on simulator first; if the prompt appears, document the entitlement.
- **HTTP keep-alive between WKWebView and the agent.** iOS WKWebView's URL session keeps connections alive aggressively; verify no socket starvation.
