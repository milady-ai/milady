# Milady Core Audit — 2026-03-30

> Historical snapshot. This audit predates the canonical onboarding/runtime
> refactor. The current live flow now writes `deploymentTarget`,
> `linkedAccounts`, `serviceRouting`, and `credentialInputs`; deprecated fields
> such as `config.connection`, `runMode`, and `cloudProvider` are no longer the
> source of truth for active onboarding or runtime routing.

Comprehensive audit of all core routes, screens, state machines, and platform bridges.
5 parallel audit teams investigated: API routes, onboarding, lifecycle state, desktop/web bridge, and navigation/views.

---

## Executive Summary

**44 issues identified across 5 areas. 3 HIGH, 10 MEDIUM, 31 LOW/INFO.**

The most critical findings:
1. **Onboarding can leave invalid config** — OAuth cloud connections rejected by completeness check; remote providers accepted with empty base URL
2. **Startup watchdog conflicts with agent download** — 300s App.tsx watchdog fires during valid 900s first-run embedding download
3. **Plugin reveal endpoint bypasses wallet security** — `/api/plugins/:id/reveal` returns plaintext private keys with standard auth

### Two Single Points of Failure (Desktop)
- `apiBaseUpdate` RPC message not delivered → **entire app non-functional** (no REST, no WS)
- `agentStart` RPC failure → **app stuck in loading forever**

---

## 1. API Routes & Security

### Architecture
Monkey-patch pattern: `patchHttpCreateServerForMiladyCompat()` wraps `http.createServer` to intercept requests BEFORE upstream Eliza. Milady routes take precedence.

### Route Count
- ~50 inline routes in `server.ts`
- ~15 delegated route modules (`*-routes.ts`)
- Auth enforced via `ensureCompatApiAuthorized` (standard) or `ensureCompatSensitiveRouteAuthorized` (hardened)

### Critical Startup Routes (must never fail)
| Route | Purpose |
|---|---|
| `GET /api/auth/status` | Polled by frontend to decide pairing vs onboarding |
| `GET /api/onboarding/status` | Polled to decide if onboarding wizard shows |
| `GET /api/status` | Agent state polling during startup |

### Issues

| ID | Severity | Issue | File |
|---|---|---|---|
| A-1 | MEDIUM | `/api/tts/cloud` has no API token check — unauthenticated callers can drive TTS against cloud key | `server.ts:2393` |
| A-2 | LOW | `POST /api/cloud/login/persist` has no body size limit (raw `for await` loop) | `cloud-routes.ts:198` |
| A-3 | LOW-MED | `POST /api/onboarding` sends 200 before upstream replay — upstream failure invisible to frontend | `server.ts:3855` |
| A-4 | LOW | `GET /api/config` sensitive key filter is static allowlist — custom plugin secrets leak | `server-config-filter.ts:8` |
| A-5 | MEDIUM | `/api/plugins/:id/reveal` exposes EVM_/SOLANA_ prefixed keys with standard auth, bypassing hardened wallet export guards | `server.ts:4033` |
| A-6 | INFO | `/api/wallet/steward-webhook` loopback-only, no auth — correct for local steward, risk if steward goes remote | `server.ts:2953` |
| A-7 | INFO | CORS reflects origin for all localhost ports with `Access-Control-Allow-Credentials: true` | `server.ts:4096` |
| A-8 | INFO | Pairing code TTL (`pairingExpiresAt`) disclosed to unauthenticated callers | auth endpoint |

### Blast Radius
| Module failure | Impact |
|---|---|
| `ensureCompatApiAuthorized` broken | All compat routes return 401 — entire API inaccessible |
| `cloud-routes.ts` login/persist | Cloud key never persisted; lost on restart |
| `server-config-filter.ts` broken | Sensitive env keys leak through `GET /api/config` |
| `/api/plugins/:id/reveal` | Plaintext wallet private key exposure |

---

## 2. Onboarding & Provider Connection State

### Step Flow
```
cloud_login → identity → hosting → providers → voice → permissions → launch
```

The hosting/providers steps share `ConnectionStep` which routes through 6 sub-screens:
- ConnectionHostingScreen (local/cloud/remote choice)
- ConnectionProviderGridScreen (provider selection)
- ConnectionProviderDetailScreen (API key entry, OAuth)
- ConnectionElizaCloudPreProviderScreen (cloud OAuth)
- ConnectionRemoteBackendScreen (remote URL entry)

### Config Writes on Completion
- `config.connection` — stripped-secrets connection descriptor
- `config.cloud.*` — enabled, provider, inferenceMode, runtime, services, apiKey
- `config.env.*` — provider API keys
- `config.agents.defaults.*` — model primary, subscriptionProvider
- `config.meta.onboardingComplete = true`
- `localStorage["eliza:onboarding-complete"] = "1"`

### Issues

| ID | Severity | Issue | File |
|---|---|---|---|
| O-6 | **HIGH** | `isOnboardingConnectionComplete` requires apiKey for cloud-managed, but OAuth leaves apiKey empty — valid OAuth connections rejected | `shared/contracts/onboarding.ts:614` |
| O-7 | **HIGH** | `inferCompatibilityOnboardingConnection` returns remote-provider with empty `remoteApiBase` when only token present | `shared/contracts/onboarding.ts:874` |
| O-8 | MEDIUM | `process.env` mutations from onboarding survive provider switches / Reset Agent — stale cloud vars persist | `provider-switch-config.ts:104` |
| O-9 | MEDIUM | Hardcoded `smallModel: "moonshotai/kimi-k2-turbo"` defaults written unconditionally for cloud connections | `useOnboardingState.ts:138` |
| O-11 | MEDIUM | Double-advance race: auto-advance useEffect + user Confirm click can call `handleOnboardingNext` twice | `ConnectionElizaCloudPreProviderScreen.tsx:54` |
| O-10 | LOW | `deriveOnboardingResumeStep` ignores partial config; always restarts from `cloud_login` if localStorage cleared | `onboarding-resume.ts:34` |
| O-5 | LOW | No URL format validation on remote backend address field | `ConnectionRemoteBackendScreen.tsx` |
| O-1 | LOW | Step label flickers between hosting/providers on ConnectionStep mount | `ConnectionStep.tsx:326` |
| O-3 | LOW | OpenAI OAuth local state not cleared on clearProvider (minor unmount issue) | `ConnectionProviderDetailScreen.tsx` |
| O-4 | LOW | Anthropic `anthropicConnected` is local state only — lost on navigate back/forward | `ConnectionProviderDetailScreen.tsx:193` |
| O-2 | LOW | `forceCloudBootstrap` useEffect duplicates ConnectionFlowSnapshot construction | `ConnectionStep.tsx:293` |

### Blast Radius
| Bad config state | Downstream impact |
|---|---|
| `config.connection = null` | Agent starts but all AI responses fail (no model) |
| `cloud.enabled = true` + missing apiKey | Repeating 401 on every LLM call |
| Stale `ELIZAOS_CLOUD_ENABLED` in process.env | Local provider bypassed, cloud inference attempted |
| Invalid model IDs in `config.models` | Model-not-found errors in chat |
| Remote backend unreachable | Startup error screen, no recovery without localStorage clear |

### Resume Gaps
At the time of this audit, connection sub-state was **not persisted to localStorage**. Interrupted onboarding could resume at the persisted step but lose hosting/provider field state between reloads.

---

## 3. Startup & Lifecycle State Machine

### StartupPhase Transitions
```
"starting-backend" ──► "initializing-agent" ──► "ready"
        │                        │
        └─► [startupError]       └─► [startupError]
```
`RETRY_STARTUP` resets to `"starting-backend"` and re-fires the init effect.

### Derived `startupStatus` (gates ViewRouter)
```
startupError        → "recoverable-error"  (StartupFailureView)
authRequired        → "auth-blocked"       (PairingView)
loading/not ready   → "loading"            (spinner)
!onboardingComplete → "onboarding"         (OnboardingWizard)
else                → "ready"              (main app)
```

### Polling Budgets
| Phase | Timeout | Poll interval |
|---|---|---|
| Phase 1: Backend | `getBackendStartupTimeoutMs()` | Exponential: 250ms → 1000ms cap |
| Phase 2: Agent | 180s initial, slides to 900s absolute max | 500ms fixed |
| App.tsx watchdog | 300s hard | — |

### Issues

| ID | Severity | Issue | File |
|---|---|---|---|
| L-1 | **HIGH** | App.tsx 300s watchdog fires before Phase 2's 900s absolute max — silently kills valid first-run embedding download | `App.tsx:501` |
| L-2 | MEDIUM | `conversation-updated` and `proactive-message` WS subscriptions leak on teardown (unsubscribe discarded) | `AppContext.tsx:7475,7533` |
| L-3 | LOW-MED | Phase 2 auth-401 exit leaves `startupPhase = "initializing-agent"` (works via derived status but misleading) | `AppContext.tsx:7295` |
| L-4 | LOW | Options loop timeout shares backend timeout budget (nested deadline) | `AppContext.tsx:7124` |
| L-5 | LOW | `startupStatus` typed as `string \| null` instead of closed union — no exhaustive matching | `types.ts` |
| L-6 | LOW | `beginLifecycleAction` ref/state drift window (documented, intentional) | `useLifecycleState.ts` |

### localStorage Keys (19 total)
All wrapped in `tryLocalStorage` with safe fallbacks. Most critical key: `milady:active-server` — stale cloud/remote entry causes startup to connect to unreachable backend with no recovery except manual clear.

### Blast Radius
| Wrong state | Impact |
|---|---|
| `startupPhase` not "ready" | Entire app shows loading spinner |
| `onboardingComplete = false` (should be true) | Full-screen OnboardingWizard blocks app |
| `authRequired = true` spuriously | PairingView shown, no way out |
| `connected = false` | No status refresh, stale agent info |
| `lifecycleBusy = true` stuck | All action buttons permanently disabled |
| `agentStatus = null` | Agent name/model/state empty across UI |

### Recovery Paths
| Failure | Recovery |
|---|---|
| Backend timeout | StartupFailureView → Retry → full restart |
| Agent error state | Immediate error display → Retry |
| WS failed (15 reconnects) | ConnectionFailedBanner → manual Retry |
| Backend crash post-startup | WS reconnect loop → eventual banner |
| Agent reset | Full localStorage wipe → re-onboarding |

---

## 4. Desktop/Web Platform Bridge & Shell

### RPC Surface
- **100+ Bun request methods** (all with registered handlers)
- **~30 push message types** (Bun → renderer)
- Schema: `apps/app/electrobun/src/rpc-schema.ts`
- Handlers: `apps/app/electrobun/src/rpc-handlers.ts`

### Bridge Flow
```
React app → invokeDesktopBridgeRequest() → window.__MILADY_ELECTROBUN_RPC__.request
  → Electrobun WS RPC → Bun main process handler → response
```

REST API calls go **directly** to `http://127.0.0.1:{port}/api/*` — not through RPC.

### Platform Detection
- `isElectrobunRuntime()` — checks `window.__electrobunWindowId` or RPC presence
- `isWebPlatform()` — Capacitor "web" && !Electrobun
- `isMacOS` equated to `isDesktop` — accurate for Electrobun (macOS only)

### Shell Modes
- `"companion"` — VRM overlay with tab views (default on load)
- `"native"` — full dashboard (called "dev mode" in UI)
- Transition: tab change → `deriveUiShellModeForTab(tab)` → mode switch

### Issues

| ID | Severity | Issue | File |
|---|---|---|---|
| B-1 | MEDIUM | Steward RPC methods (5 methods) registered as handlers but absent from typed schema — no param type safety | `rpc-handlers.ts:606`, `rpc-schema.ts` |
| B-2 | LOW | `ipcChannel` param in `invokeDesktopBridgeRequest` is vestigial — never read | `electrobun-rpc.ts:34` |
| B-3 | LOW | Context menu double-hop drops events if listener not yet mounted (no replay queue) | `rpc-handlers.ts` |
| B-4 | LOW | CompanionShell accepts `tab` and `actionNotice` props but ignores both | `CompanionShell.tsx:23` |
| B-5 | LOW | `shouldStartAtCharacterSelectOnLaunch` hardcoded to `false` — dead code path | `shell-routing.ts:28` |
| B-6 | LOW | `agentCloudDisconnectWithConfirm` can hang UI for 10 minutes (600s RPC timeout) | `rpc-handlers.ts` |
| B-7 | INFO | `canvasEval` is explicitly unrestricted — documented XSS escalation surface | `rpc-schema.ts:760` |
| B-8 | INFO | `apiBaseUpdate` token written non-enumerable — invisible to debug inspection | `electrobun-direct-rpc.ts:37` |

### Single Points of Failure (Desktop)
| Failure | Impact |
|---|---|
| `apiBaseUpdate` not delivered | **Entire app broken** — no REST, no WS, no chat |
| `agentStart` RPC failure | **App stuck in loading forever** |
| `desktopShowMessageBox` failure | Cloud disconnect hangs |

### Web vs Desktop Key Differences
| Aspect | Desktop | Web |
|---|---|---|
| API base | Injected via RPC push | Same-origin via Vite proxy |
| Agent startup | RPC → native process | REST polling |
| Permissions | Native macOS APIs via RPC | Not available |
| Startup timeout | 180s | 30s |
| Onboarding patches | 3 applied (force-fresh, local-provider, permissions) | 1 applied (local-provider only) |

---

## 5. Navigation, Views & Client API Surface

### Tab Routing (23 tabs)

| Tab | Component | Critical data fetched |
|---|---|---|
| `chat` | ChatView | `getConfig`, `listConversations`, `getConversationMessages` |
| `companion` | CompanionView (or ChatView if disabled) | Same as chat |
| `settings` | SettingsView | `getConfig`, `getSubscriptionStatus`, `getCloudStatus` |
| `character` | CharacterEditor | `getCharacter`, `getConfig` |
| `wallets` | InventoryView | `getWalletAddresses`, `getWalletBalances`, `getWalletNfts` |
| `knowledge` | KnowledgeView | `listKnowledgeDocuments`, `getKnowledgeStats` |
| `connectors` | ConnectorsPageView → PluginsView | `getPlugins`, `getCorePlugins`, `getConnectors` |
| `triggers` | HeartbeatsView | `getTriggers`, `getTriggerHealth` |
| `stream` | StreamView | `streamStatus`, `getStreamingDestinations` |
| `apps` | AppsPageView (disabled — hardcoded off) | `listApps` |
| `advanced/*` | AdvancedPageView → sub-tab components | Per sub-tab |

**Feature flags:**
- `APPS_ENABLED` = `false` (hardcoded off)
- `STREAM_ENABLED` = `true` (hardcoded on)
- `COMPANION_ENABLED` = env `VITE_ENABLE_COMPANION_MODE` (default `true`)

### MiladyClient Surface (~175 public methods)

**Startup-critical (hard-gated, must succeed):**
1. `getAuthStatus` → decides pairing vs proceed
2. `getOnboardingStatus` → decides onboarding vs main shell
3. `getStatus` → polls until agent `"running"`
4. `startAgent` → POST /api/agent/start
5. `connectWs` → establishes WebSocket

**Tab-breaking if they fail (only that view broken):**
- `getConfig` → breaks ChatView, SettingsView, CharacterEditor
- `listConversations` → breaks chat sidebar + message load
- `getPlugins` → breaks ConnectorsPageView
- `listKnowledgeDocuments` → breaks KnowledgeView
- `getWalletBalances` → breaks InventoryView

### WebSocket Events (13 types)
`status`, `restart-required`, `emote`, `system-warning`, `agent_event`, `heartbeat_event`, `proactive-message`, `conversation-updated`, `pty-session-event`, `plugin-install-progress`, `training_event`, `pty-output`, `ws-reconnected`

### Issues

| ID | Severity | Issue | File |
|---|---|---|---|
| N-1 | MEDIUM | `security` tab silently falls through to PluginsPageView — absent from SubTab type and renderContent switch | `AdvancedPageView.tsx` |
| N-2 | MEDIUM | `conversation-updated` WS handler leaks on teardown (unsubscribe return value discarded) | `AppContext.tsx:7533` |
| N-3 | MEDIUM | SSE chat stream has no client-side timeout — hung stream locks composer indefinitely | `client.ts:4784` |
| N-4 | LOW-MED | `provisionCloudSandbox` bypasses `rawRequest` — raw fetch, no timeout, no ApiError wrapping | `client.ts:5990` |
| N-5 | LOW-MED | `getAuthStatus` only retries on timeout errors — network blips fail immediately without backoff | `client.ts` |
| N-6 | LOW | `actions` tab is dead code — commented out at all 3 layers, falls through to plugins | `AdvancedPageView.tsx` |
| N-7 | LOW | `desktop` tab missing from `titleForTab` — shows app name instead of "Desktop" | `navigation/index.ts` |
| N-8 | LOW | `fine-tuning` nav-hidden but URL-addressable — SUB_TABS entry commented out | `AdvancedPageView.tsx` |
| N-9 | INFO | WS send queue silently drops oldest message at 32 limit — no UI notification | `client.ts:4607` |

---

## Priority Action Items

### P0 — Fix Before Ship
1. **L-1**: Coordinate App.tsx watchdog with Phase 2 deadline (raise to 900s or disable when `startupPhase === "initializing-agent"`)
2. **O-6**: Fix `isOnboardingConnectionComplete` to accept OAuth cloud connections without apiKey
3. **O-7**: Fix `inferCompatibilityOnboardingConnection` to reject empty `remoteApiBase`
4. **A-5**: Gate `/api/plugins/:id/reveal` with `ensureCompatSensitiveRouteAuthorized` for EVM_/SOLANA_ prefix keys

### P1 — Fix Soon
5. **A-1**: Add `ensureCompatApiAuthorized` to `/api/tts/cloud`
6. **O-8**: Clear all provider-related env vars on provider switch / Reset Agent
7. **O-9**: Make model defaults configurable or only write when explicitly selected
8. **L-2 + N-2**: Store and call unsubscribe functions for `conversation-updated` and `proactive-message` WS events
9. **B-1**: Add Steward RPC methods to `MiladyRPCSchema.bun.requests`
10. **O-11**: Debounce or guard double-advance in ElizaCloud OAuth flow
11. **N-1**: Add `security` to AdvancedPageView SubTab type and renderContent switch (or remove from nav)
12. **N-3**: Add client-side timeout to SSE chat stream to prevent compositor lock

### P2 — Improve
13. **B-6**: Add call-site timeout for `agentCloudDisconnectWithConfirm` (30s instead of 600s)
14. **L-5**: Narrow `startupStatus` type to closed union for exhaustive matching
15. **B-2**: Remove vestigial `ipcChannel` param
16. **B-4**: Either use CompanionShell props or remove them from the interface
17. **A-4**: Switch config env filter from allowlist to redact-all-secrets pattern
18. **N-5**: Make `getAuthStatus` retry on network errors, not just timeouts
19. **N-6**: Remove dead `actions` tab from Tab type, TAB_PATHS, and ALL_TAB_GROUPS
20. **N-4**: Route `provisionCloudSandbox` through `rawRequest` for consistent error handling

---

## Files Touched By This Audit

### Critical Path Files (changes here have highest blast radius)
- `packages/app-core/src/state/AppContext.tsx` — startup orchestration, WS setup
- `packages/app-core/src/api/server.ts` — all API routing
- `packages/agent/src/api/server.ts` — upstream API server
- `packages/shared/src/contracts/onboarding.ts` — onboarding type inference
- `packages/app-core/src/api/client.ts` — MiladyClient (HTTP + WS)
- `apps/app/electrobun/src/index.ts` — desktop main process
- `apps/app/electrobun/src/api-base.ts` — API base resolution

### State Files
- `packages/app-core/src/state/useLifecycleState.ts` — lifecycle reducer
- `packages/app-core/src/state/useOnboardingState.ts` — onboarding form state
- `packages/app-core/src/state/persistence.ts` — localStorage IO
- `packages/app-core/src/state/onboarding-resume.ts` — resume logic

### Bridge Files
- `apps/app/electrobun/src/rpc-schema.ts` — RPC type definitions
- `apps/app/electrobun/src/rpc-handlers.ts` — RPC handler implementations
- `apps/app/electrobun/src/bridge/electrobun-direct-rpc.ts` — renderer preload

### Config Files
- `packages/agent/src/api/provider-switch-config.ts` — provider config writes
- `packages/app-core/src/api/server-config-filter.ts` — config redaction
- `packages/app-core/src/config/boot-config.ts` — boot config singleton
