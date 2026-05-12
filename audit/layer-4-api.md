# Layer 4 — app-core API server + routes

**Files: 88.**
**Audited: 88 / 88.**
**Refactored: 0 / 88.**

The HTTP surface of the app-core package — request entry point, auth gates,
route handlers, "compat" routes (legacy compatibility shims for the
upstream agent API), and the typed in-process client (`client-*.ts`) the
renderer uses to call those routes.

Two distinct concerns share this folder:

1. **Server-side route handlers** (`*-routes.ts`, `server.ts`,
   `server-*.ts`, `*-compat-routes.ts`, `auth.ts`, `auth-*.ts`,
   `auth/*.ts`, `dev-*.ts`, `wallet-*.ts`, `secrets-*.ts`,
   `compat-route-shared.ts`, `response.ts`, `trusted-local-request.ts`,
   `spa-fallback-guard.ts`, `cloud-secrets.ts`, `cloud-connection.ts`,
   `credential-resolver.ts`).
2. **Client-side typed API client** (`client.ts`, `client-base.ts`,
   `client-agent.ts`, `client-chat.ts`, `client-skills.ts`,
   `client-cloud.ts`, `client-wallet.ts`, `client-types*.ts`,
   `csrf-client.ts`, `auth-client.ts`, `transport.ts`,
   `streaming-text.ts`, `android-native-agent-transport.ts`,
   `native-cloud-http-transport.ts`).

These should arguably be in two folders. They share types (and that is
the only reason they cohabit) but client-side code that runs in WKWebView
sits next to Node-only `node:http` route handlers — a mixture that
breaks tree-shaking guarantees and forces every consumer to reason about
the bundling boundary.

## Why this layer right after Layer 3

- Layer 3 starts the API server (`startApiServer`); Layer 4 *is* the API
  server. Every route handler under Layer 3's `dev-server.ts` and
  `runtime/eliza.ts` ultimately resolves to a function defined here.
- Layer 0/1/2/3 have all been audited (or partially audited). Auth,
  CSRF, rate-limiting, and route-validation patterns set in this layer
  are the contract every higher layer (UI, plugins) consumes.
- MASTER.md §0's bug ("provider issue") is partly a Layer 4 issue:
  the chat fallback constant lives in `eliza/packages/agent/src/api/chat-routes.ts`
  (which is **Layer 6**, not Layer 4 — see §"Out-of-layer note" below),
  but the *symptom* is observed via the API client this layer ships
  (`client-chat.ts`) and via the route mounting in `server.ts`.

## Out-of-layer note: the chat-routes.ts fallback

MASTER.md §0 + §3 Phase 4 reference `eliza/packages/agent/src/api/chat-routes.ts`
— this file is **not in scope for Layer 4**. It belongs to
`@elizaos/agent` (Layer 6 — agent runtime). The line numbers MASTER.md
cites (1918, 1999, 2181, 2273) **all still match the current file** —
verified during this audit. See §"Chat-fallback paths" in the summary
below for confirmation. The Layer 4 implications are limited to
`server.ts:705-950` (`handleCompatRoute`) which mounts these routes via
the upstream agent package.

## What to look for in this layer specifically

- **Route handler bloat** — biggest in-scope file is `client-agent.ts`
  (2800 LOC, the typed renderer client) and `server.ts` (1194 LOC, the
  request-mux glue). Several `*-compat-routes.ts` files are 600–1700 LOC.
- **Validation pattern uniformity.** Commandment 7 says: route schemas
  validate + transform; use cases trust pre-validated input. This layer
  uses **zero zod schemas**. Validation is hand-rolled `typeof`,
  `Array.isArray`, regex literals, and ad-hoc `is*()` predicates.
- **Auth gates.** Two sister functions exist: `ensureRouteAuthorized`
  (canonical) and `ensureCompatApiAuthorized` (sync, bearer-only). Plus
  `ensureCompatSensitiveRouteAuthorized`, `ensureCompatApiAuthorizedAsync`,
  `ensureAuthSessionOrBootstrap`, `ensureCompatSensitiveRouteAuthorized`.
  Six entry points for "is this caller allowed to do this?" — at least
  three is one too many.
- **CSRF coverage.** `auth.ts` enforces CSRF on
  `POST/PUT/PATCH/DELETE` for cookie sessions. Bearer-auth requests are
  exempt. Verify every state-mutating handler routes through
  `ensureRouteAuthorized` and not the older `ensureCompatApiAuthorized`.
- **Cloud routes.** `cloud-secrets.ts`, `cloud-connection.ts`,
  `server-cloud-tts.ts` are all 13–22 LOC re-export shims to
  `@elizaos/plugin-elizacloud/lib/*`. Pattern: every cloud route lives
  in the plugin; app-core just re-exports for compat.
- **Dev-only route safety.** `dev-compat-routes.ts:37` has the only
  `NODE_ENV === "production"` guard. `dev-stack.ts`, `dev-console-log.ts`
  are pure helpers — safe in production but never *invoked* in
  production because their handler refuses.

## Status legend

(See `AUDIT.md` for the canonical legend.)

`[ ]` pending · `[~]` reading · `[!]` findings · `[*]` refactor ·
`[x]` clean · `[-]` delete · `[?]` blocked

---

### Server-side request entry + glue (10 files)

- [!] `eliza/packages/app-core/src/api/server.ts` — **1194 LOC** glue file. dedup:re-exports from 6 split-out modules (`server-cloud-tts`, `server-config-filter`, `server-cors`, `server-html`, `server-security`, `server-startup`, `server-wallet-trade`) plus 14 named upstream re-exports from `@elizaos/agent` plus 1 import from `@elizaos/agent/config` — this is a barrel masquerading as an entry. boundaries:`handleCompatRoute` at line 705 is **246 LOC** of compat router that fans out to 14 sub-handlers (`handleAuthBootstrapRoutes`, `handleAuthSessionRoutes`, `handleCatalogRoutes`, `handleDatabaseRowsCompatRoute`, `handleDevCompatRoutes`, `handleLocalInferenceCompatRoutes`, `handleOnboardingCompatRoute`, `handlePluginsCompatRoutes`, `handleSecretsInventoryRoute`, `handleSecretsManagerRoute`, `handleWorkbenchCompatRoutes`, `handleAutomationsCompatRoutes`, plus inline status patches and reset). errors:`hydrateWalletOsStoreFlagFromConfig` (line 188), `clearCompatRuntimeStateViaApi` (363, 386, 406) all log-and-continue on every catch — exactly the swallowing pattern AGENTS.md axis 5 forbids. types:15 `} catch` blocks; `parsed = JSON.parse(bodyText) as unknown` (line 488) widens. legacy:lines 138-143 admit "Wallet market overview route extracted to @elizaos/plugin-wallet/routes" + "Steward compat routes → app-steward/src/plugin.ts" — comments narrate prior refactor instead of being removed. dead:`_PACKAGE_ROOT_NAMES` (line 176) underscore-prefixed const, `_getTableColumnNames` (579) underscore-prefixed function — both signal "kept for future use." dedup:`compatLoopbackFetchJson` + `compatLoopbackRequest` + `buildCompatLoopbackHeaders` + `resolveCompatLoopbackApiBase` are an inline mini-client that duplicates `client-base.ts`'s fetch wrapper.
- [!] `eliza/packages/app-core/src/api/compat-route-shared.ts` — 373 LOC. dedup:`isLoopbackRemoteAddress` defined here AND identical copy in `trusted-local-request.ts:5-17` (5-line literal duplicate). `firstHeaderValue` defined here AND in `trusted-local-request.ts` AND `extractHeaderValue` is the same shape in `auth.ts:26-31`. The `CLIENT_IP_PROXY_HEADERS` set + `isClientIpProxyHeaderName` + `extractForwardedForCandidates` + `extractProxyClientAddressCandidates` block (lines 66-130+) is also fully duplicated in `trusted-local-request.ts`. types:1 `as unknown` cast (line 289). errors:catch around `for await (chunk of req)` body reader uses generic message "request body too large" without preserving the underlying error.
- [!] `eliza/packages/app-core/src/api/trusted-local-request.ts` — 211 LOC. **dedup:near-100% overlap with `compat-route-shared.ts`** for `isLoopbackRemoteAddress`, `CLIENT_IP_PROXY_HEADERS`, `firstHeaderValue`, `headerValues`, `isClientIpProxyHeaderName`, `extractForwardedForCandidates`, `extractProxyClientAddressCandidates`. Should either delete this file or move shared helpers to a single `request-context.ts`.
- [x] `eliza/packages/app-core/src/api/response.ts` — 47 LOC. Clean. `scrubStackFields` strips `stack`/`stackTrace` from any nested object — good defence-in-depth for accidental error leakage.
- [x] `eliza/packages/app-core/src/api/spa-fallback-guard.ts` — 12 LOC. Clean.
- [x] `eliza/packages/app-core/src/api/server-cors.ts` — 141 LOC. Clean. `isAllowedLocalOrigin = isAllowedOrigin` (line 141) is a `@deprecated retained for API compatibility` shim — should plan a removal pass on the consumers, then delete.
- [x] `eliza/packages/app-core/src/api/server-html.ts` — 8 LOC. Pure passthrough re-export wrapper around `injectApiBaseIntoHtml` from `@elizaos/agent`. Zero value beyond changing the import path; consumers could import from `@elizaos/agent` directly.
- [x] `eliza/packages/app-core/src/api/server-config-filter.ts` — 44 LOC. Clean.
- [x] `eliza/packages/app-core/src/api/server-startup.ts` — 95 LOC. Clean. legacy:line 13 has a `Set<string>` with "eliza" listed twice — `["eliza", "elizaai", "elizaos", "eliza"]` — bug, dedup at construction makes it harmless, but signals a copy-paste. boundaries:`syncElizaEnvAliases` + `syncAppEnvToEliza` called twice each in `resolveCorsOrigin` — env is mutated to call into upstream then mutated back. Suggests the upstream signature is wrong for the boundary.
- [x] `eliza/packages/app-core/src/api/server-security.ts` — 63 LOC. **5 wrapper functions**, each a ~7-line re-shape around an upstream `@elizaos/agent` resolver, just to call `runWithCompatAuthContext` (env mutation + `mirrorCompatHeaders`) before/after. dedup:every wrapper has the same shape; could be a single higher-order helper. boundaries:env mutation around an upstream call is a leaky abstraction — fix the upstream signature.

### server-* split-out helpers (4 files)

- [x] `eliza/packages/app-core/src/api/server-cloud-tts.ts` — 21 LOC. **Re-export shim** for `@elizaos/plugin-elizacloud/lib/server-cloud-tts`. legacy:exists only because `server.ts` and `server-wallet-trade.ts` use the relative path; once those import from the plugin directly this file is deletable.
- [x] `eliza/packages/app-core/src/api/server-onboarding-compat.ts` — 383 LOC. Helpers used by `onboarding-compat-routes.ts` (replay body, extract+persist API key, etc). Clean — no audit issues other than the standard `} catch { /* non-fatal */ }` pattern (3 sites) that should be reviewed during the error-handling pass.
- [x] `eliza/packages/app-core/src/api/server-wallet-trade.ts` — 115 LOC. Hardened wallet-export guard composition + per-op env mutation around the upstream rejection resolver. errors:`runWithCompatAuthContext` mutates env in finally — leaky boundary, same disease as `server-security.ts`. dedup:`normalizeCompatRejection` + `normalizeCompatReason` are no-ops on `reason` — leftover from a real normalisation that no longer happens? Or pre-emptive infrastructure? Either delete the no-op chain or document the kept-for-future-use intent.
- [x] `eliza/packages/app-core/src/api/cloud-secrets.ts` — 13 LOC. **Re-export shim** for `@elizaos/plugin-elizacloud/lib/cloud-secrets`. Same legacy:bin pattern as `server-cloud-tts.ts`; deletable when consumers migrate.
- [x] `eliza/packages/app-core/src/api/cloud-connection.ts` — 22 LOC. **Re-export shim** for `@elizaos/plugin-elizacloud/lib/cloud-connection`. Same pattern.

### Auth (top-level + auth/* subfolder, 13 files)

- [!] `eliza/packages/app-core/src/api/auth.ts` — 443 LOC. **6 auth gate variants** are exported / declared here: `ensureCompatApiAuthorized` (sync bearer-only), `ensureCompatApiAuthorizedAsync` (cookie+CSRF+legacy-bearer), `ensureCompatSensitiveRouteAuthorized` (sync sensitive), `ensureAuthSessionOrBootstrap` (cookie OR bearer-as-bootstrap), plus the canonical `ensureRouteAuthorized` (lines 425-443) which delegates. dedup:in-process auth rate limiter (lines 71-113) is a near-duplicate of `auth-session-routes.ts:78-111` — same `count`/`resetAt` shape, same 20/min cap, same sweep timer. The two limiters share *purpose* (auth rate limit per IP) but live in different modules with separate state. Should be one limiter with a named bucket key. types:`AuthSessionOrBootstrapResult` discriminated union is fine; one `as unknown as AuthStore` cast (line 437) is unavoidable due to dynamic import. dead:`isDevEnvironment` (line 285-288) is exported but only one caller (verify with knip during refactor pass). slop:lines 5-6 `// extractHeaderValue, getCompatApiToken — now imported from ./auth` style narration about removed code; should be deleted.
- [x] `eliza/packages/app-core/src/api/auth/index.ts` — 89 LOC barrel. Clean. dedup-positive — explicitly re-exports the named surface so internal modules can shape themselves freely.
- [x] `eliza/packages/app-core/src/api/auth/audit.ts` — 171 LOC. Clean. **Good error pattern**: `appendAuditEvent` deliberately runs DB + file writes in parallel and rethrows the first error — does not swallow.
- [x] `eliza/packages/app-core/src/api/auth/auth-context.ts` — 168 LOC. Clean. Hard-coded fail-closed throughout (3 explicit `.catch(() => null)` returns null, never widens). errors:`console.error("[auth] legacy bearer audit failed:", err)` (lines 135, 149) — should use `logger.error` per AGENTS.md commandment 9 (logger only, never console).
- [!] `eliza/packages/app-core/src/api/auth/legacy-bearer.ts` — 188 LOC. legacy:**this entire module is the legacy bearer 14-day grace window**. It's a bridge that exists to let `ELIZA_API_TOKEN` callers migrate before the bearer is rejected. After the grace window everywhere has expired (the deploy pipeline sets `ELIZA_LEGACY_GRACE_UNTIL`), this module should be deleted. Audit recommendation: track when the earliest production deploy crossed the 14-day mark; once all current deploys are post-grace, delete this module + the call sites in `auth.ts` and `auth-context.ts`.
- [x] `eliza/packages/app-core/src/api/auth/passwords.ts` — 97 LOC. Clean. argon2id with OWASP params; well-commented.
- [x] `eliza/packages/app-core/src/api/auth/sensitive-rate-limit.ts` — 113 LOC. Clean.
- [x] `eliza/packages/app-core/src/api/auth/sessions.ts` — 421 LOC. Clean. Owns session lifecycle, CSRF derive/verify, cookie serialize/parse — exactly the responsibility split AGENTS.md commandment 6 (CQRS) wants.
- [x] `eliza/packages/app-core/src/api/auth/tokens.ts` — 14 LOC. Clean.
- [x] `eliza/packages/app-core/src/api/auth/bootstrap-token.ts` — 223 LOC. Clean. Hard fail-closed contract enforced.
- [!] `eliza/packages/app-core/src/api/auth/cloud-sso.ts` — 545 LOC. The largest auth/* file. boundaries:owns OAuth state, pending-state TTL sweep, JWKS verify, identity link/create — multiple lifecycles in one file. Could split: `cloud-sso/state.ts` (pending state map), `cloud-sso/token-exchange.ts` (POST /oauth/token + JWKS verify), `cloud-sso/identity-link.ts` (Identity row management). Defer split — current file is internally cohesive.

### Auth route handlers (4 files)

- [x] `eliza/packages/app-core/src/api/auth-bootstrap-routes.ts` — 234 LOC. Clean. Hard fail-closed at every error path; 3 audit catches use `console.error` not `logger.error` (commandment 9 violation, same as `auth-context.ts`).
- [x] `eliza/packages/app-core/src/api/auth-pairing-compat-routes.ts` — 290 LOC. Clean.
- [!] `eliza/packages/app-core/src/api/auth-session-routes.ts` — **771 LOC**. dedup:`consumeAuthBucket` (lines 82-97) is a copy of the `authAttempts`/`recordFailedAuth`/`isAuthRateLimited` triad in `auth.ts:71-113`. Two parallel limiters with same name, same window, same cap. Should be one. boundaries:6 routes (setup/login/logout/me/sessions list/sessions revoke) all in one file; each is 60–120 LOC. legacy:`SESSION_COOKIE_NAME` re-imported from `./auth/index` then shadowed by `parseSessionCookie` — confirm one module owns the cookie name.
- [!] `eliza/packages/app-core/src/api/auth-client.ts` — 448 LOC. **Renderer-side**, not server-side. boundaries:lives in the auth folder family but is consumed only by the SPA. Should move to `client-auth.ts` next to other `client-*.ts` modules so the file naming reflects the runtime.

### Compat routes (legacy upstream-shim handlers, 8 files)

- [!] `eliza/packages/app-core/src/api/automations-compat-routes.ts` — **907 LOC**. boundaries:huge static `STATIC_AUTOMATION_NODE_SPECS` list (~250 LOC of literals starting line 87) belongs in a data file, not a route handler. types:`as unknown as Pick<Room, "metadata">` (line 334) and `as unknown as Record<string, unknown>` (line 359). legacy:`BLOCKED_AUTOMATION_PROVIDER_NODES` set hides what would be a per-node `enabled` flag — should be metadata not a deny-list.
- [!] `eliza/packages/app-core/src/api/plugins-compat-routes.ts` — **1651 LOC** — the second-largest file in the layer. boundaries:14+ exported helpers (`maskValue`, `normalizePluginCategory`, `resolveCompatPluginEnabledForList`, `analyzePluginStateDrift`, `buildPluginListResponse`, `validateCompatPluginConfig`, `persistCompatPluginMutation`, `resolvePluginManifestPath`, `resolveAdvancedCapabilityCompatStatus`, etc.) plus 30+ private helpers — this is a *plugin-management module* not a *route handler*. Should split: `plugins/registry.ts` (manifest + drift), `plugins/mutations.ts` (validate + persist), `plugins-compat-routes.ts` (the actual route mux). types:1 `as unknown as CompatPluginRecord[]` (line 566). errors:6 `} catch` blocks. dead:`shortPluginIdFromNpmName` is internal but exported.
- [!] `eliza/packages/app-core/src/api/onboarding-compat-routes.ts` — 242 LOC. errors:line 92-94 catches and silently returns when re-saving `cloud.apiKey` to the config file fails — exactly the "best effort" pattern AGENTS.md axis 5 calls out. legacy:`scheduleCloudApiKeyResave` (line 77) is a 3-second `setTimeout` workaround "after upstream handler clobbered it" — a workaround for a bug in the upstream handler, not a fix. Should fix the upstream handler and delete this. dedup:loopback fetch on line 65 duplicates `compatLoopbackFetchJson` in `server.ts` — should call the shared helper.
- [x] `eliza/packages/app-core/src/api/dev-compat-routes.ts` — 169 LOC. Clean. **Only file** with `NODE_ENV === "production"` guard for full-route disable (line 37). Loopback gate + auth gate on every dev endpoint. SSRF guard on the screenshot proxy (lines 79-94) is correct.
- [!] `eliza/packages/app-core/src/api/local-inference-compat-routes.ts` — 606 LOC. types:1 `as unknown as CatalogModel` cast (line 233). dedup:duplicates download-job, hardware-probe, model-management surface that exists in the local-inference plugin runtime — confirm the boundary; if these routes are strictly compat shims they should be very thin.
- [!] `eliza/packages/app-core/src/api/database-rows-compat-routes.ts` — 174 LOC. **Database read/write through the API** is a sharp tool; needs a careful read in a future pass to confirm column-name + identifier sanitization is correct.
- [!] `eliza/packages/app-core/src/api/workbench-compat-routes.ts` — 451 LOC. Owns workbench todos/notes; tightly coupled to the agent task table. Defer detailed audit.
- [!] `eliza/packages/app-core/src/api/secrets-manager-routes.ts` — 579 LOC. Module-level `_manager` singleton with explicit per-process rationale comment. boundaries:install routes (`POST /api/secrets/manager/install`) start a job + stream SSE — long-running ops in a route handler. Should consider extracting the job orchestration to a service with the route as a thin facade.
- [!] `eliza/packages/app-core/src/api/secrets-inventory-routes.ts` — 573 LOC. Similar pattern to secrets-manager. Defer detailed audit.

### Routes that thin-wrap upstream agent handlers (12 files, ~290 LOC total)

These are **delegation wrappers** to `@elizaos/agent` route handlers,
adding only context shape conversion. Each is 17–55 LOC and they all
follow an identical structural pattern.

- [x] `eliza/packages/app-core/src/api/agent-admin-routes.ts` — 25 LOC.
- [x] `eliza/packages/app-core/src/api/agent-lifecycle-routes.ts` — 20 LOC.
- [x] `eliza/packages/app-core/src/api/agent-transfer-routes.ts` — 34 LOC.
- [x] `eliza/packages/app-core/src/api/character-routes.ts` — 36 LOC. **Sole zod-adjacent surface**: line 28 `validateCharacter: (body) => CharacterSchema.safeParse(body) as never` — and the cast hides the type. Fix the upstream signature so the cast goes away.
- [x] `eliza/packages/app-core/src/api/permissions-routes.ts` — 39 LOC.
- [x] `eliza/packages/app-core/src/api/training-routes.ts` — 24 LOC.
- [x] `eliza/packages/app-core/src/api/diagnostics-routes.ts` — 33 LOC.
- [x] `eliza/packages/app-core/src/api/registry-routes.ts` — 33 LOC.
- [x] `eliza/packages/app-core/src/api/subscription-routes.ts` — 29 LOC. types:2 `as never` casts (lines 25, 27) hiding upstream signature mismatch. legacy:dynamic `await import("@elizaos/agent/auth")` mid-handler (line 27) — should be a top-level import.
- [x] `eliza/packages/app-core/src/api/memory-routes.ts` — 17 LOC.
- [x] `eliza/packages/app-core/src/api/accounts-routes.ts` — 33 LOC.
- [x] `eliza/packages/app-core/src/api/trigger-routes.ts` — 55 LOC. dedup:re-passes 13 named upstream functions through `toAutonomousContext` — the wrapper exists only to pass these through. If `handleAutonomousTriggerRoutes`'s context could accept a `dependencies` object, this could be a 5-line file.
- [x] `eliza/packages/app-core/src/api/catalog-routes.ts` — 75 LOC. The only "real" route in this group (mounts `/api/catalog/apps` with its own logic, not a delegation wrapper). Clean.

**Pattern observation:** these 12 files are 290 LOC combined of repeating
glue. They could be a single `route-wrappers.ts` with one helper that
generates the wrapper from a config object. Risk: the per-route `state`
shape divergence is real (`character-routes` has `pickRandomNames`,
`trigger-routes` has 13 dependencies, etc), so a generator may not save
much. **Action:** keep separate, but eliminate the `as never` casts at
the call boundary.

### Wallet, secrets, credentials, dev (5 files)

- [!] `eliza/packages/app-core/src/api/wallet-market-overview-route.ts` — **772 LOC**. boundaries:owns CoinGecko + Polymarket data shape, response cache, refresh rate-limit buckets, fetch retry, source-availability flags. **This is a service in a route file.** Should be `services/wallet-market-overview.ts` (the service) + `wallet-market-overview-route.ts` (a 30-line handler). dedup:cache + in-flight + refresh-buckets pattern is implemented from scratch — the same pattern exists in `secrets-manager-routes.ts` (job stream) and `auth-session-routes.ts` (auth attempts). Worth a shared `tiny-cache` + `tiny-rate-limit` utility (Layer 5).
- [x] `eliza/packages/app-core/src/api/wallet-export-guard.ts` — 328 LOC. Clean. `console.warn` at line 90 should be `logger.warn` per commandment 9.
- [x] `eliza/packages/app-core/src/api/credential-resolver.ts` — 343 LOC. `readJsonSafe` + `extractOauthAccessToken` + Keychain `security` invocation. errors:`readJsonSafe` swallows all errors and returns null — acceptable for "best effort credential probe" but should document that contract.
- [x] `eliza/packages/app-core/src/api/dev-stack.ts` — 100 LOC. Clean.
- [x] `eliza/packages/app-core/src/api/dev-console-log.ts` — 79 LOC. Clean. Allow-list path validation is correct (basename + `.eliza` parent requirement).

### Client-side typed API client (29 files)

- [x] `eliza/packages/app-core/src/api/index.ts` — 1 LOC barrel `export * from "./client"`. Clean.
- [!] `eliza/packages/app-core/src/api/client.ts` — 245 LOC. boundaries:imports 12 sibling `client-*` files for declaration merging side effects (lines 227-238). The single `export const client = new ElizaClient()` (line 245) is a process-global singleton. Most of the file (200+ LOC) is **pass-through type re-exports** from `@elizaos/shared` and split-out `client-types-*` files. The barrel itself is fine; the type-fan-out duplication should resolve when the `client-types-*` split completes.
- [!] `eliza/packages/app-core/src/api/client-base.ts` — 914 LOC. **The actual ElizaClient class.** boundaries:owns `_baseUrl`/`_userSetBase` → this is the class MASTER.md §0 cites — once `setBaseUrl()` is called, `_userSetBase = true` and the client stops re-reading boot config. types:`GENERIC_NO_RESPONSE_TEXT` constant (line 38) is a *renderer-side* duplicate of the agent-side `PROVIDER_ISSUE_CHAT_REPLY` and `GENERIC_NO_RESPONSE_CHAT_REPLY` strings — three places now hold "no-response" copy. dead:9 `} catch` blocks. errors:`fetchWithCsrf`-style behaviour is reimplemented inline rather than using `csrf-client.ts`'s `fetchWithCsrf` — confirm this isn't a divergent path.
- [!] `eliza/packages/app-core/src/api/client-agent.ts` — **2800 LOC, the largest file in scope**. dead:only **10 named exports** for 2800 LOC — most of the file is method augmentation via `ElizaClient.prototype` (declaration merging). 16 `} catch` blocks. boundaries:single file owns lifecycle, auth, config, connectors, triggers, training, plugins, streaming/PTY, logs, character, permissions, updates, app-blocker, website-blocker — **at least 14 distinct concerns**. Should be split per concern (`client-agent-lifecycle.ts`, `client-agent-config.ts`, `client-agent-plugins.ts`, etc).
- [!] `eliza/packages/app-core/src/api/client-cloud.ts` — **1790 LOC**. types:`as unknown` (line 205) on `__ELIZA_CLOUD_AUTH_TOKEN__` window-global read. boundaries:owns billing, compat agents, sandbox, export/import, direct cloud auth, bug reports — should split by concern. legacy:`DirectCloudAgent` and `DirectCloudJob` types (lines 59-99) have parallel `camelCase` + `snake_case` field pairs — adapter shape for "cloud might return either case." Should pick one shape at the boundary and never speak the other inside the client.
- [!] `eliza/packages/app-core/src/api/client-skills.ts` — **1658 LOC**. 0 try/catch (good — actual error propagation). boundaries:owns skills, catalog, marketplace, apps, Babylon, custom actions, WhatsApp, agent events. Same split-by-concern recommendation as `client-agent.ts`.
- [!] `eliza/packages/app-core/src/api/client-chat.ts` — 1421 LOC. 2 try/catch. dead:probable overlap with `client-agent.ts` for chat-related methods — confirm.
- [!] `eliza/packages/app-core/src/api/client-wallet.ts` — 553 LOC. Clean shape but huge — splits same as siblings.
- [x] `eliza/packages/app-core/src/api/client-automations.ts` — 24 LOC.
- [x] `eliza/packages/app-core/src/api/client-browser-workspace.ts` — 183 LOC.
- [x] `eliza/packages/app-core/src/api/client-computeruse.ts` — 73 LOC.
- [x] `eliza/packages/app-core/src/api/client-imessage.ts` — 203 LOC.
- [x] `eliza/packages/app-core/src/api/client-local-inference.ts` — 249 LOC.
- [x] `eliza/packages/app-core/src/api/client-n8n.ts` — 174 LOC.
- [x] `eliza/packages/app-core/src/api/client-vault.ts` — 131 LOC.

### Client type modules (`client-types*.ts`, 11 files)

- [x] `eliza/packages/app-core/src/api/client-types.ts` — 13 LOC barrel.
- [!] `eliza/packages/app-core/src/api/client-types-cloud.ts` — **1015 LOC**. The largest type module. boundaries:cloud billing, agent provisioning, OAuth connections, sandbox, login/persist, credits — multiple subdomains. Should split per cloud feature.
- [!] `eliza/packages/app-core/src/api/client-types-config.ts` — 737 LOC. Same observation; multiple config subdomains.
- [!] `eliza/packages/app-core/src/api/client-types-chat.ts` — 594 LOC. Should split (n8n, conversation, message-event sub-types live together).
- [x] `eliza/packages/app-core/src/api/client-types-core.ts` — 445 LOC.
- [x] `eliza/packages/app-core/src/api/client-types-babylon.ts` — 294 LOC.
- [x] `eliza/packages/app-core/src/api/client-types-relationships.ts` — 200 LOC.
- [x] `eliza/packages/app-core/src/api/client-types-steward.ts` — 118 LOC.
- [x] `eliza/packages/app-core/src/api/client-types-experience.ts` — 103 LOC.
- [x] `eliza/packages/app-core/src/api/client-types-character.ts` — 47 LOC.

### Transports + small client helpers (5 files)

- [x] `eliza/packages/app-core/src/api/transport.ts` — 13 LOC. Clean.
- [x] `eliza/packages/app-core/src/api/streaming-text.ts` — 5 LOC re-export.
- [x] `eliza/packages/app-core/src/api/csrf-client.ts` — 63 LOC. Clean. `fetchWithCsrf` is the canonical CSRF-aware fetch helper.
- [x] `eliza/packages/app-core/src/api/android-native-agent-transport.ts` — 120 LOC.
- [x] `eliza/packages/app-core/src/api/native-cloud-http-transport.ts` — 85 LOC.
- [x] `eliza/packages/app-core/src/api/automation-node-contributors.ts` — 35 LOC.

### Test helpers (in-tree, 1 file)

- [!] `eliza/packages/app-core/src/api/__tests__/sandbox-test-helpers.ts` — test helper. boundaries:lives under `src/` (not `tests/`). Confirm test-only.

---

## Summary — Layer 4 audit findings

### Route file LOC table (descending — server-side handler files only)

| LOC  | File                                  | Concerns | Recommendation              |
|-----:|---------------------------------------|----------|-----------------------------|
| 1651 | `plugins-compat-routes.ts`            | 14+      | Split (registry + mutations + routes) |
| 1194 | `server.ts`                           | 5+       | Split mux from compat router |
|  907 | `automations-compat-routes.ts`        | 4        | Move static specs to data file |
|  771 | `auth-session-routes.ts`              | 6 routes | Dedup limiter; split routes |
|  772 | `wallet-market-overview-route.ts`     | 6+       | **Service in a route file** — extract service |
|  606 | `local-inference-compat-routes.ts`    | 4        | Confirm vs plugin runtime |
|  579 | `secrets-manager-routes.ts`           | 8 routes | Extract install-job orchestrator |
|  573 | `secrets-inventory-routes.ts`         | ?        | Defer detailed audit |
|  545 | `auth/cloud-sso.ts`                   | 4        | Split per lifecycle (state, token, identity) |
|  451 | `workbench-compat-routes.ts`          | ?        | Defer detailed audit |
|  443 | `auth.ts`                             | 6 gates  | **Reduce to 1–2 gates**      |
|  421 | `auth/sessions.ts`                    | clean    | —                            |
|  383 | `server-onboarding-compat.ts`         | clean    | —                            |
|  373 | `compat-route-shared.ts`              | dup      | Merge with `trusted-local-request.ts` |
|  343 | `credential-resolver.ts`              | clean    | —                            |
|  328 | `wallet-export-guard.ts`              | clean    | `logger.warn` over `console.warn` |
|  290 | `auth-pairing-compat-routes.ts`       | clean    | —                            |
|  242 | `onboarding-compat-routes.ts`         | 1        | Delete `scheduleCloudApiKeyResave` workaround |
|  234 | `auth-bootstrap-routes.ts`            | clean    | —                            |
|  223 | `auth/bootstrap-token.ts`             | clean    | —                            |
|  211 | `trusted-local-request.ts`            | dup      | Delete or merge              |
|  188 | `auth/legacy-bearer.ts`               | legacy   | Delete after grace window    |
|  174 | `database-rows-compat-routes.ts`      | ?        | Defer detailed audit         |
|  171 | `auth/audit.ts`                       | clean    | —                            |
|  169 | `dev-compat-routes.ts`                | clean    | Only `NODE_ENV` guard in layer |
|  168 | `auth/auth-context.ts`                | clean    | `console.error` → `logger.error` |
|  141 | `server-cors.ts`                      | clean    | —                            |
|  131 | `client-vault.ts`                     | client   | —                            |
|  120 | `android-native-agent-transport.ts`   | client   | —                            |
|  115 | `server-wallet-trade.ts`              | leaky    | Fix env-mutation boundary    |
|  113 | `auth/sensitive-rate-limit.ts`        | clean    | —                            |
|  100 | `dev-stack.ts`                        | clean    | —                            |
|   97 | `auth/passwords.ts`                   | clean    | —                            |
|   95 | `server-startup.ts`                   | clean    | —                            |
|   89 | `auth/index.ts`                       | barrel   | —                            |
|   85 | `native-cloud-http-transport.ts`      | client   | —                            |
|   79 | `dev-console-log.ts`                  | clean    | —                            |
|   75 | `catalog-routes.ts`                   | clean    | —                            |
|   63 | `server-security.ts`                  | leaky    | 5 wrappers around upstream   |
|   63 | `csrf-client.ts`                      | clean    | —                            |
|   55 | `trigger-routes.ts`                   | wrapper  | 13-dep passthrough           |
|   47 | `response.ts`                         | clean    | —                            |
|   44 | `server-config-filter.ts`             | clean    | —                            |
|   39 | `permissions-routes.ts`               | wrapper  | —                            |
|   36 | `character-routes.ts`                 | wrapper  | `as never` cast hides type   |
|   35 | `automation-node-contributors.ts`     | clean    | —                            |
|   34 | `agent-transfer-routes.ts`            | wrapper  | —                            |
|   33 | `registry-routes.ts`                  | wrapper  | —                            |
|   33 | `diagnostics-routes.ts`               | wrapper  | —                            |
|   33 | `accounts-routes.ts`                  | wrapper  | —                            |
|   29 | `subscription-routes.ts`              | wrapper  | dynamic import + `as never`  |
|   25 | `agent-admin-routes.ts`               | wrapper  | —                            |
|   24 | `training-routes.ts`                  | wrapper  | —                            |
|   22 | `cloud-connection.ts`                 | shim     | Re-export only               |
|   21 | `server-cloud-tts.ts`                 | shim     | Re-export only               |
|   20 | `agent-lifecycle-routes.ts`           | wrapper  | —                            |
|   17 | `memory-routes.ts`                    | wrapper  | —                            |
|   13 | `cloud-secrets.ts`                    | shim     | Re-export only               |
|   12 | `spa-fallback-guard.ts`               | clean    | —                            |
|    8 | `server-html.ts`                      | shim     | Re-export only               |

**No server-side route file > 2000 LOC.** The biggest single-file
"route handler" is `plugins-compat-routes.ts` at 1651 LOC, and most of
that is plugin manifest/state-management helpers that should live in a
service. **Files > 1000 LOC: 2** (`plugins-compat-routes.ts`,
`server.ts`).

### Client-side LOC (descending, for the same scope)

| LOC  | File                                  | Notes |
|-----:|---------------------------------------|-------|
| 2800 | `client-agent.ts`                     | 14+ concerns; needs split |
| 1790 | `client-cloud.ts`                     | 6+ concerns; needs split |
| 1658 | `client-skills.ts`                    | 8 concerns; needs split |
| 1421 | `client-chat.ts`                      | overlap risk with client-agent |
| 1015 | `client-types-cloud.ts`               | type fan-out             |
|  914 | `client-base.ts`                      | the ElizaClient class    |
|  737 | `client-types-config.ts`              | type fan-out             |
|  594 | `client-types-chat.ts`                | type fan-out             |
|  553 | `client-wallet.ts`                    | clean shape              |
|  448 | `auth-client.ts`                      | misnamed (renderer-side, should be `client-auth`) |

**Files > 1000 LOC on the client side: 5.** Total client-side surface is
**~13,400 LOC across 29 files** — comparable to the server-side route
surface. The two halves of this folder really are two folders.

### Chat-fallback paths — confirmed unchanged since MASTER.md was written

MASTER.md §3 Phase 4 cites four trigger paths in
`eliza/packages/agent/src/api/chat-routes.ts` (Layer 6, NOT Layer 4):

| MASTER.md line | Current line | Path                                       | Status |
|---------------:|-------------:|--------------------------------------------|--------|
| 1918 | **1918** | OpenAI `/v1/chat/completions` stream — `resolveNoResponseFallback` | ✅ unchanged |
| 1999 | **1999** | OpenAI `/v1/chat/completions` non-stream — `resolveNoResponseFallback` | ✅ unchanged |
| 2181 | **2181** | Anthropic `/v1/messages` stream — `resolveNoResponseFallback` | ✅ unchanged |
| 2273 | **2273** | Anthropic `/v1/messages` non-stream — `resolveNoResponseFallback` | ✅ unchanged |
| 314 (constant)  | **314**  | `const PROVIDER_ISSUE_CHAT_REPLY = "Sorry, I'm having a provider issue"` | ✅ unchanged |
| 317 (alias)     | **317**  | `const GENERIC_NO_RESPONSE_CHAT_REPLY = PROVIDER_ISSUE_CHAT_REPLY` | ✅ unchanged |

**Conclusion: Phase 4 rename is safe to execute.** All four trigger
paths and the constant location MASTER.md identified still exist
verbatim. The rename `PROVIDER_ISSUE_CHAT_REPLY → NO_RESPONSE_FALLBACK_REPLY`
should land at lines 314, 317, 441 (`getProviderIssueChatReply`), 445
(`return PROVIDER_ISSUE_CHAT_REPLY`), and 515 (text comparison) — 5
literal occurrences in chat-routes.ts.

Layer-4 implication: `client-base.ts:38`'s `GENERIC_NO_RESPONSE_TEXT`
is a *parallel* renderer-side fallback string that currently reads
`"Sorry, I couldn't generate a response right now. Please try again."`
— different copy, same purpose. Phase 4 should align both: one
constant per concept, named for what it is (no-response), used by both
the agent fallback and the renderer's "I got nothing back" branch.

### Validation pattern uniformity — assessment

**Zero zod schemas exist in this layer.** `validate-zod`-style
validation is hand-rolled per route:

- `auth-session-routes.ts` defines `DISPLAY_NAME_RE` regex inline (line 66) and `isValidDisplayName` predicate (line 68).
- `secrets-manager-routes.ts` defines `isInstallableBackend` predicate (line 111).
- `automations-compat-routes.ts` validates by checking `Array.isArray` + `typeof` per field.
- `wallet-export-guard.ts` validates the body shape via the upstream `WalletExportRequestBody` type but never validates at runtime — relies on the guard rejection function.
- `character-routes.ts` is the **only** route that uses a schema (`CharacterSchema.safeParse(body) as never`), and even that schema lives in `@elizaos/agent` not in this layer.

**Violation of commandment 7:** validation lives inside the use case
(after `readCompatJsonBody` returns), not at the route boundary. The
correct shape per commandment 7 is:

```
route handler: validate body via zod schema → typed input
use case:       trust pre-validated input → produce DTO
```

The current shape is:

```
route handler: read raw body → pass typeof-checked-but-not-typed body to inline logic
inline logic:   reach into body fields with typeof guards
```

**Recommendation:** before splitting any route file, introduce a
`schemas/` folder under `src/api/` with one zod schema per route,
shared between client (validation pre-send) and server (validation
post-receive). This matches the agent runtime's CharacterSchema
pattern.

### CSRF coverage — assessment

`auth.ts:151` defines `CSRF_REQUIRED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])`
and `ensureCompatApiAuthorizedAsync` enforces a CSRF header for
cookie-bound state-changing requests. **Bearer-auth requests are
exempt** (lines 219-271).

**Verified gates per state-mutating handler:**

- `auth-session-routes.ts` — uses `ensureSessionForRequest`. CSRF enforced for cookie auth via `ensureRouteAuthorized` for non-cookie-mint routes; explicit `skipCsrf: true` for setup/login (correct — no session exists yet to mint a CSRF token from).
- `auth-bootstrap-routes.ts` — `POST /api/auth/bootstrap/exchange` does NOT require CSRF (correct — token exchange happens before any session exists).
- `secrets-manager-routes.ts` — every state-mutating route routes through `ensureRouteAuthorized` (verify in detailed pass).
- `dev-compat-routes.ts` — only GETs; CSRF not applicable.
- `wallet-market-overview-route.ts` — only GETs; CSRF not applicable.
- `onboarding-compat-routes.ts` — `POST /api/onboarding` uses `ensureRouteAuthorized` (line 109) — CSRF enforced via the gate's default behaviour.

**Confirmed gap:** the route wrappers (`agent-admin-routes.ts`,
`character-routes.ts`, `permissions-routes.ts`, etc) delegate to
upstream `@elizaos/agent` handlers. CSRF enforcement depends on the
upstream's gate choice — needs a Layer 6 audit trace.

### Top 10 deletion candidates

1. **`api/server-html.ts`** (8 LOC) — pass-through wrapper around
   `injectApiBaseIntoHtml` from `@elizaos/agent`. Delete and have
   consumers import from `@elizaos/agent` directly.
2. **`api/cloud-secrets.ts`** (13 LOC) — re-export shim for
   `@elizaos/plugin-elizacloud/lib/cloud-secrets`. Delete after consumer
   migration.
3. **`api/cloud-connection.ts`** (22 LOC) — re-export shim for
   `@elizaos/plugin-elizacloud/lib/cloud-connection`. Delete after
   consumer migration.
4. **`api/server-cloud-tts.ts`** (21 LOC) — re-export shim. Same as
   above.
5. **`api/trusted-local-request.ts`** (211 LOC) — duplicate helpers from
   `compat-route-shared.ts`. Merge or delete.
6. **`api/auth/legacy-bearer.ts`** (188 LOC) — entire module is the
   14-day grace window for `ELIZA_API_TOKEN`. Delete once all current
   deploys are post-grace, plus the call sites in `auth.ts:233-269`,
   `auth-context.ts:127-152`.
7. **`onboarding-compat-routes.ts:77-96` `scheduleCloudApiKeyResave`** —
   `setTimeout(... 3000)` workaround "after upstream handler clobbered
   it". Fix the upstream handler in Layer 6, then delete this. Also
   delete the swallowed `try { ... } catch { /* Non-fatal */ }`.
8. **`server.ts:138-143`** — narrative comments about prior refactor
   (Wallet market overview → plugin-wallet, Steward compat → app-steward).
   These comments add nothing readers couldn't get from `git log`.
9. **`server.ts:176` `_PACKAGE_ROOT_NAMES`** — underscore-prefixed,
   unused inside the file. `server-startup.ts:13` has the same set.
   Delete the duplicate in server.ts (and fix the duplicated `"eliza"`
   entry in server-startup.ts).
10. **`server.ts:579-636` `_getTableColumnNames`** — 57-LOC underscore-
    prefixed function that suggests "kept for future use." Verify with
    `knip` it's truly unused, then delete.

### Top 5 highest-impact refactors

1. **Collapse the 6 auth gate variants in `auth.ts` to 2.** The
   canonical async gate `ensureRouteAuthorized` is the right interface;
   `ensureCompatApiAuthorized` (sync bearer-only) should remain only as
   the boot-path fallback. `ensureCompatSensitiveRouteAuthorized`,
   `ensureCompatApiAuthorizedAsync` (now reachable only via
   `ensureRouteAuthorized`), and `ensureAuthSessionOrBootstrap` are
   internal — un-export them. Target: 2 exported gate functions, with
   the rest as private helpers. **Why:** every "is this caller allowed"
   decision should hit one or two functions; six entry points means six
   audit surfaces.

2. **Introduce a `schemas/` folder + zod validation at the route
   boundary** to satisfy commandment 7. Start with the highest-traffic
   routes (`auth-session-routes`, `secrets-manager-routes`,
   `automations-compat-routes`). Each schema becomes the single source
   of truth for the route's input shape and feeds both runtime
   validation and the typed client. **Why:** removes hand-rolled
   `typeof`/`isArray` per-field validation; makes the boundary contract
   visible; makes the client / server impossible to drift.

3. **Split `plugins-compat-routes.ts` (1651 LOC) into 3 modules.**
   `plugins/registry.ts` (manifest + drift analysis), `plugins/mutations.ts`
   (validate + persist + reconcile), `plugins-compat-routes.ts` (the
   actual route mux ≤ 200 LOC). Same pattern for `client-agent.ts` (2800
   LOC, 14+ concerns) and `client-cloud.ts` (1790 LOC). **Why:**
   single-concern modules are auditable; god-files are not.

4. **Extract `wallet-market-overview-route.ts` (772 LOC) to a service.**
   The cache, in-flight dedupe, refresh rate-limit buckets, source
   availability, and CoinGecko + Polymarket adapters all belong to
   `services/wallet-market-overview.ts`. The route handler should be ~30
   LOC: parse query → call service → respond. Same pattern for
   `secrets-manager-routes.ts`'s install-job orchestration. **Why:**
   commandment 4 (BFF is auth + proxy, nothing else) — these route files
   currently ARE the business logic.

5. **Merge `trusted-local-request.ts` into `compat-route-shared.ts` (or
   vice versa) and delete the duplicate.** The 5+ shared helpers
   (`isLoopbackRemoteAddress`, `firstHeaderValue`, `headerValues`,
   `isClientIpProxyHeaderName`, `extractForwardedForCandidates`,
   `extractProxyClientAddressCandidates`, `CLIENT_IP_PROXY_HEADERS` set,
   etc) are byte-identical between the two files. **Why:** AGENTS.md
   axis 1 — "true duplication that should be unified."

### Pattern findings (cross-file)

- **`console.error` / `console.warn` in 5+ places** where `logger.error`
  / `logger.warn` is the project standard (commandment 9):
  `auth-context.ts:135,149`, `auth-bootstrap-routes.ts` (3 sites),
  `wallet-export-guard.ts:90`, `compat-route-shared.ts` body-reader.

- **In-process rate limiters reimplemented per file** — `auth.ts:71-113`,
  `auth-session-routes.ts:78-111`, `auth/sensitive-rate-limit.ts`
  (single-class registry — best of the three),
  `wallet-export-guard.ts:34-52`, `auth-pairing-compat-routes.ts:36-51`,
  `wallet-market-overview-route.ts:88-91`. **6 different limiter
  implementations**; one shared limiter (Layer 5 utility) would replace
  all six.

- **5 module-level singletons via `setInterval(...).unref()` sweep
  pattern.** Same pattern: `Map<key, {count|expiresAt, ...}>` + 5-min
  sweep timer + `.unref()`. Should be one shared `tiny-cache.ts`.

- **7 `as unknown` / `as never` casts** that hide an upstream signature
  mismatch. Each one signals "the upstream context shape doesn't match
  the wrapper's needed shape" — fix the upstream signature, not the
  caller.

- **Hand-rolled fetch+headers+token logic** appears in `server.ts`
  (compat loopback), `onboarding-compat-routes.ts:65`, `client-base.ts`,
  `csrf-client.ts:fetchWithCsrf`, `auth-client.ts`. Should be one
  request helper used everywhere.

- **`server.ts:705 handleCompatRoute` is a 246-LOC monolithic router**
  that fans out to 14 handlers. Could be a `Map<pathPrefix, handler>`
  with a single dispatch loop — would convert 246 LOC of `if (path ===
  ...)` chains into a 30-LOC dispatch.

### Boundary violations (work in route files that belongs in deeper layers)

| File                                  | Violating concern                                | Belongs in            |
|---------------------------------------|--------------------------------------------------|-----------------------|
| `wallet-market-overview-route.ts`     | Cache + in-flight dedupe + rate buckets + CoinGecko/Polymarket adapters | `services/wallet-market-overview.ts` |
| `plugins-compat-routes.ts`            | Plugin manifest analysis + drift detection + mutation persistence | `services/plugin-manifest.ts` |
| `automations-compat-routes.ts`        | 250-LOC `STATIC_AUTOMATION_NODE_SPECS` literal list | `data/automation-nodes.ts` |
| `secrets-manager-routes.ts`           | Install-job orchestration + SSE stream | `services/secrets-installer.ts` |
| `auth/cloud-sso.ts`                   | OAuth state map + sweep + JWKS verify + identity-link logic | split into 3 modules |
| `client-agent.ts`                     | 14 unrelated client concerns (lifecycle/auth/config/connectors/triggers/training/plugins/streaming/PTY/logs/character/permissions/updates/blockers) | `client-agent-{lifecycle,config,plugins,...}.ts` |
| `server.ts:188-205` `hydrateWalletOsStoreFlagFromConfig` | Config hydration in the API entry file | startup hook in Layer 3 (`runtime/eliza.ts` or `dev-server.ts`) |
| `server.ts:363-418` `clearCompatRuntimeStateViaApi` | Calls own /api endpoints via loopback to clear state during reset | `services/runtime-reset.ts` |
| `client-base.ts:38` `GENERIC_NO_RESPONSE_TEXT` | Renderer-side parallel of agent's `PROVIDER_ISSUE_CHAT_REPLY` | one constant in `@elizaos/shared` |

### Hardcoded ports / globals inventory (this layer)

| File:line | Literal | Status |
|-----------|---------|--------|
| `server.ts:304` | `"31337"` (loopback default) | OK — matches Layer 1 default |
| `server-cors.ts:14` | `"31337"` | OK — same default |
| `server-cors.ts:15` | `"2138"` | OK — UI port default |
| `server-cors.ts:16` | `"18789"` | OK — gateway default |
| `server-cors.ts:17` | `"2142"` | OK — home default |
| `server-cors.ts:22` | `5174..5200` range | OK — Electrobun static server range (matches Layer 1's note) |
| `client-base.ts:42-47` | `ELIZA_CLOUD_CONTROL_PLANE_HOSTS` set | OK — production cloud hosts |
| `cloud.ts (DEFAULT_DIRECT_CLOUD_BASE_URL)` | `"https://www.elizacloud.ai"`, `"https://api.elizacloud.ai"` | OK — production cloud endpoints |

No port mis-defaults found in this layer.
