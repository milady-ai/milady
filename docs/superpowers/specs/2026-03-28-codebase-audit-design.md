# Milady Codebase Audit — Full Findings & Remediation Design

**Date:** 2026-03-28
**Scope:** Runtime, API/Security, Desktop/IPC, Plugins, Build System, Tests/Types
**Approach:** System-by-system remediation, prioritized by severity within each domain
**Total findings:** 55 (11 Critical, 16 High, 19 Medium, 9 Low)

---

## Summary Table

| Domain | Critical | High | Medium | Low |
|--------|----------|------|--------|-----|
| 1. Runtime & Process | 2 | 3 | 3 | — |
| 2. API & Security | 1 | 3 | 3 | — |
| 3. Desktop & IPC | 2 | 2 | 3 | 3 |
| 4. Plugins & Connectors | 1 | 2 | 3 | 2 |
| 5. Build System | 2 | 3 | 4 | 2 |
| 6. Tests & Type Safety | 3 | 3 | 3 | 2 |

---

## Domain 1: Core Runtime & Process Lifecycle

### CRITICAL

**~~1.1 — RETRACTED~~ (false positive: `??` only triggers on null/undefined, not 0)**

**1.2 — Missing `.on("error")` on spawned processes**
- **Files:** `scripts/run-node.mjs:149,192` and `scripts/dev-ui.mjs:1151,1290`
- **Issue:** Child processes lack error handlers. ENOENT or permission errors throw unhandled exceptions.
- **Fix:** Add `.on("error", ...)` handler before data/exit handlers on all spawned processes.

**1.3 — Race condition in dev server shutdown**
- **File:** `packages/app-core/src/runtime/dev-server.ts:269-298`
- **Issue:** `process.on("SIGINT", () => void shutdown())` — two rapid signals can enter `shutdown()` before `isShuttingDown` flag is set.
- **Fix:** Use `process.once("SIGINT", ...)` and `process.once("SIGTERM", ...)`.

### HIGH

**1.4 — Telegram chat history memory leak**
- **File:** `packages/app-core/src/runtime/eliza.ts:517-567`
- **Issue:** `chatHistories` Map grows unbounded per unique chat ID. Only messages within a chat are trimmed (to 20), but chat entries are never evicted.
- **Fix:** LRU cache or periodic sweep of stale chat IDs (e.g., max 500 entries, evict oldest on overflow).

**1.5 — Fire-and-forget `bot.launch()`**
- **File:** `packages/app-core/src/runtime/eliza.ts:610-620`
- **Issue:** Telegram bot launch is not awaited. A 500ms sleep is not a guarantee the bot is polling. Code logs "polling started" regardless.
- **Fix:** Await the launch, or use a ready callback/event.

**1.6 — Uncaught promise in Telegram message handler**
- **File:** `packages/app-core/src/runtime/eliza.ts:522-602`
- **Issue:** Async handler on `bot.on("message", ...)` can throw before inner try/catch (e.g., accessing `ctx.message.chat.id`). Produces unhandled rejection.
- **Fix:** Wrap entire handler body in try/catch, or register `bot.catch()` as a safety net.

### MEDIUM

**1.7 — Socket leak in `waitForPort()`**
- **File:** `scripts/dev-ui.mjs:922-948`
- **Issue:** On timeout, the current socket is never destroyed.
- **Fix:** Track active socket and destroy on timeout/reject.

**1.8 — Synchronous FS in startup hot path**
- **File:** `scripts/run-node.mjs:55-91`
- **Issue:** `findLatestMtime()` uses `readdirSync`/`statSync`. Blocks event loop during startup.
- **Note:** Acceptable for startup-only code, but worth noting for large directories.

**1.9 — Possible null dereference on `runtime.character`**
- **File:** `packages/app-core/src/runtime/eliza.ts:489-515`
- **Issue:** `char.bio`, `char.lore` accessed without null guard.
- **Fix:** `const char = runtime.character ?? {};`

---

## Domain 2: API & Security

### CRITICAL

**2.1 — Unbounded memory leak in pairing rate limiter**
- **File:** `packages/app-core/src/api/server.ts:296,338-354`
- **Issue:** `pairingAttempts` Map entries never cleaned up. Grows indefinitely.
- **Fix:** Add periodic `setInterval` sweep (pattern exists in `wallet-export-guard.ts:46-58`).

### HIGH

**2.2 — Auth bypass in development mode**
- **File:** `packages/app-core/src/api/auth.ts:88-112`
- **Issue:** `ensureCompatSensitiveRouteAuthorized` skips auth when `NODE_ENV=dev` and no API token. Wallet export, terminal, etc. become unprotected.
- **Fix:** Use explicit `MILADY_DEV_AUTH_BYPASS=1` flag instead of coupling to NODE_ENV.

**2.3 — No rate limiting on API token authentication**
- **File:** `packages/app-core/src/api/auth.ts`
- **Issue:** Pairing has rate limiting; main API token auth does not. Brute-force unconstrained.
- **Fix:** Add rate limiting on failed auth attempts (e.g., 10 attempts per minute per IP).

**2.4 — Path traversal weakness in dev console log reader**
- **File:** `packages/app-core/src/api/dev-console-log.ts:18-24`
- **Issue:** Validates `.milady` appears anywhere in path, not as direct parent. Traversal possible.
- **Fix:** `path.resolve()` then verify `.milady` is the immediate parent directory.

### MEDIUM

**2.5 — Permissive CORS configuration**
- **File:** `packages/app-core/src/api/server.ts:3346-3352`
- **Issue:** Accepts any localhost origin on any port.
- **Fix:** Whitelist specific configured ports only.

**2.6 — Timing attack on token comparison**
- **File:** `packages/app-core/src/api/auth.ts:33-39`
- **Issue:** Length check before `timingSafeEqual` leaks token length.
- **Fix:** Pad to constant length or use fixed-length tokens.

**2.7 — Error message information disclosure**
- **File:** `packages/app-core/src/api/server.ts:2082-2089`
- **Issue:** Screenshot proxy returns raw `err.message` to client.
- **Fix:** Sanitize error messages; return generic error in production.

### Positive findings (no action needed)
- Parameterized SQL queries with `sanitizeIdentifier()`, `quoteIdent()`, `sqlLiteral()`
- Shell injection prevention via regex allowlists on package names/versions/URLs
- SSRF protection: screenshot proxy locked to localhost
- Wallet export hardening: rate limits, audit logs, IP binding, single-use nonces
- `execFileAsync()` with array args, never shell strings

---

## Domain 3: Desktop App & IPC (Electrobun)

### CRITICAL

**3.1 — `file://` protocol allowed in canvas navigation**
- **File:** `apps/app/electrobun/src/native/canvas.ts:126-150`
- **Issue:** Comment says "file:// rejected" but code does `allowed = isLocalCanvasOrigin(url) || parsed.protocol === "file:"`. Grants filesystem read access.
- **Fix:** Remove `|| parsed.protocol === "file:"`.

**3.2 — CEF sandbox fully disabled on Windows**
- **File:** `apps/app/electrobun/electrobun.config.ts:128-145`
- **Issue:** `"no-sandbox": true` disables process sandbox entirely.
- **Fix:** Remove `no-sandbox`. Test with only `disable-gpu-sandbox`. Document if full disable is required.

### HIGH

**3.3 — Unsanitized IPC message dispatch**
- **File:** `apps/app/electrobun/src/bridge/electrobun-bridge.ts:70-95`
- **Issue:** `dispatchMessage()` accepts arbitrary names/payloads. Crafted `apiBaseUpdate` can inject malicious API base URL or token.
- **Fix:** Validate message names against allowlist. Validate payload shapes.

**3.4 — Broad macOS entitlements**
- **File:** `apps/app/electrobun/electrobun.config.ts:74-100`
- **Issue:** `disable-library-validation`, `allow-unsigned-executable-memory`, `network.server` all enabled. No post-build validation.
- **Fix:** Document justification for each. Add build-time assertions where possible.

### MEDIUM

**3.5 — Missing error boundaries on critical UI components**
- **File:** `packages/app-core/src/App.tsx`
- **Issue:** ErrorBoundary only wraps ViewRouter. SharedCompanionScene, GameViewOverlay, ShellOverlays, CustomActionEditor, ConnectionFailedBanner, AvatarLoader are unprotected.
- **Fix:** Wrap each critical section in its own ErrorBoundary.

**3.6 — Type safety escape hatch in RPC handlers**
- **File:** `apps/app/electrobun/src/rpc-handlers.ts:59-62`
- **Issue:** All handlers typed `(params: any) => any`.
- **Fix:** Create typed handler signatures per RPC method.

**3.7 — Custom event without origin validation**
- **File:** `packages/app-core/src/App.tsx:332-338`
- **Issue:** `toggle-custom-actions-panel` event accepted from any script context.
- **Fix:** Validate event origin or use postMessage with origin check.

### LOW

**3.8 — Silently swallowed errors in bridge init**
- **File:** `apps/app/electrobun/src/bridge/electrobun-bridge.ts:219-226`
- **Issue:** `desktopGetVersion` IPC `.catch(() => {})` hides failures.
- **Fix:** Log error in catch.

**3.9 — Incomplete useEffect cleanup**
- **File:** `packages/app-core/src/App.tsx:389-399`
- **Issue:** Keyboard scroll effect early-returns without cleanup when conditions aren't met.
- **Fix:** Move condition check into cleanup function.

**3.10 — Missing `aria-pressed` on toggle buttons**
- **File:** `packages/app-core/src/components/TrajectoryDetailView.tsx:60-72`
- **Fix:** Add `aria-pressed={expanded}` attribute.

---

## Domain 4: Plugins & Connectors

### CRITICAL

**4.1 — Missing required field validation in multi-account resolution**
- **File:** `packages/plugin-wechat/src/channel.ts:288-300`
- **Issue:** Accounts added without checking `apiKey` and `proxyUrl` exist. `undefined` values cause runtime failures in ProxyClient.
- **Fix:** Skip accounts missing required fields with warning log.

### HIGH

**4.2 — No early validation of proxyUrl protocol**
- **File:** `packages/plugin-wechat/src/channel.ts:280-312`
- **Issue:** Invalid URLs not caught until message send time. Delays error discovery.
- **Fix:** Validate URL protocol in `resolveAccounts()`.

**4.3 — Silent health check degradation**
- **File:** `packages/plugin-wechat/src/channel.ts:264-278`
- **Issue:** Health check failures logged but no alerting, backoff, or status propagation.
- **Fix:** Track consecutive failures per account. Mark unhealthy after N failures.

### MEDIUM

**4.4 — Race condition in concurrent sends during login expiry**
- **File:** `packages/plugin-wechat/src/channel.ts:150-164`
- **Issue:** Multiple concurrent sends can all hit LoginExpiredError. loginPromises dedup works for happy path, but failed re-login cascades to all waiters with no retry.
- **Fix:** Document behavior. Consider single retry with backoff for waiters.

**4.5 — Unhandled promise in webhook server abort**
- **File:** `packages/plugin-wechat/src/callback-server.ts:138-146`
- **Issue:** `void closeServer(server)` in abort handler — unhandled if close fails.
- **Fix:** Wrap in try/catch with error logging.

**4.6 — Plugin cleanup async contract undocumented**
- **File:** `packages/plugin-wechat/src/index.ts:54-62`
- **Issue:** Async cleanup function returned but contract with plugin manager not explicit.
- **Fix:** Document that cleanup must be awaited. Verify plugin manager awaits.

### LOW

**4.7 — Unsafe casting in plugin config initialization**
- **File:** `packages/plugin-wechat/src/index.ts:20-22`
- **Issue:** Config typed as `Record<string, unknown>`, cast to expected shape.
- **Fix:** Schema validation (Zod) for plugin configs.

**4.8 — Health check interval vs request timeout ratio**
- **Files:** `packages/plugin-wechat/src/proxy-client.ts:9`, `channel.ts:12`
- **Issue:** 60s interval, 30s timeout. Ratio is fine but should be documented as a constraint.

---

## Domain 5: Build System & Scripts

### CRITICAL

**5.1 — TOCTOU race condition in postinstall lock**
- **File:** `scripts/run-repo-setup.mjs:95-132`
- **Issue:** Lock file check and write are not atomic. Parallel installs can all pass the stale check.
- **Fix:** Use atomic file operations (O_EXCL flag on create).

**5.2 — Silent patch failures with no validation**
- **File:** `scripts/patch-deps.mjs:57-142`
- **Issue:** Bare try/catch swallows all errors. No distinction between "already patched," "missing package," or "corruption."
- **Fix:** Add post-patch verification. Log which patches applied vs skipped.

### HIGH

**5.3 — CI skips nested postinstall hooks**
- **File:** `.github/workflows/ci.yml:55-66`
- **Issue:** `--ignore-scripts` skips nested hooks (e.g., node-pty for plugin-agent-orchestrator). Root `postinstall` doesn't re-trigger them.
- **Fix:** Run without `--ignore-scripts`, or explicitly run critical nested postinstalls.

**5.4 — Version mismatch across @elizaos packages**
- **File:** `package.json:146-175`
- **Issue:** Mixed caret, exact pin, and custom `-milady.0` versions. Drift risk.
- **Fix:** Align on exact pins for alpha packages.

**5.5 — TypeScript path mapping inconsistencies**
- **Files:** Root, `packages/app-core`, `packages/agent` tsconfigs
- **Issue:** Different baseUrl values and path mappings. Agent can't resolve `@miladyai/ui`. Vitest aliases mask the problem.
- **Fix:** Unify baseUrl and shared path config.

### MEDIUM

**5.6 — Submodule init failures don't exit non-zero**
- **File:** `scripts/init-submodules.mjs:117-127`
- **Issue:** Logs error but exits 0. CI proceeds with incomplete repo.
- **Fix:** `process.exit(1)` when `failed > 0`.

**5.7 — Build order race in production build**
- **File:** `scripts/run-production-build.mjs:101-114`
- **Issue:** Root dist and plugin builds run in parallel via `Promise.all` despite implicit dependency.
- **Fix:** Build root first, then plugins.

**5.8 — Core bundle patch regex assumes unminified code**
- **File:** `scripts/patch-deps.mjs:446-449`
- **Issue:** Complex regex for @elizaos/core patches assumes specific whitespace. Silently fails if format changes.
- **Fix:** Add verification after regex replacement.

**5.9 — Git hook setup uses CommonJS in ESM project**
- **File:** `package.json:107`
- **Issue:** `require('child_process')` in ESM context. `stdio:'ignore'` hides errors.
- **Fix:** Use ESM import or a script file.

### LOW

**5.10 — No `.env` validation at startup**
- **Issue:** Missing API keys fail at runtime instead of clear startup error.
- **Fix:** Add pre-flight env check in dev and startup scripts.

**5.11 — No Turbo pipeline configuration**
- **Issue:** No `turbo.json` despite 9+ workspace packages. No caching or parallelism guarantees.
- **Fix:** Add turbo.json with explicit task dependencies.

---

## Domain 6: Tests & Type Safety

### CRITICAL

**6.1 — `strict: false` in core agent package**
- **File:** `packages/agent/tsconfig.json`
- **Issue:** Core runtime (18,414-line server.ts, eliza.ts) compiles without strict checks.
- **Fix:** Enable `strict: true` and fix resulting type errors.

**6.2 — `strict: false` in shared package**
- **File:** `packages/shared/tsconfig.json`
- **Issue:** Also has `useUnknownInCatchVariables: false`. Shared utils lack type safety.
- **Fix:** Enable `strict: true`.

**6.3 — 18,414-line file excluded from test coverage**
- **File:** `packages/agent/src/api/server.ts`
- **Issue:** Largest file explicitly excluded from coverage thresholds. Handles all API routes, auth, WebSocket.
- **Fix:** Split into focused modules that can be individually tested.

### HIGH

**6.4 — Coverage thresholds at 25% lines / 15% branches**
- **File:** `vitest.config.ts:221-226`
- **Issue:** ~3x below industry standard. Most code paths untested.
- **Fix:** Incrementally raise. Target 50% near-term, 70%+ long-term.

**6.5 — Zero test coverage for 3 packages**
- `packages/vrm-utils/` — VRM retargeting/animation
- `packages/shared/` — Cross-package utilities
- `packages/types/` — Type definitions
- **Fix:** Add smoke tests for public exports.

**6.6 — 9 `@ts-ignore` / `@ts-expect-error` suppressions**
- Key locations: `packages/agent/src/api/server.ts:253,258`, `packages/vrm-utils/src/retargetMixamoGltfToVrm.ts:2`, `apps/app/electrobun/src/native/canvas.ts:86,415`
- **Fix:** Add proper type declarations or augmentations. File upstream issues.

### MEDIUM

**6.7 — 1,355 console.log/warn statements across 250 files**
- Worst: `server.ts` (47), `electrobun/index.ts` (41), `AppContext.tsx` (17)
- **Fix:** Migrate to structured logger. Lint rule to ban bare `console.*` in `src/`.

**6.8 — 51 TODO/FIXME/HACK comments untracked**
- Notable: `platform-secure-store-node.ts:157`, `eliza.ts:204`, `chat-send-lock.test.ts:886`
- **Fix:** File issues for each. Remove stale ones.

**6.9 — Unsafe `as unknown as Type` in tests (16+ occurrences)**
- **Issue:** Incomplete mocks force-cast. If real types change, tests pass with stale mocks.
- **Fix:** Proper mock factories that satisfy full interface.

### LOW

**6.10 — Large files need splitting**
- `packages/agent/src/api/server.ts` — 18,414 lines
- `packages/app-core/src/state/AppContext.tsx` — 7,776 lines
- `packages/app-core/src/api/client.ts` — 5,830 lines
- `packages/agent/src/runtime/eliza.ts` — 5,028 lines
- All exceed 500 LOC guideline by 10-36x.

**6.11 — `any` type usage without justification**
- `packages/app-core/src/components/avatar/VrmEngine.ts:695`
- `packages/agent/src/api/server.ts:15304`
- **Fix:** Add proper types or augmentations.

---

## Remediation Strategy

Each domain becomes one or more focused PRs:

1. **Domain 1 PR:** Runtime hardening — exit codes, spawn error handlers, shutdown race, Telegram fixes
2. **Domain 2 PR:** API security — pairing leak, auth bypass, rate limiting, path traversal
3. **Domain 3 PR:** Desktop security — file:// protocol, sandbox, IPC validation, error boundaries
4. **Domain 4 PR:** Plugin reliability — config validation, health check improvements, cleanup contracts
5. **Domain 5 PR:** Build stability — atomic locks, patch validation, CI hooks, version alignment
6. **Domain 6 PR(s):** Type safety & coverage — strict mode, split large files, raise thresholds (likely multiple PRs)

Domain 2 (security) and Domain 1 (runtime crashes) should be addressed first. Domain 6 (types/tests) is the largest effort and can be incremental.
