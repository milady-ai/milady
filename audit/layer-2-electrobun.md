# Layer 2 — Electrobun desktop shell

**Files in scope: 56** (the directory has 63 `.ts` files; the 7 boot-immediate
files — `index.ts`, `api-base.ts`, `agent-ready-state.ts`, `constants.ts`,
`types.ts`, `main-window-runtime.ts`, `main-window-session.ts` — were
audited in [Layer 1](./layer-1-entry.md)).
**Audited: 56 / 56.**
**Refactored: 0 / 56** (findings-only pass; no edits.)

The shell process. Bun main with Electrobun's `BrowserWindow` /
`BrowserView` / `Tray` / `Updater` / `GlobalShortcut`, a webview `Electroview`
that runs `bridge/electrobun-direct-rpc.ts` as a preload, and a flotilla of
"native" managers (`native/*`) that wrap macOS dylib FFI, `Bun.spawn` to
the agent, mDNS gateway discovery, screen capture, etc.

## Why this layer right after entry

- Layer 1 found that `index.ts` is a 2587-LOC god module with **5 distinct
  API-base push surfaces** (4 RPC + 1 HTML inject) and named four
  Phase-3 extractions. Layer 2 must verify those extractions are
  buildable and inventory **what's already extracted** (a lot, it turns
  out) so Phase 3 doesn't rebuild work that exists.
- The renderer-facing bridge isn't a single channel: there are **four
  distinct loopback HTTP servers** plus the Electrobun RPC bus plus the
  HTML inject plus a renderer-side preload. Each one has its own auth
  story, its own port range, its own start/stop lifecycle. Until Layer 2
  inventories them, MASTER.md §3 Phase 3 can't deliver "one owner."
- The "native" subdirectory contains the two largest files in the layer:
  `native/desktop.ts` (2249 LOC) and `native/agent.ts` (1835 LOC). Either
  is god-module-class on its own. Layer 2 surfaces them so they can get
  their own decomposition pass.

## What to look for in this layer specifically

- **Bridge-surface duplication.** RPC schema, RPC handlers,
  electrobun-direct-rpc, browser-workspace-bridge-server,
  desktop-test-bridge-server, screenshot-dev-server — each speaks to the
  renderer or to test tooling. How much overlaps?
- **API-base push surfaces beyond the 5 from Layer 1.** Anything in the
  bridge files that writes `__ELIZA_API_BASE__` or boot-config?
- **RPC-schema bloat.** Orphan messages that are defined but never sent
  or never handled. `screencaptureSetCaptureTarget` is a documented
  example.
- **Application-menu action registry.** Is the parallel registry pattern
  (`application-menu-action-registry.ts`) wired up, partially built, or
  inert?
- **Static renderer HTTP server vs dev orchestrator.** Does
  `renderer-static.ts` duplicate Vite-proxy / MIME / CSP logic from
  Layer 0?
- **Floating chat window vs main window vs surface windows.** Is there a
  shared `createWindow` primitive or copy-pasted creation paths?
- **Dev-only servers in production.** Do any dev bridges leak when a
  packaged build runs?

## Status legend

- `[ ]` pending — not yet read
- `[~]` reading — currently being audited
- `[!]` findings — audited, findings recorded, no edit needed yet
- `[*]` refactor — audited and edited (commit hash appended)
- `[x]` clean — audited, no changes warranted
- `[-]` delete — audited, slated for deletion (DELETED commit appended)
- `[?]` blocked — audited but blocked by a lower-layer dependency

Findings format after path: `axis:short-note, axis:short-note`.

---

### Schema, handlers, bridge

- [!] `eliza/packages/app-core/platforms/electrobun/src/rpc-schema.ts` — **1776 LOC schema**. dedup:`FloatingChatStatus` interface duplicated verbatim with `floating-chat-window.ts:28-33` (same fields). dedup:`AllPermissionsState` shape exists at `rpc-schema.ts:238` *and* `native/permissions-shared.ts:18` — comment annotates this as documented-divergent ("local variant uses an index signature"); it is intentional, mark as `dedup:documented-diverged`. types:13 `unknown`/`Record<string, unknown>` slots (lines 134, 192, 658, 916, 923, 1042, 1045, 1061, 1180, 1292, 1321, 1343) where the wire type is real but unmodelled — `swabbleGetConfig` returns `Record<string, unknown>` even though `SwabbleConfig` shape exists in `native/swabble.ts`; `swabbleUpdateConfig`, `talkmodeSpeak.directive`, `desktopCreateBugReportBundle.reportJson`, `canvasEval.response`, `canvasA2uiPush.payload`, `canvasWindowEvent.data`, `desktopTrayMenuClick.agentStatus`, `gpuViewGetNativeHandle.response.handle` — each is a typed concept the schema declines to type. legacy:`CHANNEL_TO_RPC_METHOD` (lines 1445-1710, 250+ entries) and `PUSH_CHANNEL_TO_RPC_MESSAGE` (1716-1768) are explicit "legacy colon-separated channel names → camelCase RPC method names" maps for backward compatibility — verify whether any caller still uses the legacy `desktop:foo` strings, and if not, delete the maps and the back-compat path. boundaries:imports `BrowserWorkspaceSnapshot` / `OpenBrowserWorkspaceTabRequest` etc. from `@elizaos/agent/services/browser-workspace-types` — schema (transport contract) reaches into the agent (domain). Should declare its own DTOs and let the agent map.
- [!] `eliza/packages/app-core/platforms/electrobun/src/rpc-handlers.ts` — **969 LOC** of `setRequestHandler({...})`. dedup:every handler is a one-liner that forwards to a native manager via `Parameters<typeof manager.method>[0]` — the schema, the handler, and the manager method all repeat the same shape three times. types:explicit `any` escape-hatches at lines 100, 102 with a long comment justifying them — accepted, but the wrapper type (`ElectrobunRpcWithHandlers`) is also a smell that Electrobun upstream should publish a typed `setRequestHandler` (file marker comment to that effect). dedup:re-exports `formatRendererDiagnosticLine` and `redactDiagnosticUrl` from `./diagnostic-format` (lines 105-108) — the import was already there for the handler; the re-export means callers can import either path. errors:two broad `try/catch` blocks at lines 173-186 (agentRestartClearLocalDb) and 198-202 (agentPostCloudDisconnect) that just `console.error` and rethrow — they exist only to log; the rethrow makes them useless except as a logging hook; replace with structured logger or drop. errors:`syncPermissionsToRestApi` swallows fetch failures with `console.warn` (lines 82-86) — acceptable for "best-effort" sync, but should at least surface the failed PUT to a service-level event for diagnostics. boundaries:lines 207-237 (`agentCloudDisconnectWithConfirm`) build a native message-box, parse a `{response}` shape, then call `postCloudDisconnectFromMain` — the message-box parsing logic is non-trivial (`response | bigint | number | unknown`) and belongs in `cloud-disconnect-from-main.ts` next to its sibling.
- [!] `eliza/packages/app-core/platforms/electrobun/src/bridge/electrobun-direct-rpc.ts` — **428 LOC renderer preload**. **API-base destination dispatcher.** This is the **renderer-side handler** for `apiBaseUpdate`: every push from main fans out to **three globals** at lines 97-112 (`window.__ELIZA_API_BASE__`, `window.__ELIZA_API_TOKEN__`, and `updateBootConfig({apiBase, apiToken})` which writes `BOOT_CONFIG_WINDOW_KEY` plus `BOOT_CONFIG_STORE_KEY`). Plus `__ELIZA_ELECTROBUN_RPC__` set at line 229. dedup:these globals are also written by `injectApiBaseIntoHtml` in `index.ts:843-861` (the HTML inject path). A single dispatcher should write them in one place. types:`RendererBridgeRpc` interface (lines 20-23) types `setTransport: (transport: unknown)` and `request: Record<string, RendererRequestHandler>` then casts the rpc instance to it (`as RendererBridgeRpc` line 163, `as RendererBridgeRpc["request"]` line 203). slop:the renderer-log mirror at lines 231-428 (`installRendererLogMirror`) is a 200-LOC observability subsystem (console wrap, window.onerror, unhandledrejection, fetch wrap, XMLHttpRequest wrap, all forwarding to `rpc.request.rendererReportDiagnostic`) — large, distinct concern; should live in its own file `bridge/renderer-log-mirror.ts` so the API-base + RPC dispatch path stays under 200 LOC.
- [x] `eliza/packages/app-core/platforms/electrobun/src/bridge/electrobun-preload.ts` — 1 LOC re-import (`import "./electrobun-direct-rpc"`). Side-effect entry point. Clean.
- [x] `eliza/packages/app-core/platforms/electrobun/src/bridge/electrobun-stub.ts` — 21 LOC. `ensureElectrobunGlobal()` stubs `window.__electrobun` so Electroview.init doesn't NPE if the built-in preload hasn't fired yet. Clean.
- [x] `eliza/packages/app-core/platforms/electrobun/src/bridge/browser-tabs-renderer-registry.ts` — 60 LOC. Renderer-side registry mediating between bun-issued evaluate/get-tab-rect RPCs and `BrowserWorkspaceView` tag refs. Symbol-keyed at `__ELIZA_BROWSER_TABS_REGISTRY__` window global — same `__ELIZA_*` pattern as the API base globals, but legitimately scoped (only renderer reads). Clean.

### Application menu

- [!] `eliza/packages/app-core/platforms/electrobun/src/application-menu.ts` — 446 LOC. dead:`heartbeatSnapshot?: HeartbeatMenuSnapshot` parameter at line 301 with the doc comment "currently unused since the per-surface menus that displayed live heartbeat counts were folded into the unified Apps menu. Kept on the signature so existing callers in `index.ts` do not break." — this is exactly the kind of "for compatibility" code AGENTS.md says to remove on sight. Delete the parameter, update the one caller in `index.ts:157`. dead:`EMPTY_HEARTBEAT_MENU_SNAPSHOT` constant (line 177) and `HeartbeatMenuSnapshot` interface (166-175) are exported but only used by `index.ts` as the initial value of a snapshot that's only fed back into the now-unused parameter — verify dead-end and remove the entire concept (interface, const, parameter, the `index.ts` `heartbeatMenuSnapshot` module-level state). dedup:`AppMenuEntry` list (24-109) is an explicit mirror of the renderer-side `INTERNAL_TOOL_APPS` with a `TODO` to import from there once the bun bundler can — accepted, but the TODO has no tracking issue.
- [!] `eliza/packages/app-core/platforms/electrobun/src/application-menu-action-registry.ts` — 21 LOC. **Half-built registry.** A single module-level `handler: ApplicationMenuActionHandler | null` and a `setApplicationMenuActionHandler` setter / `invokeApplicationMenuAction` invoker. The setter is called once from `index.ts:1873` to register the giant 200-LOC `handleApplicationMenuAction` switch as the handler. The invoker has **one** caller: `desktop-test-bridge-server.ts:152`. So the registry is **functionally a hook for the test bridge**, not a real action registry. Phase 3e in MASTER.md should *finish wiring it* — break the 200-LOC switch in `index.ts` into a `Record<string, MenuAction>` and have this module be the dispatcher with first-class registration. As-is, the file is 21 LOC of plumbing for one external caller. boundaries:lives at `src/` root next to `application-menu.ts` — it belongs under `bridge/` once Phase 3 lands.

### Loopback HTTP servers (4 of them)

- [!] `eliza/packages/app-core/platforms/electrobun/src/browser-workspace-bridge-server.ts` — 242 LOC. dedup:re-implements `isLoopback`, `json`, `readJsonBody<T>`, `isAuthorized`, scrub-stack helper from scratch — same shape as `desktop-test-bridge-server.ts` and (partially) `screenshot-dev-server.ts`. types:body shapes (`BrowserWorkspaceCreateBody`, `BrowserWorkspaceNavigateBody`, `BrowserWorkspaceEvalBody`) duplicate `OpenBrowserWorkspaceTabRequest` etc. from `@elizaos/agent/services/browser-workspace-types` — same DTOs, redeclared. legacy:`process.env.ELIZA_BROWSER_WORKSPACE_TOKEN` set on entry then mutated to a generated value — env mutation as side effect of `start()` is a smell; should return the token to the caller. boundaries:**production reachable** — `index.ts:2158` calls `startBrowserWorkspaceBridgeServer()` unconditionally, no dev-only guard. Verify whether this should be gated by `NODE_ENV` or a dedicated env flag.
- [!] `eliza/packages/app-core/platforms/electrobun/src/desktop-test-bridge-server.ts` — 184 LOC. dedup:re-implements `isLoopback`, `json`, `readJsonBody<T>`, `isAuthorized` — same as `browser-workspace-bridge-server.ts`. The `isTruthyEnv` helper duplicates similar normalization in `screenshot-dev-server.ts:30-31` and several other files in the layer (each does its own `["1","true","yes"].includes(...)` check). errors:single `try/catch` at lines 95-168 wrapping the entire request handler — fine for a debug server. legacy:env-gating logic (lines 70-75) accepts three different env vars (`ELIZA_DESKTOP_TEST_BRIDGE_ENABLED`, `ELIZA_DESKTOP_TEST_BRIDGE_PORT`, `ELIZA_DESKTOP_TEST_BRIDGE_TOKEN`) any of which enables the server — encoded "if you set anything we'll start" is fragile.
- [!] `eliza/packages/app-core/platforms/electrobun/src/screenshot-dev-server.ts` — 125 LOC. dedup:`isLoopback` re-implemented again. legacy:env-gating uses `["1","true","yes"]` pattern — third copy of the same normalization. errors:line 90-95 swallows all errors with `res.end("error")` and no logging — should at minimum log via the structured logger. boundaries:**dev-only**, gated behind `ELIZA_DESKTOP_SCREENSHOT_SERVER` env. Default-on in dev per CLAUDE.md but off in production. Correct.
- [x] `eliza/packages/app-core/platforms/electrobun/src/native/loopback-port.ts` — 81 LOC. The actual port-allocation primitive used by all four bridge servers + the agent. Clean and well-typed.

### Static renderer HTTP server primitive

- [x] `eliza/packages/app-core/platforms/electrobun/src/renderer-static.ts` — 77 LOC. Pure asset path resolver — picks `index.html` for unknown routes, prefers `.gz` siblings when present, normalizes outside-rendererDir paths to bundled index. Clean. Note: the actual HTTP server (Bun.serve loop, `/api` proxy, HTML inject) is **inline in `index.ts:786-986`** per Layer 1 audit — `renderer-static.ts` only owns asset resolution. Should be renamed to `renderer-asset-resolver.ts` to match its actual scope, or absorb the index.ts HTTP server inline next to it.

### Floating-chat / surface / cloud-auth windows

- [!] `eliza/packages/app-core/platforms/electrobun/src/floating-chat-window.ts` — 239 LOC. dedup:`FloatingChatStatus` interface (lines 28-33) is duplicated verbatim in `rpc-schema.ts:362-367` — schema should be the source of truth; this file should `import type {...} from "../rpc-schema"`. dead:`isOpen()` method (line 223) has no callers (only `getStatus().open` is used). errors:six `try {} catch {}` blocks (lines 46-56, 134-139, 144-152, 160-169, 171-188, 192-203) all silent or `/* ignore */` — defensive sludge per AGENTS.md. The legitimate "Electrobun's `setAlwaysOnTop` may not exist" check at lines 134-139 should be a feature-detect, not a try/catch. The other five hide real failures (window destroyed during getPosition, getSize on a closed window, etc.). slop:`resolveDefaultPosition` at lines 43-57 hard-codes `1920x1080` then a try/catch that returns `{x:1500, y:400}` — neither is real screen detection. Comment admits "actual display query needs electrobun/bun Screen API." Use it. types:`as unknown as { hide?: () => void }` and `as unknown as { hide: () => void }` casts at 178-182 — the Electrobun `BrowserWindow` type is incomplete; should be patched upstream rather than escape-hatched here. dedup:singleton pattern (`let _manager: FloatingChatWindowManager | null` at line 232) repeats in `floating-chat`, `cloud-auth`, `surface-windows` (different shape), and every `native/*` manager. Could be a `singletonGetter()` helper if the layer ever needs one — but probably not worth it.
- [!] `eliza/packages/app-core/platforms/electrobun/src/surface-windows.ts` — 475 LOC. **Most-tested window manager** — has explicit `ManagedWindowLike` / `BoundsStore` injection points so it's unit-testable. Good shape. dedup:`createWindowFn` injection pattern (line 184-208) is the same dependency-injection seam used in `cloud-auth-window.ts` and (less cleanly) `floating-chat-window.ts` — three window managers, three slightly different `Like` interfaces. Could share a `WindowManagerLike` base. types:no `any`. errors:single `/* ignore */` at lines 459-461 around bounds save — legitimate (file lock, cleared during shutdown). slop:per-surface frame defaults at lines 99-109 (eight surfaces × `{x,y,width,height}`) — ordinary config, fine. legacy:`SETTINGS_ACTION_PREFIX = "open-settings-"` lives in `application-menu.ts` instead of here even though `normalizeSettingsTabHint` (137-139) re-encodes the same prefix. Consolidate.
- [!] `eliza/packages/app-core/platforms/electrobun/src/cloud-auth-window.ts` — 216 LOC. dedup:`createWindowFn` injection same shape as `surface-windows.ts` — three window managers, three `Like` interfaces. types:`HostMessageEventLike`, `NavigationEventLike` types (lines 102-110, 128-134) are loose unions reflecting that `electrobun/bun` doesn't export typed event payloads. Fix upstream. slop:`TRUSTED_ELIZA_WINDOW_PRELOAD` template-literal preload (lines 44-84) is ~40 lines of inlined JS to override `window.close` so cloud-auth flows can `postMessage` a close — this is a real piece of code that lives as a string. Promote to a `.preload.js` file and read at runtime, or at least extract to a named const file. errors:`isTrustedElizaUrl` falsy-by-default on URL parse failure (line 97-99) is correct (loud error), but the wrapping `try/catch` is necessary because URL throws — accept.

### Cloud disconnect / menu reset (already-extracted Phase-3 work)

- [!] `eliza/packages/app-core/platforms/electrobun/src/cloud-disconnect-from-main.ts` — 118 LOC. **Already-extracted Phase-3-style module.** Clean dependency injection, good test surface. dedup:re-exports `buildAppMainApiHeaders = buildMainApiHeaders` (line 53) — alias with no callers (search: zero non-self refs). Delete the alias. errors:line 108 `await res.json().catch(() => ({}))` — silently swallows malformed JSON in error responses, then reports `HTTP <status>`; acceptable but worth surfacing the parse failure separately so we can tell "API returned non-JSON 500" from "API returned valid `{error: ...}` 500." boundaries:the API-base candidate selection (`buildMainMenuResetApiCandidates` + `pickReachableMenuResetApiBase`) belongs to the *api-base-owner* the Phase 3 plan calls for; right now it lives in `menu-reset-from-main.ts` and is reused here. Move both helpers to the future `bridge/api-base-owner.ts`.
- [!] `eliza/packages/app-core/platforms/electrobun/src/menu-reset-from-main.ts` — 211 LOC. Pure functions for the menu reset flow; testable; no Electrobun deps. Clean. errors:two `try/catch` blocks in `pollMenuResetAgentStatusJson` (lines 84-99, 100-108) that fall through to `{state: "error"}` on agent-binding failures — legitimate (agent restart in flight). dedup:`MAIN_RESET_API_PROBE_TIMEOUT_MS = 4000`, `MENU_RESET_STATUS_POLL_MS = 1000`, `MENU_RESET_STATUS_MAX_MS = 120_000`, `MENU_RESET_VERIFY_RETRIES = 1` — magic numbers exported as named consts; correct shape. slop:the `MainMenuResetPostConfirmDeps` struct (113-133) has 9 fields, three of which are about pushing API base (`pushEmbeddedApiBaseToRenderer`, `getLocalApiAuthToken`, `resolveApiBaseForStatusPoll`) — same disease as the rest of the layer. The future api-base-owner removes 3 of these 9 fields.

### Runtime layout / permissions / preload

- [!] `eliza/packages/app-core/platforms/electrobun/src/runtime-layout.ts` — 150 LOC. Path resolution helpers for `renderer/` and `bun/preload.js` under packaged macOS/Windows/Linux bundles. dedup:`usesWindowsPathSyntax`, `joinPortable`, `resolveRelativePortable`, `dirnamePortable` are recreated in `windows-cef-profile.ts` (different `chooseFirstExisting` shape), and a similar bundle-detection helper exists in `startup-trace.ts` (`resolveStartupBundlePath`) and `native/permissions-darwin.ts` (`resolveInfoPlistPath`). Consolidate into one `bundle-paths.ts` module.
- [x] `eliza/packages/app-core/platforms/electrobun/src/runtime-permissions.ts` — 124 LOC. Bridges native OS permissions (`AllPermissionsState`) with runtime-only permissions (`website-blocking`, `location`) by fetching from the agent's `/api/permissions/<id>` endpoint. Two narrow `try/catch` blocks (`fetchRuntimePermissionState` lines 86-91; the run-on-shutdown path returns null) — both correct boundary translations. Clean.
- [x] `eliza/packages/app-core/platforms/electrobun/src/preload-validation.ts` — 65 LOC. Reads `preload.js` from disk, throws clear errors if missing/empty/stale relative to `bridge/electrobun-preload.ts`. Pure. Clean.

### Devtools / windows-cef / brand / background notice

- [x] `eliza/packages/app-core/platforms/electrobun/src/devtools-layout.ts` — 63 LOC. Devtools dock/undock layout-fix nudge (resize 1px then restore at 5 specific delays). Pure, testable, well-documented. Three callers in `index.ts`. Clean.
- [!] `eliza/packages/app-core/platforms/electrobun/src/windows-cef-profile.ts` — 124 LOC. Reads bundled `version.json` to decide whether to wipe a Windows CEF profile dir between versions. dedup:`usesWindowsPathSyntax`, `joinPortable`, `resolveRelativePortable`, `resolveBundlePathPortable` — all duplicated with `runtime-layout.ts` and `startup-trace.ts`. **Same axis-name (dedup), same files**. Top consolidation candidate.
- [!] `eliza/packages/app-core/platforms/electrobun/src/brand-config.ts` — 184 LOC. **Likely-bug:** every `envFallback("ELIZA_FOO", "ELIZA_FOO")` call (lines 75, 137, 141, 151, 155, 162) passes the *same env-var name twice*. The function is meant to take a primary key and a legacy fallback (the doc comment at line 13 says "Env precedence: ELIZA_ > ELIZA_ (legacy) > default"), but all six call sites collapse to one key — either the rename from a legacy `MILADY_*` / older alias has been completed and the function call signature wasn't simplified, or somebody mass-renamed both args without checking. Either way: simplify `envFallback("ELIZA_APP_NAME", "ELIZA_APP_NAME")` to `env("ELIZA_APP_NAME")` everywhere or restore the second argument to the actual legacy alias. errors:`loadFileConfig` at lines 83-93 silently `// Ignore malformed or inaccessible brand config and fall back to env/defaults` — a malformed brand config file should surface to the user, not silently default. types:`as Partial<DesktopBrandConfig>` cast at line 88 with no validation — the JSON file could contain anything.
- [x] `eliza/packages/app-core/platforms/electrobun/src/background-notice.ts` — 65 LOC. Pure marker-file helpers. Three exports (`BACKGROUND_NOTICE_MARKER_FILE`, `resolveBackgroundNoticeMarkerPath`, `hasSeenBackgroundNotice`, `markBackgroundNoticeSeen`) are all internal to `showBackgroundNoticeOnce`; only `showBackgroundNoticeOnce` has external callers (`rpc-handlers.ts:345-353`). Could collapse the four helpers into one `showBackgroundNoticeOnce()` body but they're cleanly named and testable as-is. Clean.
- [!] `eliza/packages/app-core/platforms/electrobun/src/print-electrobun-dev-settings-banner.ts` — 140 LOC. Builds a pretty-printed banner of resolved env settings at startup. types:row-builder uses `effective: string` for numbers/booleans — accepted (display-only). Clean. Note: the gating function `shouldPrintElectrobunDevSettingsBanner` at lines 12-18 inspects `import.meta.dir` for `/electrobun/src/` to detect dev mode — fragile (renames break it), but matches the broader Layer-0 banner-system pattern.
- [x] `eliza/packages/app-core/platforms/electrobun/src/diagnostic-format.ts` — 65 LOC. Pure URL/secret redaction helpers. Two exports re-exported through `rpc-handlers.ts` for convenience. Clean.
- [x] `eliza/packages/app-core/platforms/electrobun/src/startup-trace.ts` — 317 LOC. Persists a JSON state file plus an append-only events file for shell-startup diagnostics. Documented phase enum, atomic writes, env-driven, well-tested-shaped. dedup:`resolveStartupBundlePath` duplicates path-extraction logic in `runtime-layout.ts` / `windows-cef-profile.ts`. Otherwise clean.

### `__stubs__/`

- [x] `eliza/packages/app-core/platforms/electrobun/src/__stubs__/bun-ffi.ts` — 35 LOC. Vitest-only stub for `bun:ffi`. Returns false/null from every FFI symbol so the macOS dylib paths don't crash under Node. Documented and correct.

---

### `native/` — wrappers around macOS dylibs, Bun.spawn, OS APIs

- [!] `eliza/packages/app-core/platforms/electrobun/src/native/index.ts` — 106 LOC. Centralized `initializeNativeModules` + `disposeNativeModules`. errors:`Promise.allSettled` with per-manager `console.warn` on failure (lines 73-83) — correct shape for shutdown-best-effort. dedup:the manager list (lines 45-58) is a 13-entry tuple-array hand-maintained next to a separate `setSendToWebview` loop in `initializeNativeModules` (lines 24-40). One declarative registry would replace both.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/agent.ts` — **1835 LOC god module inside the layer**. Embedded-agent supervisor — spawns `entry.js start` as a Bun subprocess, polls `/api/health`, manages restart, port resolution, log-file persistence, bug-report bundle, etc. needs-deeper-sweep:axes apply but this file is its own decomposition project. Top sub-concerns visible: (1) port resolution + free-port allocation, (2) `Bun.spawn` lifecycle with SIGTERM grace, (3) health polling, (4) startup-trace forwarding, (5) bug-report bundle creation, (6) log-tail readback for diagnostics, (7) install inspection (`agentInspectExistingInstall`), (8) local API-token configuration (`configureDesktopLocalApiAuth`). Each is a real module. Mark for deeper Layer-2b sweep.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/desktop.ts` — **2249 LOC god module inside the layer**. Tray + GlobalShortcut + BrowserWindow + Notification + Clipboard + Shell + Updater + path resolution + power state + WebGPU status + session snapshot + bug-report bundle + dock visibility + display info + cursor position + auto-launch + message-box + open-external + file-dialogs + show-item-in-folder + "managed window" surface helpers + steward/release-notes window helpers. needs-deeper-sweep:by far the largest file in the layer. Top sub-concerns visible from imports + the 30+ exported methods on `DesktopManager`: (1) Tray, (2) Shortcut, (3) Window-state queries+writes, (4) Notifications, (5) Clipboard, (6) Shell/external, (7) Updater, (8) Power, (9) Display/cursor, (10) Auto-launch, (11) MessageBox + dialogs, (12) Session, (13) Path resolution + auto-launch settings IO. Each is a real module. Mark for deeper Layer-2b sweep.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/canvas.ts` — 504 LOC. Auxiliary `BrowserWindow` instances for canvas/A2UI/game popouts. Includes the `canvasEval` privileged eval surface (RPC schema documents it as "intentionally unrestricted for agent computer-use"; URL-allow-list at `isInternalCanvasEvalUrl` lines 40-51). types:`as unknown as` cast for the `partition` option (`@ts-expect-error — partition is a valid Electrobun option not yet typed`) at line 86 — upstream type incomplete; accept. dedup:URL-allow-list at lines 25-32 (`isLocalCanvasOrigin`) and 40-51 (`isInternalCanvasEvalUrl`) and (separately) `screencapture.ts:isAllowedCaptureUrl` lines 37-48 — three nearly-identical "allow only localhost/127.0.0.1/file:" predicates across canvas + screencapture. Consolidate into a `local-url-allow-list.ts`.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/screencapture.ts` — 654 LOC. Frame capture via OS CLI tools (`screencapture` / `scrot` / PowerShell), MJPEG streaming to the agent, recording. dead:`setSendToWebview` (lines 61-63) and `setMainWebview` (lines 65-67) and `setCaptureTarget` (lines 82-84) are **all explicitly inert** — comments admit they're "intentionally inert" / "no webview push needed" / retained because rpc-schema still wires them. The schema entry `screencaptureSetCaptureTarget` (rpc-schema.ts:1017-1020) is documented as "Legacy compatibility hook" in the handler (rpc-handlers.ts:759-764). Three setters + one RPC + one handler that are all no-ops — delete all four. dedup:URL-allow-list (`isAllowedCaptureUrl`) overlaps canvas.ts as noted above. needs-deeper-sweep:the file is 654 LOC and warrants its own pass.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/auth-bridge.ts` — 525 LOC. Loopback-only auto-session via Unix socket → POST `/api/auth/desktop-bootstrap` → cookie installation. Well-structured, dependency-injected, testable. dedup:`resolveStateDir` reads `ELIZA_STATE_DIR` and falls back to `~/.<namespace>` — the same state-dir resolution logic exists across the layer in `startup-trace.ts`, `native/agent.ts`, etc. Consolidate. errors:legitimately fails closed throughout — comment promises "Never silent ignore and proceed" and the code keeps that. Clean within scope. needs-deeper-sweep on full pass.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/credentials.ts` — 764 LOC. Auto-detects API keys for Anthropic/OpenAI/etc. from Codex auth.json / Claude credentials.json / macOS keychain. needs-deeper-sweep:the file walks half a dozen vendor-specific credential paths (Codex, Claude, ZAI, OpenAI, etc.). Each vendor is a small module. errors:multiple `try {} catch { return null }` blocks for file/JSON reads — legitimate (missing file is the main path) but should be `existsSync` + read instead of try/catch. types:`extractOauthAccessToken` (lines 30-60) walks `unknown` recursively with no schema; the result is correct but the function would benefit from a typed Claude credentials shape.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/browser-workspace.ts` — 374 LOC. Tab manager backing `browserWorkspaceOpenTab`/etc. RPC surface AND the `browser-workspace-bridge-server.ts` HTTP surface. dedup:two delivery channels (RPC + HTTP) for the same operations — at least the bridge server should call the manager directly (it does, via `getBrowserWorkspaceManager()`). Worth verifying that the RPC path and the HTTP path normalize URLs the same way. types:`assertBrowserWorkspaceUrl` does proper URL parsing — clean. needs-deeper-sweep on full pass.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/editor-bridge.ts` — 292 LOC. Detects native editors (VS Code, Cursor, etc.) via `which` + path-candidate scan. Singleton + active-session. Clean within scope. dedup:`spawnSync(["which", name])` is a "is binary installed" check that recurs across the layer (credentials.ts, music-player resolution, screencapture cli detection); could be a `is-binary-installed.ts` helper.
- [x] `eliza/packages/app-core/platforms/electrobun/src/native/file-watcher.ts` — 220 LOC. `fs.watch` recursive on macOS/Windows, per-directory simulation on Linux. Debounce + ignored-dirs allow-list. Clean.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/gateway.ts` — 217 LOC. mDNS/Bonjour gateway discovery. errors:dynamic-import of `bonjour-service` / `bonjour` / `mdns-js` (lines 39-53) with `try {} catch {}` per package and final warn — legitimate (package may not be installed). dedup:the "try N candidate packages" pattern recurs (credentials, whisper) — could be a small helper `tryDynamicImport(packages: string[])`.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/gpu-window.ts` — 301 LOC. `GpuWindow` + `WGPUView` (Dawn WebGPU). Singleton + maps for windows + views. Clean within scope. needs-deeper-sweep on full pass.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/location.ts` — 110 LOC. **Coarse-only** geolocation via `ip-api.com` and `ipapi.co`. errors:`for url of IP_GEO_SERVICES { try {...} catch {} }` (lines 43-61) silently swallows fetches; acceptable for "best-effort coarse fix" but each failure should at least debug-log so the location plugin can tell why a fix is unavailable. boundaries:this file lives in `native/` but does no native work — it's pure HTTP. Should arguably move out of `native/`.
- [x] `eliza/packages/app-core/platforms/electrobun/src/native/mac-window-effects.ts` — 117 LOC. Bun:ffi wrapper around `libMacWindowEffects.dylib`. Lazy-loads, returns `false` on dylib-missing platforms. Clean.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/music-player.ts` — 61 LOC. Resolves desktop URLs for the elizaOS plugin-music-player HTTP routes. **Production reachable from one renderer hook** (`packages/app-core/src/hooks/useMusicPlayer.ts:92`). Clean within scope. boundaries:this is an URL-resolver, not a native concern; `native/` is the wrong folder.
- [x] `eliza/packages/app-core/platforms/electrobun/src/native/permissions.ts` — 192 LOC. PermissionManager facade. Lazy-imports the platform module (so darwin's bun:ffi never loads on Linux). Clean.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/permissions-shared.ts` — 94 LOC. dedup:re-exports types from `@elizaos/shared` AND defines its own `AllPermissionsState` (line 18) noted as "local variant uses an index signature (the canonical contract uses explicit keys)" — same comment in `rpc-schema.ts:237`. Three definition sites for one type, all documented as intentionally divergent. Document but accept.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/permissions-darwin.ts` — 342 LOC. Bun:ffi against the dylib + TCC.db sqlite reads + `Bun.spawn` to `open` for privacy panes. types:`as NativePermissionsLib` cast at line 60 — bun:ffi doesn't infer; accept. errors:two narrow `try {}/catch { return null }` for sqlite + dylib load — correct. dedup:`resolveRuntimeBundleIdentifier` walks `Info.plist` — same parse as could be done in `runtime-layout.ts`'s bundle resolver.
- [x] `eliza/packages/app-core/platforms/electrobun/src/native/permissions-linux.ts` — 34 LOC. Stubs everything to `granted`/`not-applicable`. Clean.
- [x] `eliza/packages/app-core/platforms/electrobun/src/native/permissions-win32.ts` — 56 LOC. Opens `ms-settings:privacy-*` URIs. Clean.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/power-state.ts` — 195 LOC. Pure parsers for `pmset`/`scutil`/`xprintidle`/PowerShell stdout. Well-tested-shaped. Pure functions. Clean within scope.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/steward.ts` — 347 LOC. Steward sidecar lifecycle. dedup:`SendToWebviewFn` redeclared (line 30) instead of importing `SendToWebview` from `../types.js` — small but a type-divergence smell. dedup:the lazy-import pattern (lines 41-57) for the two `@elizaos/app-core/services/steward-*` modules is a workaround for ESM import-cycle prevention; the comment doesn't say so. errors:two `try {}/catch {}` around module-load — same shape as `gateway.ts`. needs-deeper-sweep on full pass.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/swabble.ts` — 349 LOC. Wake-word detection via whisper.cpp. errors:multiple `try {}/catch {}` for whisper subprocess — needs structured error reporting. needs-deeper-sweep on full pass.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/talkmode.ts` — 441 LOC. ElevenLabs TTS + Whisper STT. dedup:audio-buffer accumulation logic mirrors `swabble.ts` (16k mono Float32 chunks → WAV → whisper.cpp); could be a shared `audio-pipeline.ts`. needs-deeper-sweep on full pass.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/webgpu-browser-support.ts` — 220 LOC. Detects Chrome Beta install + reports WebGPU availability. Clean within scope. types:`process.env.LOCALAPPDATA ?? ""` (line 39) — empty-string fallback then `path.join` produces nonsense paths; should `if (!localAppData) return null`.
- [!] `eliza/packages/app-core/platforms/electrobun/src/native/whisper.ts` — 280 LOC. Whisper.cpp binary discovery + WAV write + spawn-based transcription. dead:`_resetWhisperCache` (line 69) is a test-only hook with no callers in this audit's grep — verify before removal. dedup:audio-pipeline shape duplicates with `swabble.ts` and `talkmode.ts` as noted.

---

## Summary — Layer 2 audit findings

### Bridge consolidation map

The renderer-and-test-tooling-facing surface area is **not one bridge**. It's
this set:

| # | Surface | Transport | Auth | Lifecycle | Owns |
|---|---------|-----------|------|-----------|------|
| 1 | **Electrobun RPC bus** | WebSocket via `Electroview.defineRPC` | none (in-process bridge) | webview alive | the typed `ElizaDesktopRPCSchema` — 200+ requests + 30+ messages |
| 2 | **HTML inject** (`index.ts:843-861`) | initial HTTP response body | none (production-domain trust) | first page load only | `__ELIZA_API_BASE__` + `__ELIZA_API_TOKEN__` + boot-config (3 globals) |
| 3 | **Renderer log mirror** (`bridge/electrobun-direct-rpc.ts:231-428`) | piggybacks on RPC bus (calls `rendererReportDiagnostic`) | n/a | webview alive | console + window.onerror + unhandledrejection + fetch wrap + XHR wrap |
| 4 | **Static renderer HTTP server** (`index.ts:786-986`) | Bun.serve loopback | none (loopback) | shell process alive | serves `renderer/`, `/api` proxy, `/ws` proxy, `/music-player` proxy, HTML inject |
| 5 | **Browser-workspace bridge server** (`browser-workspace-bridge-server.ts`) | http loopback (port 31340+) | Bearer token in env | shell process alive | `/tabs`, `/tabs/<id>`, `/tabs/<id>/{navigate,eval,show,hide,snapshot}` |
| 6 | **Desktop test bridge server** (`desktop-test-bridge-server.ts`) | http loopback (port 31341+) | Bearer token in env | shell process alive (gated) | `/state`, `/main-window/eval`, `/main-window/screenshot`, `/menu-action` |
| 7 | **Screenshot dev server** (`screenshot-dev-server.ts`) | http loopback (port 31339) | Bearer token in env (optional) | shell process alive (gated) | `GET /cursor-screenshot.png` |

**Recommended consolidation:**

- **Merge #4 + #2 inline** — the static HTTP server is the only producer of
  the HTML inject; move `injectApiBaseIntoHtml` from `index.ts:843` to live
  inside the static-server module and have `bridge/api-base-owner.ts` call
  one function on the static server (`setApiBaseForInject(base, token)`)
  rather than the static server reading a closure.
- **Promote #5 + #6 + #7's loopback-server scaffold** to one
  `bridge/loopback-server.ts` helper that owns `isLoopback`, `json`,
  `readJsonBody`, `isAuthorized`, `findFirstAvailableLoopbackPort` glue,
  and env-truthy normalization. Each of the three bridge servers becomes
  ~50 LOC of routes only.
- **Extract #3** (renderer log mirror) into its own
  `bridge/renderer-log-mirror.ts` so the API-base + RPC dispatch in
  `electrobun-direct-rpc.ts` stays small. The mirror is a complete
  observability subsystem (console/error/fetch/XHR wraps) that has nothing
  to do with the API-base destination handler.
- **Production gating:** `startBrowserWorkspaceBridgeServer()` is **not**
  gated by `NODE_ENV` — `index.ts:2158` calls it unconditionally. The
  endpoint is loopback + bearer-token but every additional production HTTP
  surface increases attack area; gate behind `ELIZA_BROWSER_WORKSPACE_*`
  env presence (analogous to `desktop-test-bridge-server.ts:69-75`).

### API-base push surfaces — final tally

Layer 1 named **5 source push surfaces** in main process. Layer 2 confirms
that count is correct and adds **renderer-side destination fan-out** as a
distinct concern:

| Phase | Source code site | What it does |
|-------|------------------|--------------|
| Sources (5, all in main process) | `index.ts:330` — push at first-paint after dom-ready | RPC `apiBaseUpdate` |
| | `index.ts:843` — HTML inject before first JS runs | `__ELIZA_API_BASE__` + `__ELIZA_API_TOKEN__` + boot-config (3 globals) |
| | `index.ts:1504` — push on agent-status onChange | RPC `apiBaseUpdate` |
| | `index.ts:1516` — push to detached/surface windows | RPC `apiBaseUpdate` (loop) |
| | `index.ts:1648` — push after desktop-session prime | RPC `apiBaseUpdate` |
| Destination dispatcher (1, in renderer preload) | `bridge/electrobun-direct-rpc.ts:94-112` (`dispatchMessage("apiBaseUpdate", ...)`) | writes 3 globals on every arrival: `__ELIZA_API_BASE__`, `__ELIZA_API_TOKEN__`, `BOOT_CONFIG_WINDOW_KEY` + `BOOT_CONFIG_STORE_KEY` |

**Disease shape, restated:** **5 sources → 1 dispatcher → 3 globals.** The
right Phase-3 module is `bridge/api-base-owner.ts` that owns *both* the
HTML inject path *and* the RPC push path on the source side, and the
renderer dispatcher reduces to one storage target (the Symbol-keyed
boot-config slot) with the legacy `__ELIZA_*` globals deleted from
renderer code.

### Top deletion candidates (verified against the layer)

Each verified by grep across the layer; lower-confidence items marked.

| # | Symbol/file | Verification | Confidence |
|---|------------|--------------|------------|
| 1 | `screencaptureSetCaptureTarget` RPC method (rpc-schema.ts:1017-1020) + handler (rpc-handlers.ts:759-764) + `setCaptureTarget` setter (screencapture.ts:82-84) | Comment chain explicitly says "intentionally inert" and "Legacy compatibility hook." No real callers — the renderer popout code that originally needed it is gone. | High |
| 2 | `setMainWebview` setter on ScreenCaptureManager (screencapture.ts:65-67) | Doc comment: "Native CLI capture does not use the webview reference; retained for RPC compat." | High |
| 3 | `setSendToWebview` on ScreenCaptureManager (screencapture.ts:61-63) | Same comment chain — "Screen capture posts directly to the HTTP endpoint; no webview push needed." | High |
| 4 | `EMPTY_HEARTBEAT_MENU_SNAPSHOT` const + `HeartbeatMenuSnapshot` type + `heartbeatSnapshot` parameter in `buildApplicationMenu` + the module-level `heartbeatMenuSnapshot` in `index.ts` + `fetchHeartbeatMenuSnapshot` + `refreshHeartbeatMenuSnapshot` | Doc comment in application-menu.ts:299 explicitly says "currently unused since the per-surface menus that displayed live heartbeat counts were folded into the unified Apps menu." Five chained dead pieces. | High |
| 5 | `buildAppMainApiHeaders` alias (cloud-disconnect-from-main.ts:53) | `grep buildAppMainApiHeaders` returns only the definition. Zero callers. | High |
| 6 | `isOpen()` method on `FloatingChatWindowManager` (floating-chat-window.ts:223) | `grep floatingChat.isOpen` returns no callers; `getStatus().open` is used instead. | High |
| 7 | `_resetWhisperCache` (whisper.ts:69) | Comment says "only for testing"; no test-file callers in this layer's grep — verify in the test tree before removal. | Medium |
| 8 | The `FloatingChatStatus` interface in `floating-chat-window.ts:28-33` (duplicated with `rpc-schema.ts:362-367`) | `floating-chat-window.ts` should `import type { FloatingChatStatus } from "../rpc-schema"`. Delete the local interface. | High |
| 9 | `CHANNEL_TO_RPC_METHOD` + `PUSH_CHANNEL_TO_RPC_MESSAGE` + `RPC_MESSAGE_TO_PUSH_CHANNEL` (rpc-schema.ts:1445-1776) | These are explicit "legacy colon-separated channel names → camelCase RPC method names" maps. Verify whether any caller still uses the legacy `desktop:foo` strings; if not, ~330 LOC of legacy-bridge dead weight. | Medium |
| 10 | `BACKGROUND_NOTICE_MARKER_FILE`, `resolveBackgroundNoticeMarkerPath`, `hasSeenBackgroundNotice`, `markBackgroundNoticeSeen` exports (background-notice.ts) | All three sub-helpers are only used by `showBackgroundNoticeOnce` in the same file. Could be private (collapse from 4 exported functions to 1). Not a deletion per se — a privacy reduction. | Medium |

### Phase 3 module-split shape revisited

MASTER.md §3 names 4 Phase-3 modules: `api-base-owner`, `heartbeat-menu`,
`desktop-session`, `agent-supervisor`. Layer 2 reveals that **a lot of the
extraction work is already done** — Layer 1 named 11+ candidate extracts
inside `index.ts` and several of them already exist as standalone files:

| Layer-1 candidate | Status in Layer 2 |
|-------------------|-------------------|
| Heartbeat menu refresh + snapshot fetch | **Partially extracted** — `application-menu.ts` owns the menu shape; the snapshot fetch + module-level state still lives in `index.ts:115-117, 363-473`. AND the `heartbeatSnapshot` parameter is now annotated dead. **Recommendation: don't build `heartbeat-menu.ts` — delete the dead concept.** |
| Application-menu reset (reachability + reset POST + restart + status poll) | **Already extracted** to `menu-reset-from-main.ts` (211 LOC, well-tested-shaped). |
| macOS window effects + native chrome alignment | Lives in `native/mac-window-effects.ts` (the dylib wrapper); the *application* of effects to the main window still lives in `index.ts:475-554`. Half done. |
| Window-state persistence (main window) | Still in `index.ts:556-638`. |
| App-window bounds store | **Already extracted** as the `BoundsStore` interface in `surface-windows.ts:52-55`; the `index.ts` writer is the `boundsStore` implementation passed to `SurfaceWindowManager`. Done. |
| Static renderer HTTP server + API proxy + HTML inject | Still inline in `index.ts:786-986`. `renderer-static.ts` only owns asset resolution. Largest single remaining extraction. |
| Main-window lifecycle | Still in `index.ts:1011-1240`. |
| Config import/export from menu | Still in `index.ts:1262-1360`. |
| RPC wiring + API-base injection | **The Phase-3 `api-base-owner` extraction.** Highest leverage. |
| Desktop session priming + cookie install | `native/auth-bridge.ts` already exists with the heavy lifting; `index.ts:1565-1610` is a thin call into it. Half done — the prime+cookie-install flow inside `index.ts` could move into `auth-bridge.ts` as a top-level `primeDesktopSessionAuth(apiBase, partition)` function. |
| Embedded agent supervisor | The supervisor *manager* is `native/agent.ts` (1835 LOC). The supervisor *callers* in `index.ts:1612-1659, 2168-2191, 2371-2386` could collapse to a single `subscribeToAgentLifecycle(callback)` call. Mostly done; needs glue collapse. |
| OS-permission sync to REST API | Still in `index.ts:1531-1548` plus `runtime-permissions.ts`. The `index.ts` glue (`syncPermissionsToRestApi`) is also duplicated as a private function in `rpc-handlers.ts:66-87`. Two implementations of the same PUT. |
| Updater + giant menu-action handler | `application-menu-action-registry.ts` is the **half-built dispatcher**. The 200-LOC `handleApplicationMenuAction` switch in `index.ts` should be broken into a `Record<string, MenuAction>` and registered into this file. Phase 3e is "finish the registry," not "build it." |
| Deep-link handling | Still in `index.ts:1921-1967`. |
| Shutdown cleanup | Still in `index.ts:1975-1989`. `disposeNativeModules` in `native/index.ts` already exists and does most of the actual work. |
| Env loading + dev/packaged detection | Still in `index.ts:2002-2029`. |
| WebGPU init + browser support check | `native/webgpu-browser-support.ts` already exists. The `index.ts:2031-2074` glue should call into it once. |
| Startup crash report | Still in `index.ts:2393-2540`. `startup-trace.ts` already exists for the live-trace; the crash-report builder is separate and inline. |
| Tray creation | Still in `index.ts:2289-2323`. |

**Revised Phase 3 shape:** the four named extracts in MASTER.md §3 should
become **four named extracts plus the registry-completion sweep**:

1. **`bridge/api-base-owner.ts`** — owns 5 sources + dispatch. Highest
   leverage. Removes the bug class.
2. **Drop `bridge/heartbeat-menu.ts`** — the concept is dead. Delete the
   parameter, const, and three helpers in `index.ts`.
3. **`bridge/desktop-session.ts`** — promote `primeDesktopSessionAuth`
   from `index.ts` into `native/auth-bridge.ts` as a top-level export.
   Cookie-install jar adapter goes with it.
4. **`bridge/agent-lifecycle.ts`** — small glue around
   `getAgentManager().status.onChange(...)`; replaces the 4 inline
   subscription sites in `index.ts`.
5. **Phase 3e: finish `application-menu-action-registry.ts`.** Break the
   200-LOC `handleApplicationMenuAction` switch into individual action
   modules, register each into the registry, and let
   `desktop-test-bridge-server.ts` call them through the registry as
   today.
6. **Phase 3f (sweep): consolidate the 4 loopback HTTP servers' shared
   scaffold** into `bridge/loopback-server.ts`.

### Cross-cutting findings

- **Layer-wide path-resolution duplication.** `usesWindowsPathSyntax`,
  `joinPortable`, `resolveRelativePortable`, `dirnamePortable`, the
  `.app`-bundle detection in `resolveStartupBundlePath` /
  `resolveBundlePathPortable` / `resolvePackagedBundlePath` /
  `resolveInfoPlistPath` — at least four functions doing the same Mac-app
  bundle path extraction across `runtime-layout.ts`,
  `windows-cef-profile.ts`, `startup-trace.ts`, and
  `native/permissions-darwin.ts`. Single `bundle-paths.ts` would replace
  all four.
- **Layer-wide URL-allow-list duplication.** `isLocalCanvasOrigin`,
  `isInternalCanvasEvalUrl`, `isAllowedCaptureUrl`, `isLoopback` —
  variants on "is this URL/address loopback-only" appear in canvas,
  screencapture, and four loopback servers.
- **Layer-wide singleton+factory pattern.** Every `native/*` manager
  follows `let _x: X | null = null; export function getX() { ... }`.
  Plus `floating-chat-window`, `cloud-auth-window`. ~15 instances. Not
  worth a helper, but worth noting that the layer leans hard on
  module-level mutable state (which is what makes `index.ts` fragile to
  begin with).
- **Brand-config `envFallback` smells like a half-completed rename.**
  Every call site passes the same env-var name twice, defeating the
  fallback. Either fix the call sites (use `env(key)` directly) or
  restore the legacy aliases the function was designed for. Verify with
  git blame before changing — could be either direction.
- **Three `unknown`-typed wire fields belong to typed concepts:**
  `swabbleGetConfig` returns `Record<string, unknown>` even though
  `SwabbleConfig` exists in `native/swabble.ts`; `talkmodeSpeak.directive`
  is `Record<string, unknown>` for what is actually a `TalkModeDirective`
  shape; `desktopCreateBugReportBundle.reportJson` is
  `Record<string, unknown>` for a structured bug-report shape that lives
  in `native/agent.ts`. Each is fixable today.

### Risks / things needing user judgment

1. **The `CHANNEL_TO_RPC_METHOD` map (~330 LOC of legacy
   colon-separated names).** Cannot be confidently deleted from inside
   this layer alone — *any* renderer-side caller still using the legacy
   `desktop:foo` strings would break. A repo-wide grep is required
   before deletion. This is the single biggest possible cleanup in the
   layer.
2. **`native/desktop.ts` and `native/agent.ts` are god modules in their
   own right.** Each warrants a Layer-2b deep sweep. This audit marks
   them `[!]` with `needs-deeper-sweep` rather than pretending eight
   axes have been applied line-by-line to 4084 LOC of code.
3. **The brand-config legacy-alias collapse.** Without git blame, it's
   not safe to say "`envFallback("ELIZA_APP_NAME", "ELIZA_APP_NAME")`
   should be `env("ELIZA_APP_NAME")`" — the second arg may have been a
   `MILADY_APP_NAME` (or older `ELIZAOS_APP_NAME`) that some external
   user is still setting. Investigate.
4. **The `BrowserWorkspaceSnapshot` import from
   `@elizaos/agent/services/browser-workspace-types` in `rpc-schema.ts`.**
   The schema is supposed to be the wire contract; reaching into the
   agent for DTO shape is a boundary violation. Fixing it requires
   declaring the wire shapes locally and having the agent map — that's a
   Layer 4/6 coordination task, not Layer 2.
5. **`startBrowserWorkspaceBridgeServer()` runs in production**
   (loopback + bearer token, but unconditional). Compare with the
   `screenshot-dev-server` and `desktop-test-bridge-server` env-gating
   patterns and decide whether the browser-workspace bridge should be
   similarly gated. Likely yes, but breaks any production flow that
   depends on the HTTP bridge.

### One surprise

**`application-menu-action-registry.ts` exists but is functionally a hook
for the test bridge, not a real action registry.** The 21-LOC module
holds a single null-typed handler; the giant 200-LOC menu-action switch
in `index.ts` is registered as that handler in one shot. The `invoke`
function has exactly one external caller — the test bridge server. The
registry pattern Phase 3e wants is therefore *almost trivial to land*
because the seam already exists; you just need to break the switch into
named handlers and register them individually instead of registering one
all-handlers function. The hard work everyone assumed Phase 3e would
have to do is mostly done.
