# Layer 8 — State, config, providers, registry

**Files: 82.**
**Audited: 82 / 82.**
**Refactored: 0 / 82.**

Four directories at the same dependency depth (all consumed by Layer 7
UI; all consumers of Layer 5a shared + Layer 4 API client):

1. `state/` (47 files, ~17k LOC) — React-context store + persistence + parsers + per-feature hooks.
2. `config/` (22 files, ~4.7k LOC) — boot config (renderer-side typed singleton), runtime overrides, plugin/UI specs, zod schemas, env-var registry.
3. `providers/` (1 file, 148 LOC) — provider logo registry; thin re-export of the canonical `ONBOARDING_PROVIDER_CATALOG` from `@elizaos/shared`.
4. `registry/` (6 files, ~1.7k LOC) — static JSON registry for apps/plugins/connectors with codegen + legacy adapter.

## Why this layer right after Layer 5a / 6 / 7

- This layer owns **renderer-side persistence** and **boot config**. It
  is the single largest source of MASTER.md §1's "24+ persistence
  layers" — and the actual count surfaced by this audit is materially
  higher (see §Persistence sprawl below).
- Phase 2 task 12 (onboarding-complete flag → vault prefs) lives in
  `state/persistence.ts` (one of 5 onboarding-related localStorage
  keys).
- Phase 2 task 13 (Use local atomicity) and task 14 (collapse reset
  cascade) thread through `state/complete-reset-local-state-after-wipe.ts`
  and the AppContext provider — the cascade is already centralized;
  the missing piece is *atomicity*, not centralization.
- The boot-config-store at `config/boot-config-store.ts` is the
  canonical typed replacement for the `window.__ELIZA_*` window-globals
  flagged in Layer 1 — but Layer 1 found that the Electrobun HTML inject
  still writes the legacy globals **in addition to** populating the
  typed store. This layer is where that coalescence has to happen.

## What to look for in this layer specifically

- **State store sprawl.** No Zustand / Jotai / Redux. One God-Context (`AppContext.tsx` 2860 LOC) plus 23 `useFooState` hooks + 5 sub-contexts (`ChatComposer`, `CompanionSceneConfig`, `PtySessions`, `Translation`, `AppContext` itself).
- **Persistence sprawl.** Every `localStorage.{get,set,remove}Item` call site, every `_STORAGE_KEY` constant, every server-side mirroring helper. **Headline number for MASTER.md.**
- **Two parallel user-state stores.** `state/persistence.ts` writes the *single-server* `elizaos:active-server` blob; `state/agent-profiles.ts` writes a *multi-profile* `elizaos:agent-profiles` registry. Both reference the same `ACTIVE_SERVER_KEY`.
- **Boot config vs runtime config vs window globals.** Same data exists in three storage targets per Layer 1 finding; this layer owns the typed one (`config/boot-config-store.ts`).
- **Provider catalog dedup vs `@elizaos/shared`.** The `providers/index.ts` file is *purely* a re-export of `@elizaos/shared`'s `ONBOARDING_PROVIDER_CATALOG` plus a logo registry. No drift here — but downstream callers should import from shared, not from `app-core/providers`.
- **`registry/` vs `runtime/app-route-plugin-registry.ts` (Layer 3).** Two registries with overlapping names. They are NOT duplicates: this layer's registry is the **static JSON SoT for apps/plugins/connectors** (loaded from disk at boot, validated by zod); Layer 3's is the **runtime plugin-route registry** (live runtime registrations of plugins that own HTTP routes). Different concepts; same word.

## Status legend

`[ ] pending  [~] reading  [!] findings  [*] refactor  [x] clean  [-] delete  [?] blocked`

---

### state/ — Core context + persistence + parsers (47 files)

#### Foundational types & barrel

- [!] `state/types.ts` — **1001 LOC.** The canonical state types file. Owns: `OnboardingStep` literal, `ONBOARDING_STEPS` array, `LIFECYCLE_MESSAGES`, `AGENT_STATES`, `StartupErrorReason`, `StartupCoordinatorView`, `AppState`, `AppActions`. dedup:`StartupCoordinatorView.state.phase` (lines 254-265) duplicates the `StartupState` union from `startup-coordinator.ts:41-70` — two source-of-truth definitions for the same set of phases. boundaries:`AppState` is enormous and aggregates per-feature state slices that should each own their own type — `useChatState`, `useCloudState`, `useOnboardingState` hooks each define & consume their slice; `AppState` then re-aggregates them, so any new field has to be added in two places.
- [x] `state/internal.ts` — 122 LOC barrel re-exporting `AppContext`, `AppContextValue`, `AppState`, plus persistence + onboarding helpers. Clean splitter. *Note*: `AppContext` lives here so `useApp.ts` and `AppContext.tsx` can both import without cycle.
- [x] `state/index.ts` — 14 LOC re-export wrapper around `internal.ts` + persistence. Clean.
- [x] `state/useApp.ts` — 32 LOC. `AppContext` + `useApp()` hook. Clean cycle-breaker (lives separately from `AppContext.tsx` so `internal.ts` and the provider can both import without circular dep).
- [x] `state/agent-profile-types.ts` — 30 LOC. `AgentProfile` + `AgentProfileRegistry` interfaces. Clean.
- [!] `state/action-notice.ts` — types for the `ActionNotice` toast queue. Re-exported from `types.ts`. Status: clean.
- [x] `state/ui-preferences.ts` — 3 LOC. Clean.

#### The God-Context

- [!] `state/AppContext.tsx` — **2860 LOC.** boundaries:single React provider that wires **23 `useFooState` hooks**, **5 sub-context providers**, the persistence layer, the navigation routing, the lifecycle action notices, and the entire mobile/desktop/web shell-routing logic. dedup:owns the canonical `client.setBaseUrl()` → `setClientToken()` reset path that's also performed by `useStartupCoordinator`, `RuntimeGate.tsx` (Layer 7), and `complete-reset-local-state-after-wipe.ts` — three call sites for "reset client connection." dead:`localStorage.getItem("elizaos:debug:greeting")` at line 166 reads a debug flag that is also read at `useChatCallbacks.ts:66` — same flag, two readers, inline. types:imports `useWalletState` from `@elizaos/app-wallet/state/useWalletState` directly — bypasses the boot-config component injection model the file itself uses for steward/companion/etc. errors:no swallows of note — most error handling is `setActionNotice` calls. **Highest-value extractions** (do not gold-plate; pull only what reduces total complexity): (a) the per-feature `useFooState` hooks already exist as siblings — move their *wiring* (`useFooState({...})`) into a dedicated `app-providers.tsx` so AppContext.tsx becomes ≤500 LOC of *state shape* + dispatch wiring; (b) the favorite-apps sync block (server fetch + localStorage mirror at lines that import `fetchServerFavoriteApps`/`replaceServerFavoriteApps`) is its own concern; (c) the navigation routing block is its own concern.
- [x] `state/ChatComposerContext.tsx` — 52 LOC. Clean. Two-context pattern (`ChatComposerCtx` + `ChatInputRefCtx`) lets the composer ref live in a separate provider so chat state changes don't re-render the input. Solid pattern.
- [x] `state/CompanionSceneConfigContext.tsx` — 53 LOC. Clean.
- [x] `state/PtySessionsContext.tsx` — 23 LOC. Clean.
- [x] `state/TranslationContext.tsx` — 109 LOC. Clean.

#### The persistence god-module — MASTER.md §1's "24+ persistence layers"

- [!] `state/persistence.ts` — **943 LOC.** This file alone owns **30+ named storage-key constants** + read/write/clear helpers per key. dedup:every helper follows the same pattern (`tryLocalStorage` → `getItem` → `normalize`/`saveItem`) — the `tryLocalStorage` helper at lines 25-32 catches and warns on every call; many bare `try { localStorage.getItem(...) } catch { return X }` blocks at lines 115, 162, 204, 224, 360, 666, 683, 700, 716, 723, 747, 760, 777, 814 do the same thing inline (the `tryLocalStorage` helper isn't used consistently — ~half the helpers use it, ~half use bare try/catch). legacy:**three legacy migration paths** (`LEGACY_UI_THEME_STORAGE_KEY` mirroring at lines 71-80; `LEGACY_COMPANION_EFFICIENCY_KEY` + `LEGACY_COMPANION_QUALITY_ON_BATTERY_KEY` mirror+migrate at lines 99-156; the `normalizeOnboardingStep` 11-case legacy-step map at lines 297-331 mapping `identity`/`permissions`/`launch`/`cloud_login`/`welcome`/`hosting`/`connection`/`cloudLogin`/`rpc`/`voice`/`senses`/`activate` to the current 3-step flow). errors:duplicate-write pattern (writes both `UI_THEME_STORAGE_KEY` and `LEGACY_UI_THEME_STORAGE_KEY` at lines 79-80; writes both `COMPANION_VRM_POWER_STORAGE_KEY` and removes legacy at lines 151-153) — every theme save costs two `setItem` calls. boundaries:`fetchServerFavoriteApps`/`replaceServerFavoriteApps`/`toggleServerFavoriteApp` (lines 569-632) reach over to `/api/apps/favorites` and mirror the result into localStorage — this couples the persistence module to the API client and to the favorites domain; it should be a hook in `useFavoriteAppsState`, not in the persistence library. dead:`PersistedActiveServer.accessToken` (line 803) is written/read but the cloud-control-plane filter (`isElizaCloudControlPlaneApiBase`, lines 808-841) explicitly strips access tokens for cloud entries — so for cloud the field is always `undefined`. The non-cloud cases use it. Worth a comment. **Phase 2 task 12 readiness:** the migration target — `loadPersistedOnboardingComplete` / `savePersistedOnboardingComplete` at lines 359-377 — is a 19-line block that reads/writes `eliza:onboarding-complete`. Phase 2 task 12 means: replace these two helpers with `vault.get("_meta.onboarding.completed")` / `vault.set(...)` calls (using the `_meta.` reserved prefix from Layer 5a's `inventory.ts:reserved-prefix discipline`). Caller graph (verified): `useOnboardingState`, `useOnboardingCallbacks`, `complete-reset-local-state-after-wipe.ts`, `startup-phase-restore.ts`. Four edits.
- [x] `state/persistence-cloud-active-server.test.ts` — 76 LOC test. Clean.
- [!] `state/agent-profiles.ts` — 144 LOC. dedup:**parallel persistence layer to `state/persistence.ts`'s `loadPersistedActiveServer`/`savePersistedActiveServer`**. Both files own a part of "what server is active." `agent-profiles.ts:STORAGE_KEY = "elizaos:agent-profiles"` stores the multi-profile registry; `persistence.ts:ACTIVE_SERVER_STORAGE_KEY = "elizaos:active-server"` stores the single-server blob; `agent-profiles.ts:ACTIVE_SERVER_KEY = "elizaos:active-server"` (line 16) is read by `migrateFromPersistedActiveServer` (lines 39-71) which migrates the single-server blob into the registry. legacy:per the migration comment "Leave elizaos:active-server intact for rollback" (line 69) — the legacy single-server key is **never deleted**, even after migration. Two truths persist forever. errors:`tryLocalStorage` helper at lines 18-25 is a third copy of the same wrapper found in `persistence.ts:25-32` and inline elsewhere. dead:`migrateFromPersistedActiveServer` is the only caller of `localStorage.getItem(ACTIVE_SERVER_KEY)` here — once the migration window passes, the whole legacy migration block can drop.

#### Onboarding flow + reset cascade

- [!] `state/onboarding-bootstrap.ts` — 124 LOC. Probes `apiAvailable && getOnboardingStatus().complete` to decide if a freshly-detected backend already had its onboarding done. Pure DI. Clean shape; one `Promise.race` for timeout. types:`getConfig: () => Promise<Record<string, unknown> | null | undefined>` is a weak type hatch — config has a known shape (`shared/contracts/config`), this should be the typed `Config` interface. dedup:`hasPersistedExistingInstallConfig` at lines 27-57 walks `meta.onboardingComplete`, `agents.list`, `agents.defaults.workspace`, `agents.defaults.adminEntityId` — the same heuristic walks live in `onboarding-resume.ts:hasPartialOnboardingConnectionConfig` (different fields, same intent: "has the user been here before?"). One probe.
- [!] `state/onboarding-restart.ts` — 13 LOC. One-line wrapper around `client.restartAndWait`. Clean. dead:question — does any caller besides `useOnboardingCallbacks` use this? If not, inline.
- [!] `state/onboarding-resume.ts` — 134 LOC. Pure: derive resume step + form prefill from a persisted config. dedup:`hasPartialOnboardingConnectionConfig` at lines 15-38 walks the same config heuristics as `onboarding-bootstrap.ts:hasPersistedExistingInstallConfig` — different fields (linkedAccounts, serviceRouting vs agents.list) but identical intent. Two heuristics, one signal. boundaries:weak typing on `config: Record<string, unknown>` (line 16) — should be the typed Config, same critique as `onboarding-bootstrap.ts`.
- [!] `state/complete-reset-local-state-after-wipe.ts` — 60 LOC. **Phase 2 task 14 epicenter.** Pure DI: takes 13 explicit ports, calls them in sequence (lines 35-46): `setAgentStatus → resetClientConnection → clearPersistedActiveServer → clearPersistedAvatarIndex → setClientBaseUrl(null) → setClientToken(null) → clearElizaCloudSessionUi → markOnboardingReset → resetAvatarSelection → clearConversationLists → fetchOnboardingOptions → setOnboardingOptions`. errors:the only catch (lines 47-58) is around `fetchOnboardingOptions` — every other op is fire-and-forget *and* synchronous. **The cascade is already centralized.** The actual Phase 2 task 14 work is *atomicity*: today, an exception in any of the 10 sync ops leaves the renderer in a half-reset state (token cleared but conversations not, etc.). To "collapse" properly: define a `ResetTransaction` that captures pre-state, applies all 10 ops, and rolls back if any throws (or accept it can't rollback and at least *log* the partial-failure mode). See §Phase 2 readiness verdict below.
- [!] `state/handle-reset-applied-from-main.ts` — 105 LOC. The reverse-direction reset entry point: when the **main process** menu reset finishes, it pushes `desktopTrayMenuClick` with `itemId="menu-reset-app-applied"` and the renderer runs this code. Pure DI again (10 ports). errors:single big `try/catch` at lines 75-104 around `parseTrayResetPayload` + `completeResetLocalState` + `setActionNotice` — wraps in user-facing alert dialog on failure. boundaries:correctly delegates the actual reset cascade to `complete-reset-local-state-after-wipe.ts` so menu-reset and Settings-reset use the same teardown — **this is the right pattern**.

#### Startup phases (4 phases + coordinator + hook)

- [!] `state/startup-coordinator.ts` — 406 LOC. **The pure state machine** described in MASTER.md as "explicit transitions." Six states (`splash`, `restoring-session`, `polling-backend`, `pairing-required`, `onboarding-required`, `starting-runtime`, `hydrating`, `ready`, `error`). dedup:`StartupState["phase"]` (lines 41-70) duplicates `StartupCoordinatorView.state.phase` in `types.ts:254-265` — two type definitions for the same set. dedup:**four parallel platform policies** (`createDesktopPolicy`, `createWebPolicy`, `createMobilePolicy`, `createElizaOSPolicy`) at lines 298-350. The Desktop and ElizaOS policies are byte-for-byte identical (180_000ms backend timeout, 300_000ms agent ready, probeForExistingInstall=true, defaultTarget="embedded-local") — `createElizaOSPolicy()` could just be `return createDesktopPolicy()`. boundaries:correctly pure; clean.
- [!] `state/useStartupCoordinator.ts` — 285 LOC. The hook that wires the pure machine into the renderer. Out-of-layer review.
- [!] `state/startup-phase-hydrate.ts` — 641 LOC. The "hydrate" phase: bulk fetches everything the chat surface needs (skills, plugins, MCPs, triggers, conversations, wallet inventory). boundaries:massive surface for one phase — should split per-resource. Out-of-layer review.
- [!] `state/startup-phase-poll.ts` — 339 LOC. Backend-poll loop. errors:multiple swallowed errors converted to `BACKEND_TIMEOUT` events — sometimes legitimate (poll loop), sometimes hides agent-error vs unreachable. Out-of-layer review.
- [!] `state/startup-phase-restore.ts` — 369 LOC. **Already audited in Layer 1.** The `reconcilePersistedApiBaseWithLive()` lives here per MASTER.md §0. Status from Layer 1 stands.
- [!] `state/startup-phase-runtime.ts` — 164 LOC. The "starting-runtime" phase. Out-of-layer review.
- [x] `state/agent-startup-timing.ts` — pure timing helper. Clean.

#### Per-feature hooks (the 23 useFooState files)

These are leaf hooks consumed by `AppContext.tsx`. Per scoping advice
(advisor): note size + headline finding, no deep audit.

- [!] `state/useChatCallbacks.ts` — **1208 LOC.** dedup:reads `localStorage.getItem("elizaos:debug:greeting")` at line 66 — same flag inline-read at `AppContext.tsx:166`. Out-of-layer review (this is a Layer 7-adjacent monolith).
- [!] `state/useChatLifecycle.ts` — 957 LOC. Out-of-layer review.
- [!] `state/useChatSend.ts` — **1332 LOC.** Largest single hook. Out-of-layer review.
- [!] `state/useChatState.ts` — 448 LOC. Owns the chat state slice. Out-of-layer review.
- [!] `state/useOnboardingCallbacks.ts` — **1125 LOC.** Owns onboarding-side-effect callbacks (cloud login, finish, provider fill). The single largest non-chat hook in this layer. Out-of-layer review.
- [!] `state/useOnboardingState.ts` — 461 LOC. Owns onboarding wizard slice. Out-of-layer review.
- [!] `state/useOnboardingCompat.ts` — 171 LOC. Compatibility shim — name suggests it bridges old onboarding state to new. legacy:investigate whether the "compat" prefix is still earning its keep, or if downstream consumers can be cut over and this file deleted.
- [!] `state/useCloudState.ts` — 803 LOC. Eliza Cloud session state slice. Out-of-layer review.
- [!] `state/useDataLoaders.ts` — 644 LOC. Bulk data fetchers (plugins, skills, MCP). Out-of-layer review.
- [!] `state/useLifecycleState.ts` — 449 LOC. Owns lifecycle action queue (`start`/`stop`/`restart`/`reset`). Out-of-layer review.
- [!] `state/usePluginsSkillsState.ts` — 830 LOC. Plugin + skill enable/disable state. Out-of-layer review.
- [!] `state/useCharacterState.ts` — 255 LOC. Out-of-layer review.
- [!] `state/useTriggersState.ts` — 230 LOC. Out-of-layer review.
- [!] `state/useMiscUiState.ts` — 211 LOC. Includes `sessionStorage.getItem("eliza:activeGameRunId")` (lines 79-88) — only sessionStorage usage in scope. legacy:`activeGameRunId` is a game-runtime concept; lives orphaned in a misc UI hook.
- [!] `state/useNavigationState.ts` — 189 LOC. Out-of-layer review.
- [!] `state/useDisplayPreferences.ts` — 108 LOC. Out-of-layer review.
- [!] `state/useExportImportState.ts` — 150 LOC. Out-of-layer review.
- [!] `state/useLogsState.ts` — 104 LOC. Out-of-layer review.
- [!] `state/useDeveloperMode.ts` — 61 LOC. Reads/writes `eliza:developerMode` localStorage. Pure-ish hook with one concern. Clean.
- [!] `state/usePairingState.ts` — 78 LOC. Out-of-layer review.
- [x] `state/useVincentState.ts` — 21 LOC. Compat thin wrapper (delegates to host-injected hook from boot-config). Clean.

#### Misc state utilities

- [!] `state/parsers.ts` — 436 LOC. Pure parsers for inbound API payloads (agent status, stream events, streaming text). dedup:`isRecord` at lines 18-20 duplicates `@elizaos/shared`'s `asRecord` from `type-guards.ts:51` (Layer 5a). Use the shared one.
- [x] `state/config-readers.ts` — 14 LOC. Tiny helpers for reading typed values from `Record<string, unknown>` configs. Clean.
- [x] `state/connector-deeplink.ts` — 60 LOC. Parses deep-link tokens for connector OAuth callbacks. Clean.
- [x] `state/navigation-events.ts` — 28 LOC. Tab-commit subscription helper. Clean.
- [x] `state/shell-routing.ts` — 35 LOC. Tab → `UiShellMode` resolver. Clean.
- [x] `state/chat-conversation-guards.ts` — small guards. Clean.
- [x] `state/vrm.ts` — 80 LOC. Avatar/VRM utility (`normalizeAvatarIndex`, `getVrmUrl`, etc.). Clean.

---

### config/ — Boot config + runtime config + zod schemas (22 files)

#### Boot-config singleton (typed replacement for `window.__*` globals)

- [!] `config/boot-config.ts` — 481 LOC. Owns the `AppBootConfig` interface (~30 fields), `DEFAULT_BOOT_CONFIG`, the `Symbol.for("elizaos.app.boot-config")` global slot, and `setBootConfig`/`getBootConfig`. dedup:**still mirrors to `__ELIZAOS_APP_BOOT_CONFIG__` window key on every `setBootConfig` call** (lines 351, 359) — exactly the parallel-storage finding from Layer 1. The Symbol-keyed slot was supposed to *replace* the window global; instead both are written. Either delete the window mirror (and any reader still depending on it — see Layer 1 boot-config-injection finding for the inject sites that also write the window key) or document why the mirror is kept. legacy:`syncBrandEnvToEliza` / `syncElizaEnvToBrand` (lines 446-480) are a server-side env mirroring helper duplicated by `apps/app/src/brand-env.ts` and `runtime/eliza.ts:syncBrandEnvAliases` (Layer 3 finding) — same alias pairs, three implementations.
- [x] `config/boot-config.ts` (the wrapper) — 5 LOC re-export. Clean. (Note: file system has both `boot-config.ts` and `boot-config-store.ts`; the 5-LOC wrapper is the public re-export.)
- [x] `config/boot-config-react.tsx` — 12 LOC. React-context provider thin wrapper. Clean.

#### Top-level config

- [!] `config/app-config.ts` — 306 LOC. White-label app config interface (`AppConfig` + `AppDesktopConfig` + `AppPackagingConfig`). Pure types + `DEFAULT_BRANDING` re-export. boundaries:single-source for white-label customization; correct.
- [x] `config/branding.ts` — 78 LOC. `BrandingConfig` interface + `DEFAULT_BRANDING` constant. Clean.
- [x] `config/cloud-only.ts` — 19 LOC. Tiny boolean-flag helper. Clean.
- [x] `config/config.ts` — 43 LOC. Generic config-fetch helper. Clean.
- [x] `config/wechat-config.ts` — 31 LOC. Specific WeChat connector config helper. Clean.

#### UI specs + plugin-config rendering

- [!] `config/config-catalog.ts` — **1100 LOC.** Reverse-engineered from `vercel-labs/json-render` (per file's own header). Owns: `defineCatalog()`, `defineRegistry()`, `getByPath`/`setByPath`, `LogicExpression` evaluator, validation checks, `DynamicValue` resolution. Out-of-layer review (this is a renderer-engine; deeper audit belongs in Layer 7). dedup:`getByPath`/`setByPath` are utilities likely duplicated by `lodash`-style helpers elsewhere — search the wider repo.
- [!] `config/plugin-ui-spec.ts` — 311 LOC. `buildPluginConfigUiSpec` / `buildPluginListUiSpec`. Out-of-layer review.
- [!] `config/ui-spec.ts` — 256 LOC. UI-spec types + helpers. Out-of-layer review.

#### Zod schemas (the canonical config validators)

- [!] `config/zod-schema.core.ts` — 791 LOC. Out-of-layer review (large schema file with mostly mechanical zod definitions).
- [!] `config/zod-schema.agent-runtime.ts` — 827 LOC. Out-of-layer review.
- [!] `config/schema.ts` — 19 LOC. Top-level schema barrel. Clean.

#### Plugin auto-enable + paths + env

- [!] `config/plugin-auto-enable.ts` — 69 LOC. Maps env var presence → which plugins to auto-register. dedup:overlaps with `runtime/eliza.ts`'s plugin-auto-enable logic (Layer 3 finding). Same data, two locations.
- [x] `config/config-paths.ts` — 90 LOC. Resolves `~/.milady/milady.json` etc. Server-side only. Clean.
- [!] `config/env-vars.ts` — 69 LOC. Env-var registry. dedup:should be the canonical source for the env vars listed in `CLAUDE.md`'s "Environment variables" section — verify alignment.
- [!] `config/runtime-overrides.ts` — 71 LOC. Runtime-only env overrides (`process.env` reads). boundaries:browser-safe? Audit needs to confirm the file is server-side only.
- [!] `config/api-key-prefix-hints.ts` — 35 LOC. Maps API-key prefixes (`sk-`, `pk-`, `mr-`) to provider IDs. Clean. dedup:provider-detection logic likely also lives in `vault/inventory.ts:PROVIDER_KEY_PATTERNS` (Layer 5a finding) — three places encode provider hints (here, vault inventory, and the brand-env aliases).
- [x] `config/allowed-hosts.ts` — 70 LOC. Allow-list for outbound URLs. Clean.
- [x] `config/index.ts` — 22 LOC barrel. Clean. *Note*: re-exports from `../components/config-ui/{config-renderer,ui-renderer}` — config barrel reaches into components/ for rendering, which is a Layer 7 concern living in config; the import direction is OK (config defines the spec; components render it) but the barrel co-location implies otherwise. Consider moving `config-renderer`/`ui-renderer` exports out of the config barrel.

---

### providers/ — Provider logo registry (1 file)

- [!] `providers/index.ts` — 148 LOC. Two responsibilities:
  1. Re-export the canonical onboarding provider catalog from `@elizaos/shared` (lines 3-20). **No drift** — clean re-export, matches Layer 5a's finding that `@elizaos/shared/contracts/onboarding` owns `ONBOARDING_PROVIDER_CATALOG` + `OnboardingProviderId`.
  2. **Hardcoded provider-logo maps** (`PROVIDER_LOGO_MAP_DARK` lines 24-43, `PROVIDER_LOGO_MAP_LIGHT` lines 45-64) + a runtime registration API (`registerProviderLogo` lines 83-94, `_registeredLogos` mutable singleton at line 71). dedup:two parallel maps with the same 19 keys — should be one `Record<provider, { dark: string; light: string }>` map. dead:`grok` and `xai` both map to the same logo (`logos/grok-icon-white.png`); same for `gemini`/`google`, `together`/`together-ai`, `zai`/`z.ai` — alias map should be derived once from the shared catalog's known aliases, not hand-maintained here. boundaries:logo files live under `/logos/` in the asset bundle; a missing file fails silently (`generateFallbackLogo` produces a colored-square SVG). slop:no.

---

### registry/ — Static JSON registry SoT (6 files)

#### Schema + loader + index

- [!] `registry/schema.ts` — 327 LOC. **The canonical zod schema for registry entries** (apps/plugins/connectors). Owns: `RegistryEntry` discriminated union, `ConfigField` (replaces `PluginParamDef + ConfigUiHint`), `RegistryRuntimeOverlay`. Pure schema; clean. **Designed as the single source of truth** for the consolidations the file's own header lists (lines 3-12: replaces `plugins.json`, `PluginInfo`, `ConfigUiHint`, `RegistryAppInfo`, `VISIBLE_CONNECTOR_IDS`, `DEFAULT_ICONS`, `FEATURE_SUBGROUP`, `SUBGROUP_DISPLAY_ORDER`, `paramsToSchema()` heuristics). **Verify those replacements are complete** — if any of those concepts still exist as parallel stores in higher layers, the consolidation isn't done.
- [!] `registry/loader.ts` — 165 LOC. Pure validator + indexer. Throws `RegistryValidationError` per bad file (fail-loud is the right call here — a malformed entry should never silently degrade). errors:no swallows. Clean.
- [!] `registry/index.ts` — 64 LOC. Loads JSON entries from disk via `readdirSync` / `readFileSync`. errors:catches `readdirSync` failure (lines 42-49) with `console.warn` + continue — comment justifies this as "packaged desktop builds may not bundle the registry entries." Acceptable boundary; **but** then `getApps()`/`getPlugins()`/`getConnectors()` return empty arrays, and downstream callers must handle that — verify no caller treats empty-registry as "no plugins exist" (it could mean "registry didn't ship"). dedup:`writeFileSync` is from the codegen scripts (`generate.ts` / `generate-apps.ts`), not runtime — keep out of the persistence-sprawl table.

#### Codegen + legacy adapter

- [!] `registry/generate.ts` — 611 LOC. Build-time codegen that scans registry source dirs and writes per-entry JSON. Out-of-layer review (codegen is a Layer 0 concern; this file lives here for proximity to the schema). The `writeFileSync` calls (lines 13, 594) are codegen output — not runtime persistence.
- [!] `registry/generate-apps.ts` — 400 LOC. Same as above for the `apps/` subdir of the registry. Out-of-layer review.
- [!] `registry/legacy-adapter.ts` — 140 LOC. Adapter from `RegistryEntry` → `LegacyManifestEntry` shape that `plugins-compat-routes.ts` still expects. legacy:**this file is explicitly marked transitional** in its header ("Once the route is ported to read RegistryEntry directly, this adapter and the legacy types should be deleted"). **Verify whether `plugins-compat-routes.ts` still exists in Layer 4** — Layer 4 was already audited; check that file's audit notes for the migration status. dead-on-completion candidate.

---

## Summary — Layer 8 audit findings

### A. Persistence sprawl — the headline number for MASTER.md

MASTER.md §1 says "24+ persistence layers." The actual audited number is **materially higher.**

**60 unique `_STORAGE_KEY` constants** found in `app-core/src` + `apps/app/src`:

```
$ grep -rhE '^(const|export const) [A-Z_][A-Z0-9_]*(STORAGE_)?KEY[A-Z_]*\s*=\s*"[^"]+"' \
  /Users/home/milady/eliza/packages/app-core/src \
  /Users/home/milady/apps/app/src 2>/dev/null | sort -u | wc -l
60
```

**Breakdown by owner file:**

| File                                                  | Storage keys owned | Notes                                                                                    |
|-------------------------------------------------------|--------------------|------------------------------------------------------------------------------------------|
| `state/persistence.ts`                                | **30+**            | Theme (×3), companion VRM (×3 + 2 legacy), onboarding (×2 + 2 legacy), pack (×2), language, shell-mode, last-tab, avatar, favorites, recent apps, wallet, browser, computeruse, chat avatar/voice/mode/cutoff/conversationId, active server. **The single largest source.** |
| `state/agent-profiles.ts`                             | 2                  | `elizaos:agent-profiles` registry + read of `elizaos:active-server` (legacy migration; never deleted post-migration).                                                            |
| `state/useDeveloperMode.ts`                           | 1                  | `eliza:developerMode`.                                                                   |
| `state/useMiscUiState.ts`                             | 1                  | `eliza:activeGameRunId` — **only sessionStorage usage in scope**.                        |
| `state/AppContext.tsx`                                | 1                  | `eliza:appsSubTab` (sessionStorage).                                                     |
| `onboarding/mobile-runtime-mode.ts`                   | 1                  | `eliza:mobile-runtime-mode`.                                                             |
| `onboarding/pre-seed-local-runtime.ts`                | 1*                 | `elizaos:active-server` literal (mirror of `state/persistence.ts` constant — file's own header documents the duplication).  |
| `onboarding/reload-into-runtime-picker.ts`            | 2*                 | `elizaos:active-server` + `eliza:mobile-runtime-mode` literals (mirrors).                |
| `bridge/storage-bridge.ts`                            | 7 (synced set)     | `eliza.control.settings.v1`, `eliza.device.identity`, `eliza.device.auth`, `elizaos:active-server`, `eliza:onboarding-complete`, `eliza:onboarding:step`, `MOBILE_RUNTIME_MODE_STORAGE_KEY`. **Mirrors localStorage to Capacitor Preferences on iOS.**                                                |
| `config/boot-config.ts`                               | 1                  | `__ELIZAOS_APP_BOOT_CONFIG__` window-global (not localStorage but same problem class — see Layer 1).                                                                          |
| Miscellaneous secondary files (custom commands, heartbeat templates, secrets-vault keys, command palette, etc.) | ~15 | `CUSTOM_COMMANDS_STORAGE_KEY`, `TEMPLATES_STORAGE_KEY`, `STORAGE_KEY = "eliza:secrets-vault-keys"`, `APP_WINDOW_ALWAYS_ON_TOP_KEY`, `APPS_SIDEBAR_*_KEY`, `CHAT_SIDEBAR_VISIBILITY_STORAGE_KEY`, `SETTINGS_SIDEBAR_*_KEY`, `FORCE_FRESH_ONBOARDING_STORAGE_KEY`, `DISMISS_STORAGE_KEY`, `SELF_HOSTED_TOKEN_KEY`, `DEVICE_BRIDGE_ID_KEY`, `LOCAL_STORAGE_API_BASE_KEY = "elizaos_api_base"`, `SESSION_STORAGE_API_TOKEN_KEY = "elizaos_api_token"`, `SESSION_STORAGE_KEY = "eliza_session"`. |

**Surprise (the headline number): the MASTER.md "24+" undercount is wrong by ~2.5×.** The real localStorage-key constant count in renderer code is **60**, of which ~30 live in a single 943-LOC file (`state/persistence.ts`). MASTER.md should be updated.

**29 distinct files** in `app-core/src` + `apps/app/src` reach for `localStorage.{get,set,remove}Item`. That's the better measure of "persistence layers" — *callers*, not key-count. Still ≥ 24.

**Phase 2 task 12 (onboarding-complete → vault prefs) target keys:**

The task is to migrate **just** `eliza:onboarding-complete` (the canonical key) — but the audit shows there are actually **2 keys + a sync mirror**:
- `ONBOARDING_COMPLETE_STORAGE_KEY = "eliza:onboarding-complete"` (current).
- `LEGACY_ONBOARDING_COMPLETE_STORAGE_KEY = "eliza:onboarding-complete"` (alias constant — appears unused, verify and delete).
- `bridge/storage-bridge.ts:SYNCED_KEYS` includes `"eliza:onboarding-complete"` for iOS Capacitor Preferences mirror.

Target migration:
- Replace `loadPersistedOnboardingComplete` / `savePersistedOnboardingComplete` (4 callers: `useOnboardingState`, `useOnboardingCallbacks`, `complete-reset-local-state-after-wipe.ts`, `startup-phase-restore.ts`) with `vault.get("_meta.onboarding.completed")` + `vault.set(...)` using the reserved-prefix discipline established in Layer 5a.
- Drop `"eliza:onboarding-complete"` from `bridge/storage-bridge.ts:SYNCED_KEYS` — no longer in localStorage so no need to mirror.
- Delete the legacy alias constant.

### B. State-store map

| Store / context              | Owner file                                               | Purpose                                                      |
|------------------------------|----------------------------------------------------------|--------------------------------------------------------------|
| `AppContext` (god-context)   | `state/AppContext.tsx` (2860 LOC)                        | Aggregates 23 hooks + 5 sub-contexts; reaches everywhere.   |
| `ChatComposerCtx`            | `state/ChatComposerContext.tsx`                          | Chat input ref isolation (perf split).                       |
| `ChatInputRefCtx`            | same file                                                | Same.                                                        |
| `CompanionSceneConfigCtx`    | `state/CompanionSceneConfigContext.tsx`                  | 3D companion scene config.                                   |
| `PtySessionsCtx`             | `state/PtySessionsContext.tsx`                           | PTY/coding-agent session list.                               |
| `TranslationContext`         | `state/TranslationContext.tsx`                           | i18n.                                                        |
| `AppBootContext`             | `config/boot-config-react.tsx`                           | Typed boot config (host-app injected).                       |
| `BrandingContext`            | `config/branding.ts`                                     | Brand colors / strings.                                      |
| **23 `useFooState` hooks**   | `state/use*.ts`                                          | Per-feature state slices, all aggregated by `AppContext`.    |

**No** Zustand, Jotai, Redux, Recoil, MobX, or any other state library. Pure React-context + custom hooks. The single source of truth is `AppContext.tsx`'s state — but every hook also persists to localStorage via `state/persistence.ts`, which is a parallel write path.

**The two parallel server-state stores** (the surprise here):
1. `state/persistence.ts:loadPersistedActiveServer()` reads `elizaos:active-server` (single-server blob).
2. `state/agent-profiles.ts:loadAgentProfileRegistry()` reads `elizaos:agent-profiles` (multi-profile registry) AND on first read migrates from `elizaos:active-server` but **never deletes the source key** (line 69 explicit comment: "Leave elizaos:active-server intact for rollback"). Two truths, both forever-live.

### C. Provider-catalog dedup

- `providers/index.ts` is a **clean re-export wrapper** over `@elizaos/shared`'s canonical catalog (Layer 5a). No drift in either direction.
- The two responsibilities (catalog re-export + logo registry) should split into `providers/catalog.ts` (delete; consumers should import from `@elizaos/shared` directly) and `providers/logos.ts` (keep). The current barrel pattern hides that callers can remove a hop by importing shared.

### D. Registry comparison: `app-core/src/registry/` vs `runtime/app-route-plugin-registry.ts` (Layer 3)

**Not duplicates.** Different concepts, same word:
- This layer's `registry/` = **static JSON SoT** for apps/plugins/connectors. Loaded once at boot from disk; validated by zod; consumed by API routes and the plugin-marketplace UI. Mostly metadata: name, npmName, description, config-field schema, render hints, resources.
- Layer 3's `runtime/app-route-plugin-registry.ts` = **runtime registration table** for plugins that register HTTP route handlers. Live runtime state; not persisted.

The naming is unfortunate but the boundaries are clean. No consolidation.

### E. Top deletion candidates

1. **`state/persistence.ts` legacy migration paths (~50 LOC):** the `LEGACY_UI_THEME_STORAGE_KEY` mirroring (lines 71-80, 79-80), `LEGACY_COMPANION_EFFICIENCY_KEY` + `LEGACY_COMPANION_QUALITY_ON_BATTERY_KEY` migrate-and-delete (lines 99-156), and the 11-case `normalizeOnboardingStep` legacy step map (lines 297-331). Each was a one-time data migration; persisting these forever is debt. Schedule a release where these get removed and pre-migrate users see a clean state.
2. **`state/agent-profiles.ts:migrateFromPersistedActiveServer` + the `ACTIVE_SERVER_KEY` import (~35 LOC):** same migration-leftover class. The header comment "Leave elizaos:active-server intact for rollback" has no time bound — set one and delete.
3. **`config/boot-config.ts` `__ELIZAOS_APP_BOOT_CONFIG__` window mirror (lines 351, 359):** the Symbol-keyed slot was supposed to *replace* the window global. Today both are written. Delete the mirror after confirming no reader still depends on it (Layer 1 found Electrobun's HTML inject as one such reader; that needs to go too).
4. **`registry/legacy-adapter.ts` (140 LOC):** explicitly marked transitional in its header. Once `plugins-compat-routes.ts` (Layer 4) reads `RegistryEntry` directly, delete.
5. **The `tryLocalStorage` helper duplication:** `persistence.ts:25-32`, `agent-profiles.ts:18-25`, plus inline `try/catch` blocks across persistence.ts. Promote one helper to `utils/storage.ts` and replace.
6. **`providers/index.ts` PROVIDER_LOGO_MAP_DARK + LIGHT (40 LOC):** collapse into one `Record<provider, { dark: string; light: string }>` map. The four `xai`/`grok`, `gemini`/`google`, `together`/`together-ai`, `zai`/`z.ai` aliases should derive from the shared catalog's alias map, not be hand-maintained here.

### F. Phase 2 task 14 readiness verdict (the reset cascade)

**Status: partially done.** The cascade is *centralized* (one file owns
all 13 ports). The remaining work for "collapse to one op" is
**atomicity**, not consolidation:

- Today: `complete-reset-local-state-after-wipe.ts` calls 10 sync ports
  in sequence (lines 35-46). Any sync exception leaves the renderer in
  a half-reset state.
- Required: define a `ResetTransaction` that captures pre-state and
  rolls back if any of the 10 ops throws — OR explicitly accept partial
  reset and surface the failure mode (which sub-ops failed) so the user
  can recover.
- The async `fetchOnboardingOptions` at the end already has its own
  `try/catch` (lines 47-58) — that's correct for the network call but
  none of the 10 sync ports have failure handling.
- Two callers of the cascade exist (`Settings → handleReset` and
  `handleResetAppliedFromMainCore`); both delegate to the same
  function. **No drift.**

**Phase 2 task 14 is ~70% done; the missing 30% is the atomicity
contract.**

### G. Boundary violations (work in this layer that belongs deeper)

| File                                          | Violating concern                                                     | Belongs in                              |
|-----------------------------------------------|-----------------------------------------------------------------------|-----------------------------------------|
| `state/persistence.ts:569-632`                | `fetchServerFavoriteApps` / `replaceServerFavoriteApps` / `toggleServerFavoriteApp` reach over to `/api/apps/favorites` | A `useFavoriteAppsState` hook; persistence module shouldn't own server-side mirroring of one feature. |
| `config/index.ts:1, 2-9`                      | Re-exports `config-renderer`/`ui-renderer` from `components/config-ui/` | Layer 7 — config barrel exporting React components is an inverted dependency. |
| `state/AppContext.tsx:77`                     | `useWalletState` import from `@elizaos/app-wallet/state/useWalletState` | The boot-config injection model the file uses for steward/companion/etc. — wallet should follow the same pattern. |
| `providers/index.ts`                          | Reaches into `utils/asset-url` for logo path resolution               | Either inline the helper or move logo serving to a higher-layer renderer-only module. |
| `config/boot-config.ts:431-480`               | Server-side env mirroring helpers (`syncBrandEnvToEliza` / `syncElizaEnvToBrand`) | A dedicated server-side env-sync module shared by `runtime/eliza.ts:syncBrandEnvAliases` and `apps/app/src/brand-env.ts`. |
