# Layer 9 — Onboarding + bridge

**Files: 15.**
**Audited: 15 / 15.**
**Refactored: 0 / 15.**

Two directories audited together because Layer 9 is small and depends
heavily on Layer 8:

1. `onboarding/` (7 files, ~610 LOC) — pure onboarding-flow resolution + the four mobile/local-runtime helpers (probe, pre-seed, mobile mode, picker reload, server-target enum, native local-agent token).
2. `bridge/` (8 files, ~1840 LOC) — **renderer-side** native plugin and Electrobun-RPC bridges. **Important: NOT the same as the `bridge/api-base-owner.ts` Phase 3 target.** See "Bridge name overload" below.

## Why this layer right after Layer 8

- Onboarding consumes Layer 8's `state/persistence.ts` for resume/step
  storage, Layer 8's startup-coordinator for the runtime-target events,
  and Layer 8's `useOnboardingState` / `useOnboardingCallbacks` hooks
  for wiring. Phase 2 tasks 12-14 thread through *both* layers and
  cannot complete until Layer 8 is mapped — which it now is.
- The `bridge/` package owns the renderer-side plugin shims and the
  Electrobun-RPC client. It's the renderer's window into the native
  shell, not the shell itself (Layer 2). Phase 3's electrobun-side
  decomposition does NOT touch this layer.

## Bridge name overload — the disambiguation

Three things in this codebase are called "bridge." Mixing them up will
mislead Phase 3's extraction work.

| Name                                          | Lives in                                                | Owns                                                         | Audited in    |
|-----------------------------------------------|---------------------------------------------------------|--------------------------------------------------------------|---------------|
| `eliza/packages/app-core/src/bridge/`         | **Renderer / app-core**                                 | Renderer↔native plugins (Capacitor + Electrobun-RPC client). Lives in the renderer bundle; *consumes* RPC. | **Layer 9 (this file).** |
| `eliza/packages/app-core/platforms/electrobun/src/bridge/` (planned) | **Electrobun main process**                          | Phase 3 target: api-base-owner, heartbeat-menu, desktop-session, agent-supervisor. Lives in the Electrobun main process; *serves* RPC. | Layer 2 (extraction map in Layer 1 audit). |
| `state/handle-reset-applied-from-main.ts`     | **Renderer**                                            | Conduit for menu-reset events arriving from the main process. Not literally named "bridge" but plays the role. | Layer 8.       |

Same word, three concepts, opposite ends of the IPC wire. Always say
which one.

## What to look for in this layer specifically

- **Onboarding bootstrap** — the fresh-install → "lands in chat" flow.
  Phase 2 tasks 13 (Use local atomic) and 14 (collapse reset cascade)
  thread through the onboarding callback layer (Layer 8) but the *flow
  graph* lives here in `flow.ts`.
- **Probe local agent edge cases** — `probe-local-agent.ts` is the
  only async gating signal for the Local tile in `RuntimeGate`.
- **Three near-duplicate `tryLocalStorage` patterns** — `mobile-runtime-mode.ts`, `pre-seed-local-runtime.ts`, `reload-into-runtime-picker.ts` each inline a try/catch around localStorage; same block as Layer 8's `state/persistence.ts:25-32` and `state/agent-profiles.ts:18-25`. Five copies total.
- **Bridge file ownership clarity** — the 8 files in `bridge/` overlap
  in confusing ways: `electrobun-rpc.ts` owns the RPC shape;
  `electrobun-runtime.ts` owns the runtime detection;
  `capacitor-bridge.ts` owns the global `window.Eliza`; `plugin-bridge.ts`
  owns the wrapped-plugin facade; `native-plugins.ts` owns the per-plugin
  type bindings; `gateway-discovery.ts` owns one specific plugin call;
  `storage-bridge.ts` owns the localStorage→Capacitor Preferences mirror.

## Status legend

`[ ] pending  [~] reading  [!] findings  [*] refactor  [x] clean  [-] delete  [?] blocked`

---

### onboarding/ (7 files, ~610 LOC)

- [!] `onboarding/flow.ts` — 141 LOC. **The pure onboarding flow graph.** 3-step linear flow (`deployment` → `providers` → `features`). Pure functions: `getStepOrder`, `resolveOnboardingNextStep`, `resolveOnboardingPreviousStep`, `canRevertOnboardingTo`, `getOnboardingNavMetas`, `shouldUseCloudOnboardingFastTrack`, `getFlaminaTopicForOnboardingStep`. errors:none — all pure. dead:`shouldSkipFeaturesStep` (lines 100-107) is a hardcoded `return false` with `void args` — the function exists but does nothing. Per its own doc comment ("The current wizard always shows features so local capabilities such as Browser and Wallet can be chosen for local, remote, and cloud agents") it's a **kept-for-symmetry no-op**. Two paths: keep + document, or delete and inline `false` at all callers. types:`onboardingServerTarget: string` (line 105) is weakly typed — should be `OnboardingServerTarget` from `server-target.ts`. boundaries:correctly pure; clean conceptually.
- [!] `onboarding/probe-local-agent.ts` — 156 LOC. **The only async gate for the "Local Agent" tile in `RuntimeGate`.** Owns dual cache (positive 30s TTL + negative 3s TTL — design tradeoff well-documented at lines 20-26), `inflight` deduplication map, dual-shape body acceptance for `{ok:true}` AND `{ready:true}` AND `{agentState:"running"}` (lines 99-115 — handles spike-stub vs real-agent shapes). errors:every fetch failure path returns `false` (lines 71-87, 92-95) — appropriate for a liveness probe (failure modes: network error, timeout, non-200, non-JSON, missing field — all map to "not ready"). dedup:none. types:`runProbe` returns `Promise<boolean>` cleanly; `body` cast at line 107 is the only structural-type narrowing. boundaries:hardcodes `DEFAULT_LOCAL_AGENT_HEALTH_URL = "http://127.0.0.1:31337/api/health"` (line 17-18). **This is the same MASTER.md §0 hardcoded port class as `RuntimeGate.tsx:LOCAL_AGENT_API_BASE`** — but here it's defensible because it's the DEFAULT_LOCAL_AGENT URL and callers can override via the `url` parameter. Status: **probe is complete and correct**; no edge cases missed in the audit.
- [!] `onboarding/pre-seed-local-runtime.ts` — 92 LOC. **AOSP ElizaOS-only helper** that pre-writes `mobile-runtime-mode = "local"` + `active-server = local:android` on fresh install so the picker auto-completes. dedup:**imports `ACTIVE_SERVER_STORAGE_KEY` as a literal** (line 33) instead of importing from `state/persistence.ts:ACTIVE_SERVER_STORAGE_KEY`. The file's header comment (lines 11-19) explicitly justifies this: importing from `state/persistence` would pull in the entire UI state graph and create a cycle through `bridge/storage-bridge`. **Legitimate boundary marker** — keep, but consider extracting `ACTIVE_SERVER_STORAGE_KEY` to a tiny shared constants file (`state/storage-keys.ts`) so both this file and `state/persistence.ts` can import from one place without dragging the UI graph. errors:two bare `try/catch` swallowing localStorage failures (lines 36-50, 60-67) — defensible (embedded shells without localStorage). slop:none.
- [!] `onboarding/reload-into-runtime-picker.ts` — 40 LOC. **Settings → Switch runtime helper.** Same dedup pattern as above: imports both `ACTIVE_SERVER_STORAGE_KEY` and `MOBILE_RUNTIME_MODE_STORAGE_KEY` as literals (lines 17-18) for the same cycle-avoidance reason. dedup:exports a `__TEST_ONLY__` re-export of the two literals (lines 37-40) — three places encode the same two strings (this file, `pre-seed-local-runtime.ts`, `state/persistence.ts` + `mobile-runtime-mode.ts`). errors:one bare `try/catch` (lines 23-31) — defensible, same reasoning as above.
- [!] `onboarding/mobile-runtime-mode.ts` — 85 LOC. **The `MOBILE_RUNTIME_MODE_STORAGE_KEY` SoT** — exports the constant + `readPersistedMobileRuntimeMode` + `persistMobileRuntimeModeForServerTarget`. dedup:hardcodes `ANDROID_LOCAL_AGENT_API_BASE = "http://127.0.0.1:31337"` (line 12) — same loopback string as Layer 1's `LOCAL_AGENT_API_BASE` from `RuntimeGate.tsx`, same as `probe-local-agent.ts:18`'s `DEFAULT_LOCAL_AGENT_HEALTH_URL`. Three places encode the loopback default. boundaries:correctly leaf module; pure typed wrapper.
- [!] `onboarding/local-agent-token.ts` — 71 LOC. **Native bridge to read the on-device agent's local-only auth token** (Capacitor `@elizaos/capacitor-agent` plugin). Used to hydrate the apiToken when calling loopback from a native Android shell. errors:two bare `try/catch` returning `null`/`false` (lines 31-37, 47-51) — appropriate (the plugin may not be installed; failures map to "no native token available"). types:`AgentWithLocalToken` (lines 8-13) is a structural-type fallback — the actual `@elizaos/capacitor-agent` plugin should be a typed import. **boundaries:writes to two stores per token hydration** (lines 68-69): `setBootConfig({ ...getBootConfig(), apiToken: token })` AND `setElizaApiToken(token)` (the legacy `__ELIZA_API_TOKEN__` window global). Same dual-store pattern Layer 1 flagged: typed boot-config slot + window-global mirror. **One owner.**
- [x] `onboarding/server-target.ts` — 25 LOC. The `OnboardingServerTarget` literal union (`"" | "local" | "remote" | "elizacloud" | "elizacloud-hybrid"`) + two helpers. Clean.

### bridge/ (8 files, ~1840 LOC)

- [x] `bridge/index.ts` — 6 LOC barrel. Clean.
- [!] `bridge/storage-bridge.ts` — 169 LOC. **The localStorage → Capacitor Preferences mirror for iOS** (where WKWebView localStorage can be purged under memory pressure). Owns: `SYNCED_KEYS` set (7 keys), in-memory cache `preferencesCache`, monkey-patches `window.localStorage.{setItem,getItem,removeItem}` (lines 78-118) on native platforms. errors:two `console.error` calls (lines 94, 116) inside the patched setters — commandment-9 violation, but acceptable here because this code runs *before* the structured logger is wired (it's part of the bootstrap). dead:none — every `SYNCED_KEYS` member is verified to be a real key. **boundaries:this file IS the iOS persistence story** — without it, every Layer 8 `setItem` would silently lose data on memory pressure. Critical infra. types:clean. **Phase 2 task 12 implication:** when `eliza:onboarding-complete` migrates to vault, this file's `SYNCED_KEYS` should drop the key — vault is its own persistence; double-mirror is wrong.
- [!] `bridge/electrobun-rpc.ts` — 156 LOC. **The renderer-side Electrobun-RPC client.** Owns: `ElectrobunRendererRpc` interface, `getElectrobunRendererRpc()` (reads `window.__ELIZA_ELECTROBUN_RPC__`), `invokeDesktopBridgeRequest`, `invokeDesktopBridgeRequestWithTimeout`, four typed wrappers (`scanProviderCredentials`, `inspectExistingElizaInstall`, `getDesktopRuntimeMode`, `subscribeDesktopBridgeEvent`). types:`DesktopBridgeTimeoutResult` discriminated union (lines 49-53) is the **right pattern for "missing RPC vs timeout vs rejection vs ok"** — every caller must explicitly handle each case. Excellent. errors:`invokeDesktopBridgeRequestWithTimeout` (lines 59-100) is a careful Promise.race with cleanup of the timer in every path — solid. dedup:none. boundaries:correctly leaf module; this is the canonical RPC client surface. **Note:** the Phase 3 `bridge/api-base-owner.ts` extraction (Layer 1's MASTER.md §1 finding) lives on the **other side** of the wire — it owns the *server* of the RPC; this file is the *client*. Don't conflate.
- [!] `bridge/electrobun-runtime.ts` — 63 LOC. **Runtime detection for "are we inside Electrobun?"** Two strategies: (a) check `window.__electrobunWindowId` / `window.__electrobunWebviewId` from the Electrobun preload, (b) if those aren't set yet, check whether the RPC bridge `__ELIZA_ELECTROBUN_RPC__` is present (lines 40-46 — explicit comment that the preload may inject the RPC before the window IDs). dedup:hardcodes `getBackendStartupTimeoutMs()` magic numbers (180_000 for desktop + ElizaOS, 30_000 for everyone else, lines 49-63) — this overlaps with `state/startup-coordinator.ts:createDesktopPolicy().backendTimeoutMs` (180_000), `createElizaOSPolicy().backendTimeoutMs` (180_000), `createMobilePolicy().backendTimeoutMs` (15_000), `createWebPolicy().backendTimeoutMs` (30_000). **Two source-of-truth definitions for backend startup timeout** — the policy in `startup-coordinator.ts` is platform-keyed and structured; this `getBackendStartupTimeoutMs()` is the legacy way and should call into the policy.
- [!] `bridge/capacitor-bridge.ts` — 297 LOC. **The `window.Eliza` global bridge.** Owns: `getCapabilities`, `haptics` wrapper (12 methods around Capacitor `@capacitor/haptics`), plugin registry (`registerPlugin`/`getPlugin`/`hasPlugin`), `createBridge()` that builds the `ElizaBridge` singleton, `initializeCapacitorBridge` + `waitForBridge`. errors:`registerPlugin` at line 182 has `console.log` — commandment-9 violation. dedup:**`isDesktopPlatform()` (line 32-34), `isWebPlatform()` (line 36-38), `_isWebPlatform()` (`plugin-bridge.ts:45`), `_isMacOSPlatform()` (`plugin-bridge.ts:49`)** — five platform-detection helpers across two files in this layer alone. boundaries:writes to `window.Eliza` global (line 272) + dispatches a `BRIDGE_READY_EVENT`. Correct (this is the entry point for the renderer to find the bridge). types:`pluginRegistry: Map<string, PluginInstance>` where `PluginInstance = Record<string, unknown>` (line 174-175) — the runtime plugin registry is `unknown`-typed. The strongly-typed surfaces in `native-plugins.ts` aren't enforced at registration time.
- [!] `bridge/plugin-bridge.ts` — 417 LOC. **The wrapped-plugin facade with capability detection.** Owns: `PluginCapabilities` interface (12 plugin domains), `getPluginCapabilities()`, web-API detection helpers (`hasWebSpeechAPI`, `hasWebSpeechSynthesis`, `hasMediaDevices`, `hasGeolocation`, `hasDisplayMedia`), `wrapPlugin()` Proxy that adds error logging (lines 227-249), `getPlugins()` singleton builder for 12 wrapped plugins. errors:`wrapPlugin` Proxy at line 227 uses `console.error` for failures — commandment-9 violation. dead:**three private helpers `_isIOS`, `_isAndroid`, `_isWebPlatform`, `_isMacOSPlatform`** (lines 38-39, 45-51) — leading underscore + never-called means they're explicitly marked dead. dedup:Platform detection here duplicates `capacitor-bridge.ts`. types:`isFeatureAvailable` (lines 369-417) takes a 14-member string-literal union and switches on it — should be derivable from `PluginCapabilities` keys instead of a parallel enum.
- [!] `bridge/native-plugins.ts` — 638 LOC. **Per-plugin type bindings + getters** for 13 native plugins (Gateway, Swabble, TalkMode, MobileSignals, AppBlocker, Camera, Location, ScreenCapture, Canvas, Desktop, WebsiteBlocker, Phone, Contacts, Messages, System). dedup:every getter follows the same `getNativePlugin<T>(name)` pattern with one-line variations — `getAppBlockerPlugin`, `getCameraPlugin`, `getWebsiteBlockerPlugin` add fallbacks for legacy plugin names (`ElizaAppBlocker ?? AppBlocker`, etc.) — those should be expressed as a single `getPluginWithFallbacks(name, fallbacks[])` helper. types:**40+ interfaces defined inline** (`SwabblePluginLike`, `TalkModePluginLike`, `MobileSignalsPluginLike`, `AppBlockerPluginLike`, etc.) — these should live next to the plugin packages they describe (`@elizaos/capacitor-mobile-signals`, etc.) and be imported here, not redefined. **Out-of-layer review** for the typed-binding portion (the canonical types belong with the plugins, which are Layer 10 work).
- [!] `bridge/gateway-discovery.ts` — 92 LOC. **Wrapper for the Gateway plugin's `startDiscovery`/`stopDiscovery`.** types:`asGatewayDiscoveryPlugin` (lines 26-33) is a soft `unknown → GatewayDiscoveryPlugin | null` cast — the underlying plugin type should come from `native-plugins.ts:getGatewayPlugin` typed properly. errors:try/finally at lines 63-72 swallows discovery errors and returns `[]` while always firing `stopDiscovery` cleanup — defensible (failed discovery == no gateways available). dead:none. boundaries:single-purpose helper for one specific plugin call — should arguably live next to `getGatewayPlugin()` in `native-plugins.ts`, not in its own file.

---

## Summary — Layer 9 audit findings

### A. Onboarding flow diagram (fresh install → "lands in chat")

```
Fresh install
       │
       ├─ [Web/desktop]  AppBootProvider mounts → boot-config singleton init
       │                  ↓
       │                 useStartupCoordinator dispatches:
       │                   SPLASH_LOADED → SPLASH_CONTINUE → restoring-session
       │                   ↓
       │                 startup-phase-restore.ts (Layer 8) reads
       │                   loadPersistedActiveServer() / agent-profiles
       │                   → SESSION_RESTORED with target | NO_SESSION
       │                   ↓
       │                 polling-backend → BACKEND_REACHED
       │                   ├─ if onboardingComplete → starting-runtime → ready
       │                   └─ else → onboarding-required
       │                            ↓
       │                          [the wizard runs:
       │                            onboarding/flow.ts owns the step graph
       │                            useOnboardingState owns the slice
       │                            useOnboardingCallbacks owns the side effects]
       │                            → ONBOARDING_COMPLETE → starting-runtime → hydrating → ready
       │
       └─ [AOSP ElizaOS APK]
            apps/app/src/main.tsx calls preSeedAndroidLocalRuntimeIfFresh()
              ↓
            mobile-runtime-mode = "local" + active-server = local:android
              ↓
            startup-phase-restore reads → SESSION_RESTORED target=embedded-local
              ↓
            polling-backend → BACKEND_REACHED → starting-runtime → ready
              (Backend timeout: 180_000 ms because cold-boot is ~60s)

  Use Local (web/desktop user clicks the tile in RuntimeGate):
       │
       ├─ RuntimeGate.tsx resolveLocalAgentApiBase() reads getElizaApiBase()
       │  (Layer 1 hot-fix from MASTER.md §0)
       │  ↓
       ├─ probe-local-agent.ts shouldShowLocalOption() probes /api/health
       │  → only shows tile when reachable (positive cache 30s, negative 3s)
       │  ↓
       └─ Click → finishAsLocal() (lives in useOnboardingCallbacks)
             ├─ persistMobileRuntimeModeForServerTarget("local")
             ├─ savePersistedActiveServer(createPersistedActiveServer({kind:"local"}))
             ├─ savePersistedOnboardingComplete(true)   ← Phase 2 task 12 target
             └─ startupCoordinator.dispatch({type:"ONBOARDING_COMPLETE"})

  Settings → Reset:
       │
       ├─ Settings handleReset → POST /api/agent/reset (Layer 4)
       │    → main process wipes server state
       │    ↓
       ├─ Main process pushes desktopTrayMenuClick {itemId:"menu-reset-app-applied"}
       │    ↓
       └─ handle-reset-applied-from-main.ts (Layer 8) →
            complete-reset-local-state-after-wipe.ts (Layer 8) →
              13 sequential ports (Phase 2 task 14: needs atomicity contract)
            → onboarding-required
```

### B. Phase 2 tasks 12-14 readiness verdict

| # | Task                                                  | Where it lives                                                          | Readiness                                              |
|---|-------------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------|
| 12 | Onboarding-complete flag → vault prefs               | `state/persistence.ts:359-377` (4 callers; see Layer 8 audit)           | **Ready to implement.** Move 2 functions, drop key from `bridge/storage-bridge.ts:SYNCED_KEYS`, delete legacy alias. ~1 hour of work. |
| 13 | "Use local" atomic + actually disconnects cloud      | `useOnboardingCallbacks.ts` `finishAsLocal()` (Layer 8 hook, ~1125 LOC) | **Blocked on Layer 8 deep audit of `useOnboardingCallbacks.ts`.** The flow path is clear (above), but `useOnboardingCallbacks` is 1125 LOC and contains the cloud-disconnect side effects. Need to verify the cloud-clear ops are unconditional + execute before the local-mode write — today the order isn't guaranteed atomic. |
| 14 | Collapse reset cascade to one op                     | `state/complete-reset-local-state-after-wipe.ts` (60 LOC)               | **Partially done (~70%).** Cascade IS centralized in one file with one entry point + two callers using it. Missing: atomicity contract. See Layer 8 §F for the verdict. |

### C. Bridge file ownership clarity

After audit, the 8 `bridge/` files are NOT redundant — each has a
single coherent concern. The confusion is purely from the "bridge"
name being overloaded with the Phase 3 Electrobun-side bridge.

| File                       | Owns                                                              | Wire side  |
|----------------------------|-------------------------------------------------------------------|------------|
| `index.ts`                 | Barrel re-export.                                                 | n/a        |
| `electrobun-rpc.ts`        | RPC client surface + 4 typed wrappers + timeout-aware request.    | Renderer   |
| `electrobun-runtime.ts`    | "Are we inside Electrobun?" runtime detection + startup timeout.  | Renderer   |
| `storage-bridge.ts`        | localStorage → Capacitor Preferences mirror (iOS resilience).     | Renderer   |
| `capacitor-bridge.ts`      | The `window.Eliza` global + capabilities + haptics + plugin reg.  | Renderer   |
| `plugin-bridge.ts`         | Wrapped-plugin facade with capability detection (12 plugins).     | Renderer   |
| `native-plugins.ts`        | Typed bindings + getters for 13 native plugins.                   | Renderer   |
| `gateway-discovery.ts`     | One specific plugin call (Gateway start/stopDiscovery).           | Renderer   |

**All 8 files are renderer-side.** None of them belong in the Phase 3
Electrobun-main extraction. **No file should move between Layer 9 and
Phase 3's `platforms/electrobun/src/bridge/`.**

### D. Top deletion candidates

1. **`onboarding/flow.ts:shouldSkipFeaturesStep` (8 LOC):** function exists but always returns `false` with `void args`. Either delete + inline `false` at callers, or document why it must remain a function.
2. **`bridge/plugin-bridge.ts` underscore-prefixed dead helpers (~5 LOC):** `_isIOS`, `_isAndroid`, `_isWebPlatform`, `_isMacOSPlatform` are explicitly marked dead by the leading underscore.
3. **`bridge/electrobun-runtime.ts:getBackendStartupTimeoutMs` (15 LOC):** the magic numbers duplicate `state/startup-coordinator.ts`'s policy timeouts. Replace this function's body with a call into the appropriate policy.
4. **The 5-copy `tryLocalStorage` pattern:** `state/persistence.ts:25-32`, `state/agent-profiles.ts:18-25`, plus inline blocks in `pre-seed-local-runtime.ts`, `reload-into-runtime-picker.ts`, `mobile-runtime-mode.ts`. Promote one helper to `utils/storage.ts` and replace.
5. **The 3-copy `ACTIVE_SERVER_STORAGE_KEY` literal:** `state/persistence.ts`, `pre-seed-local-runtime.ts:33`, `reload-into-runtime-picker.ts:17`. The current dedup is *deliberate* (cycle avoidance). Resolution: extract to `state/storage-keys.ts` (a leaf-only constants file with zero imports) and have all three import from there.
6. **`bridge/native-plugins.ts` inline plugin type defs (~300 LOC):** the 40+ `*PluginLike` interfaces should live with their plugin packages, not in app-core. Out-of-layer review (this is Layer 10 work — the plugins themselves should export the types app-core consumes).

### E. Boundary violations (work in this layer that belongs deeper)

| File                                          | Violating concern                                                     | Belongs in                              |
|-----------------------------------------------|-----------------------------------------------------------------------|-----------------------------------------|
| `bridge/electrobun-runtime.ts:49-63`          | `getBackendStartupTimeoutMs()` magic-number lookup                    | Layer 8 `startup-coordinator.ts` policies — single source of truth for platform timeouts. |
| `bridge/native-plugins.ts:12-405`             | 40+ inline plugin type definitions                                    | Layer 10 — the plugin packages should export their own types. |
| `bridge/plugin-bridge.ts` + `capacitor-bridge.ts` | 4-way platform-detection helper duplication                       | Single platform-detection module shared by both. |
| `onboarding/local-agent-token.ts:68-69`       | Dual write to typed boot-config slot AND legacy `__ELIZA_API_TOKEN__` window global | Symptom of the Layer 1 finding — boot-config-store should be the only writer; window-global should be deleted across the codebase. |
| `onboarding/flow.ts:shouldUseCloudOnboardingFastTrack` `onboardingProvider: string` | Weak string typing for what should be `OnboardingProviderId` | The shared catalog defines the type; the flow module should use it. |

### F. The surprise from this layer

**The bridge name is doubly overloaded — and the Phase 3 extraction
target name (`bridge/api-base-owner.ts`) lives in a directory that
**doesn't exist yet** in the codebase.** MASTER.md §3's Phase 3 table
lists 4 modules under `bridge/api-base-owner.ts`, etc., as the
extraction targets — but `bridge/` already exists as a renderer-side
directory full of unrelated work. **Phase 3 needs to choose a different
folder name** (e.g. `platforms/electrobun/src/lifecycle/api-base-owner.ts`)
or rename existing files, otherwise Phase 3 commits will produce
import-path collisions and onboarding confusion ("which bridge?").
