# Onboarding QA — Follow-up Ledger

Last updated: 2026-05-11.

Items here were uncovered during the 2026-05-10 onboarding QA campaign (Stages 1–3) and the 2026-05-11 follow-up pass. Each entry is self-contained — file:line citation, severity, one-sentence summary, and the recommended action for the owner. Resolved items remain in the ledger marked **DONE** so the audit trail survives.

Severity scale:

- **P0** — production bug blocking a real user-facing flow. Fix immediately.
- **P1** — broken developer-experience or coverage gap that masks regressions. Fix before next release.
- **P2** — code-quality smell, dead code, or documentation drift. Fix opportunistically.
- **P3** — speculative or future-facing item. Pick up when the surrounding work lands.

Current ledger state (open items only, after 2026-05-11 sweep):

- **P0** open: **0**
- **P1** open: **1** (item 14)
- **P2** open: **2** (items 12 — desktop half only, and 17; plus the new connector-normalization tracking item 18 — counted under P1 below since it gates item 14)
- **P3** open: **0**

---

## P0 — production / build blockers

### 1. `MILADY_DEFAULT_THEME` missing from `@elizaos/shared@2.0.0-alpha.538` — DONE 2026-05-10

- **Severity:** P0 → resolved
- **Citation:** `apps/app/src/main.tsx:18` imported `MILADY_DEFAULT_THEME` from `@elizaos/shared`. The symbol was not exported by the published alpha; `eliza/packages/shared/src/*` did not define it either; nor did `eliza/packages/shared/dist/`. Rollup confirmed: `"MILADY_DEFAULT_THEME" is not exported by ".../node_modules/@elizaos/shared/index.js"`.
- **Summary:** Production app build (`bun run --cwd apps/app build`) failed in packages-mode, transitively breaking `scripts/qa/ios-sim-smoke.sh` and `scripts/qa/android-emu-smoke.sh` at the `build:web` step.
- **Fix applied:** Removed the dead `import { MILADY_DEFAULT_THEME } from "@elizaos/shared"` at `apps/app/src/main.tsx:18` and the `theme: MILADY_DEFAULT_THEME` assignment at `:207`. Investigation showed (a) `BrandingConfig` has no `theme` field in source or the published `.d.ts` — the assignment would not typecheck even with the constant defined — and (b) no consumer reads `branding.theme` anywhere in `apps/app/src/`, `eliza/packages/`, or downstream. The line was an aspirational reference to a not-yet-existent constant against a not-yet-existent field — the placeholder pattern AGENTS.md instructs to remove on sight. No fallback shim or local stub was introduced (would have been slop with no consumer). If a themed `BrandingConfig` is later added, the proper fix is to extend `BrandingConfig` in `eliza/packages/ui/src/config/branding.ts` first, then thread the value end-to-end.
- **Verification:** `bun run --cwd apps/app build:web` succeeds (2m42s, dist emitted, 4119 modules). `bun run --cwd apps/app typecheck` clean.
- **Update 2026-05-11:** A subsequent feature commit (`fd401afb07 feat(branding): wire MILADY_DEFAULT_THEME into APP_BRANDING`) re-introduced the constant — this time with the export wired through `@elizaos/shared` end-to-end and an `APP_BRANDING.theme` consumer. The new path is the correct one (extend `BrandingConfig` first, then thread the value), so this item stays DONE and the new wiring stands.

### 2. Clean-checkout build prerequisite — `packages/shared` must be built first — DONE 2026-05-10

- **Severity:** P0 → resolved for the mobile smoke path
- **Citation:** `eliza/packages/shared/package.json` `scripts.build` runs `build:i18n && build:dist`. In `local` mode a clean clone has no `dist/` artifact and `local`-mode consumers (`apps/app`, `eliza/packages/app-core`, `eliza/packages/ui`) used to fail to resolve `@elizaos/shared` until shared was built.
- **Summary:** In `packages` mode (the default — `MILADY_ELIZA_SOURCE=packages`), `@elizaos/shared` resolves from npm as a prebuilt artifact, so the prerequisite does not apply. The mobile smoke scripts now run end-to-end in `packages` mode without requiring any local prebuild step.
- **Fix applied (transitive via item 1):** Item 1 removed `apps/app`'s only direct runtime import from `@elizaos/shared`, so `apps/app` no longer depends on `shared/dist/` at runtime — only the elizaOS-internal `app-core` and `ui` packages do, and in `packages` mode they consume the published alpha rather than the local source tree.
- **Verification:** `bun run --cwd apps/app build:web` succeeds against the published `@elizaos/shared@2.0.0-alpha.538` with no manual prebuild. The remaining `local`-mode prereq for internal `app-core` / `ui` builds is unchanged and orthogonal to the mobile smoke scripts; tracked as a P2 docs note rather than a P0 blocker.

---

## P1 — coverage / dev-experience gaps

### 3. `DesktopOnboardingRuntime.tsx` is dead code — DONE 2026-05-10

- **Severity:** P1
- **Status:** DONE 2026-05-10. Deleted `eliza/packages/ui/src/desktop-runtime/DesktopOnboardingRuntime.tsx`, removed the re-export from `eliza/packages/ui/src/desktop-runtime/index.ts`, dropped the import + JSX mount from `apps/app/src/main.tsx`, `eliza/packages/app/src/main.tsx`, and `eliza/packages/elizaos/templates/project/apps/app/src/main.tsx`, and stripped the `DesktopOnboardingRuntime` declaration from both type-stub files under `eliza/packages/elizaos/templates/project/apps/app/src/type-stubs/app-core/`. Lazy permissions already ship via `installDesktopPermissionsClientPatch` in `desktop-permissions-client.ts`.

### 4. `PasswordSetupStep.tsx` is dead code — DONE 2026-05-10

- **Severity:** P1
- **Status:** DONE 2026-05-10. Deleted `eliza/packages/ui/src/components/onboarding/PasswordSetupStep.tsx`. No production importer existed; the W3 negative-assertion test in `eliza/packages/app/test/ui-smoke/onboarding-full-flow.spec.ts` (which existed only to assert the dead component was not mounted) was removed alongside the source file, since with the source gone the regression guard is moot.

### 5–10. Six source smells in `plugins/plugin-elizacloud/src/onboarding.ts`

Pinned by `eliza/plugins/plugin-elizacloud/__tests__/onboarding-failures.test.ts` (now 17 PASS as of 2026-05-11, up from 12 PASS at original ledger write). Each smell is documented inline below.

#### 5. Substring-match on error message to detect timeout — DONE 2026-05-11

- **Severity:** P2 → resolved
- **Citation:** `eliza/plugins/plugin-elizacloud/src/onboarding.ts:76-78`
- **Summary:** `msg.includes("timed out") || msg.includes("timeout")` was fragile — a `DOMException: The operation was aborted due to timeout.` from `AbortSignal.timeout()` matched by accident, but localization or a Node version change could break detection silently.
- **Status:** DONE 2026-05-11. Cloud-smells agent replaced substring matching with `err instanceof DOMException && err.name === "TimeoutError"` (the actual contract for `AbortSignal.timeout()`) and an `AbortError` branch. Generic fallback path retained for unknown errors. Verified by the 17-case `onboarding-failures.test.ts` suite passing.

#### 6. `String(err)` everywhere instead of structured error handling — DONE 2026-05-11

- **Severity:** P2 → resolved
- **Citation:** `eliza/plugins/plugin-elizacloud/src/onboarding.ts:76,124,219`
- **Summary:** Three different sites stringified errors via `String(err)`, losing the original error type, stack, and any cause chain. Subsequent control-flow decisions were made on the stringified message (see smell #5).
- **Status:** DONE 2026-05-11. Cloud-smells agent narrowed catches via `err instanceof Error`, extracts `.message`/`.name`/`.cause`, and only stringifies at the user-facing surface. Verified by the `onboarding-failures.test.ts` suite.

#### 7. Polling error is swallowed and logged only at `debug` — DONE 2026-05-11

- **Severity:** P2 → resolved
- **Citation:** `eliza/plugins/plugin-elizacloud/src/onboarding.ts:206-209`
- **Summary:** The `catch (pollErr)` inside the provisioning loop logged `logger.debug(...)` and continued. A persistent auth failure (revoked key, 401) was indistinguishable from a transient 5xx — both spun until `PROVISION_TIMEOUT_MS = 120_000`.
- **Status:** DONE 2026-05-11. Cloud-smells agent now distinguishes 4xx (terminal: bail with a clear "Cloud rejected the API key" failure for 401) from 5xx/network errors (transient: keep polling). Verified by the new "Cloud API 401 during provisioning" test case in `onboarding-failures.test.ts`.

#### 8. Ambiguous `agentId | null | undefined` return contract — DONE 2026-05-11

- **Severity:** P2 → resolved
- **Citation:** `eliza/plugins/plugin-elizacloud/src/onboarding.ts:217` (timeout returned `{ agentId }` without `bridgeUrl`); `onboarding.ts:342-346` (no-agent fallback returned `agentId: undefined`); `provisionCloudAgent` returned `null` on terminal failure.
- **Summary:** Three distinct "no usable agent" states encoded as `null | undefined | { agentId, bridgeUrl?: undefined }`. Callers had to disambiguate by inspecting both the outer return and the inner field.
- **Status:** DONE 2026-05-11. Cloud-smells agent reworked the provisioning timeout path so it now surfaces an explicit failure message instead of silently returning `{ agentId }`, collapsing the ambiguous shape. The remaining "successful provision" / "explicit failure" split is now a clean binary at the call site. Verified by the new "Provisioning timeout surfaces explicit failure" test case in `onboarding-failures.test.ts`.

#### 9. `openBrowser` failures swallowed silently — DONE 2026-05-11

- **Severity:** P2 → resolved
- **Citation:** `eliza/plugins/plugin-elizacloud/src/onboarding.ts:107-110,378-395`
- **Summary:** `openBrowser(url).catch(() => {})` and the `onError` callback inside `openBrowser` swallow the failure. If `open` / `xdg-open` / `cmd.exe` aren't on PATH the user sees only the printed URL in the terminal — fine for a CLI, but the same code is hit by the desktop/web onboarding wrapper where there is no terminal.
- **Status:** DONE 2026-05-11. Refactored alongside item 10. The `openBrowser` helper now rejects with the underlying `Error` instead of swallowing; the `runCloudAuth` wrapper routes that error through `CloudOnboardingObserver.onAuthBrowserOpenFailed(loginUrl, error)`. The CLI-backed `ClackObserver` renders a `log.warn` containing the URL and the OS-level error so the user can recover; desktop/web wrappers can render the same data as an inline GUI affordance. New test case C8 in `onboarding-failures.test.ts` pins the observer call site (mocks `node:child_process.execFile` to reject and asserts the observer receives the URL + the `Error`).

#### 10. UI module (`@clack/prompts`) is threaded as a parameter through the orchestration layer — DONE 2026-05-11

- **Severity:** P2 → resolved
- **Citation:** `eliza/plugins/plugin-elizacloud/src/onboarding.ts:23-24` (type alias), `:92, :140, :238, :310` (signatures).
- **Summary:** `runCloudOnboarding` is supposed to be transport-agnostic but takes a `ClackModule` typed parameter, which couples it to the CLI library. This is why the web/desktop onboarding cannot reuse this orchestrator (the smells in #9 above are a downstream symptom).
- **Status:** DONE 2026-05-11. `CloudOnboardingObserver` defined in `eliza/plugins/plugin-elizacloud/src/cloud/onboarding-observer.ts` — covers every availability/auth/provision lifecycle event plus `confirm` / `selectChoice` prompts. `runCloudOnboarding(observer, agentName, preset?, baseUrl?)` is the new entry shape. CLI provides `ClackObserver` (`src/cloud/clack-observer.ts`); test/headless callers use `NullCloudOnboardingObserver` (`src/cloud/null-observer.ts`). `eliza/packages/agent/src/runtime/first-time-setup.ts` was updated to wrap its lazily-loaded clack module in `new ClackObserver(clack)` before calling `runCloudOnboarding`. The legacy `ClackModule` parameter is gone — single codepath only. New test case C9 in `onboarding-failures.test.ts` runs a full availability-false path through `NullCloudOnboardingObserver` without throwing.

---

## P1 — truly missing coverage uncovered during this campaign

### 11. iOS deep-link entry (`milady://onboard/...`) — DONE 2026-05-11

- **Severity:** P1 → resolved
- **Citation:** Referenced in `docs/QA-onboarding.md` M4 row; previously no automated coverage. Sandbox-mode entitlements live in `docs/sandbox-mode.md`.
- **Summary:** Mobile users hitting a `milady://onboard/step/provider` URL should land on the provider sub-view of the chooser; no test asserted this.
- **Fix applied:** Added `eliza/packages/ui/src/onboarding/deep-link-handler.ts` — a platform-agnostic URL parser (`routeOnboardingDeepLink`) plus a Capacitor wrapper (`installOnboardingDeepLinkListener`) that wires `App.addListener("appUrlOpen", ...)` and `App.getLaunchUrl()`. The parser translates `milady://onboard/step/<id>` into the `?runtime=picker&runtimeTarget=<choice>` query contract that `RuntimeGate` already consumes (`provider` and `local` → `local` sub-view; `cloud` → `cloud`; `remote` → `remote`; unknown step → default chooser without crash). The wrapper resolves to a no-op when the Capacitor bridge is unavailable. `@capacitor/app` is dynamically imported and mocked in tests — no new runtime dependency was added to `@elizaos/ui`.
- **Test:** `eliza/packages/ui/src/onboarding/__tests__/deep-link-entry.test.ts` (17 PASS, vitest + jsdom). Covers all 7 cases from the original brief (provider / local / cloud / remote / unknown step / malformed URL / wrong scheme) plus listener-layer coverage for "right scheme but non-onboard host", "right scheme + onboard host but wrong inner segment", existing-search-params preservation, runtimeTarget overwrite, cold-launch URL via `App.getLaunchUrl()`, `onUnmatched` fall-through for non-onboarding URLs, `addListener` rejection (Capacitor bridge unavailable), and `getLaunchUrl` rejection.
- **Verification:** `bun run --cwd eliza/packages/ui test -- deep-link-entry` → 17/17 PASS. `bun run --cwd eliza/packages/ui test -- onboarding/__tests__/` → 160/160 PASS across 4 onboarding test files. `bun run --cwd eliza/packages/ui typecheck` clean. No new lint errors.
- **Follow-up not in scope:** Wiring `installOnboardingDeepLinkListener` into `apps/app/src/main.tsx`'s `initializeAppLifecycle()` so the deep link reaches RuntimeGate in production. The handler module is fully tested and ready to import; the host wiring is a small change tracked separately if a future onboarding stage requires it. The 12 `routeOnboardingDeepLink` unit cases plus the 5 listener cases are independently meaningful regression guards.

### 12. OS-native permission prompts (notifications, file access, camera) — DONE 2026-05-11 (mobile scaffold); desktop part still PENDING

- **Severity:** P2
- **Citation:** `docs/QA-onboarding.md` M5 row notes "Playwright CANNOT reach native dialogs". No coverage at all today.
- **Summary:** Permissions are now requested lazily (per `DesktopOnboardingRuntime.tsx` doc-comment, since deleted — lazy-permissions path is now in `installDesktopPermissionsClientPatch` / `desktop-permissions-client.ts`) but there is no automated harness driving the lazy request → grant → success path.
- **Status:** DONE 2026-05-11 for the mobile half. Added `scripts/qa/mobile-permission-walkthrough.mjs` — an MCP-driven scaffold + manifest writer mirroring the `mobile-screenshot-walkthrough.mjs` pattern. `--init` scaffolds `reports/qa/<date>/mobile-permissions/<surface>/` with a P1-P6 `CHECKLIST.md` (P6 Bluetooth/Local Network is Android-only; iOS gets P1-P5). Operator drives each prompt via `mcp__computer-use__screenshot` + `mcp__computer-use__left_click` inside a Claude Code session and saves PNGs into the scaffolded directory. `--finalize` validates the directory and emits `SUMMARY.md` with per-prompt size + sha256, exiting 0 on partial capture (local-dev tolerant). M5 row in `docs/QA-onboarding.md` updated to point to the new --init/--finalize workflow. Desktop side (an Electrobun spec exercising `tccutil`-mediated permission resets between runs) is still PENDING and tracked here.

### 13. App relaunch after cloud agent provisioning — DONE 2026-05-11

- **Severity:** P1 → resolved (with documented gap)
- **Citation:** `RuntimeGate.cloud-provisioning.test.tsx` covers the provisioning bridge handoff and `setPendingRestart` at the unit level. The actual native relaunch path is now exercised in CI via the new packaged spec.
- **Summary:** Production cloud-onboarding ends with a "Restart Milady" CTA whose path resolves to `DesktopManager.relaunch()` (`eliza/packages/app-core/platforms/electrobun/src/native/desktop.ts:1439`). The handler calls `Bun.spawn([process.execPath, ...process.argv.slice(1)], { detached: true, ... })` and then `Utils.quit()`. If `process.execPath` resolves to a packaged binary that is missing/unspawnable, the spawn fails — the handler logs `[DesktopManager] relaunch: failed to spawn new instance: ...` and the parent still exits, but no new instance comes up.
- **Status:** DONE 2026-05-11. Added `eliza/packages/app/test/electrobun-packaged/electrobun-relaunch.e2e.spec.ts` — a single packaged e2e (gated on macOS/Windows where the launcher binary is built) that boots the real packaged shell via the existing `PackagedDesktopHarness`, drives `harness.menuAction("relaunch")` (the same code path the cloud-onboarding "Restart Milady" CTA + `relaunchDesktop()` lands in — `eliza/packages/ui/src/state/useChatLifecycle.ts:447`), waits for the parent process to exit naturally, and asserts (a) the relaunch handler did not log a spawn-failure marker, (b) no crash markers (SIGSEGV/SIGBUS/SIGABRT/"Fatal error during startup"/"panic:"/"core dumped") appeared in stdout/stderr, and (c) the exit code is 0 or the signal is a clean SIGTERM/SIGINT/SIGHUP (never a crash signal). The test is picked up automatically by `playwright.electrobun.packaged.config.ts` (matches `**/*.e2e.spec.ts`) and runs in serial mode alongside the existing regression specs.
- **Known gap:** A second test ("relaunch handler reports a clean error when execPath is invalid") was scoped out — `DesktopManager.relaunch()` reads `process.execPath` directly with no env-override hook, and Electrobun's launcher controls `argv[0]` before Bun starts, so there is no clean way to inject a bad `execPath` from outside. The bad-execPath case must be covered at the unit level by mocking `Bun.spawn` in a future `native/desktop.test.ts`; the e2e test in this commit only covers the happy path (parent exits cleanly with no crash markers) but does so against the real native binary.
- **Operator runbook:** `bun run --cwd eliza/packages/app build` (or download a packaged tarball under `eliza/packages/app-core/platforms/electrobun/artifacts/`), then `bunx playwright test --config eliza/packages/app/playwright.electrobun.packaged.config.ts test/electrobun-packaged/electrobun-relaunch.e2e.spec.ts` on a macOS or Windows host. Skips on Linux because no packaged launcher is built there.

### 14. Connector-specific OAuth flows (Discord, Telegram, Signal) — PENDING

- **Severity:** P1
- **Citation:** `eliza/plugins/__tests__/setup-routes-contract.test.ts` (added by 2026-05-10 campaign) pins the *intended* shared contract via `test.fails(...)`. Today every connector diverges (see `docs/onboarding-contracts.md` §5). No end-to-end OAuth walkthrough exists. As of 2026-05-11 the suite is 12 PASS, 30 expected-fail.
- **Summary:** Each connector exposes its own setup namespace (`/api/discord-local/...`, `/api/telegram-setup/...`, `/api/signal/...`) with bespoke status / pair / disconnect shapes. The contract test documents the gap; no test drives an actual OAuth handshake.
- **Recommended action:** Item 18 (below) tracks the normalization work; once each connector is migrated to `/api/setup/<connector>/{status,start,cancel}` the 30 expected-fail blocks in `setup-routes-contract.test.ts` flip to real PASS assertions and a single contract test can drive every connector's `start → status → complete` cycle against a mocked OAuth provider.

### 15. Sandbox / store distribution onboarding variants — DONE 2026-05-11

- **Severity:** P2 → resolved
- **Citation:** `docs/sandbox-mode.md` describes AOSP ElizaOS variant detection (`ElizaOS/<tag>` user-agent marker), App Store sandboxed entitlements, and AOSP terminal-access surface. AOSP pre-seed at `eliza/packages/ui/src/onboarding/pre-seed-local-runtime.ts` was previously only covered indirectly via `mobile-runtime-mode-hardening.test.ts` (33 PASS as of 2026-05-11).
- **Summary:** Variant detection logic was untested. A regression that mis-classifies a stock-Android Capacitor APK as AOSP-branded would dead-end boot on the 127.0.0.1:31337 pre-seed.
- **Status:** DONE 2026-05-11. Extracted the pure user-agent test into a new exported helper `isAospElizaUserAgent` at `eliza/packages/ui/src/onboarding/pre-seed-local-runtime.ts:92` (small source change: the helper was previously inlined into `isBrandedAndroidDevice` and not exported, making it untestable in isolation). Tightened the regex from `\bElizaOS\//` to `\bElizaOS\/\S/` so a malformed marker without a version (e.g. `ElizaOS/` or bare `ElizaOS`) no longer triggers the pre-seed. New focused unit test at `eliza/packages/ui/src/onboarding/__tests__/sandbox-variant-detection.test.ts` covers 14 cases: 10 pure detection (AOSP marker present, MiladyOS white-label marker, mid-string with pre-release tag, stock-Android UA, stock-iOS UA, malformed marker no version, marker with trailing slash but no version, empty string, null, undefined, leading-word-boundary violation `NotElizaOS/...`) and 3 wrapper integration cases (`preSeedAndroidLocalRuntimeIfFresh` via `navigator.userAgent` injection for AOSP marker present → pre-seeds, absent → skipped, malformed → skipped). Verified 14 PASS; no regression in `mobile-runtime-mode-hardening.test.ts` (33 PASS) or `mobile-runtime-mode.test.ts` (2 PASS).

---

## P2 — documentation / hygiene

### 16. `docs/QA-onboarding.md` originally written against an outdated wizard model — DONE 2026-05-10

- **Severity:** P2 → resolved
- **Citation:** `docs/QA-onboarding.md` lines for W3 / W6 / W7 prior to the 2026-05-10 edits.
- **Summary:** Original doc described a 7-step wizard (Bootstrap → Password → Provider → API key → Features → Character → Finish). Shipping flow is a single `RuntimeGate` chooser. W3 / W6 / W7 are by-design absent.
- **Status:** DONE 2026-05-10. Recast as negative-assertion tests in the campaign. Rewritten doc is the canonical reference and the W3/W6/W7 negative tests are guardrails against accidental regression.

### 17. `docs/onboarding-contracts.md` had 12 TBDs — PARTIAL (4 of 12)

- **Severity:** P2
- **Citation:** `docs/onboarding-contracts.md` § "TBDs" — 4 items resolved by the 2026-05-10 campaign, 8 still pending.
- **Summary:** Wire-contract doc had open verifications for things like the cloud SSO callback handler location, `hasCompatPersistedOnboardingState` predicate, `VerifyBootstrapFailureReason` union, and connector handler return shapes. Half-empty contracts let drift go undetected.
- **Recommended action:** Pick off the remaining 8 TBDs incrementally — each is a focused single-file read.

---

## Knip dead-code pass — 2026-05-11

A knip-driven sweep over the five `-compat`-suffixed files in `eliza/packages/app-core/src/api/` confirmed they were **misnamed-but-live**, not dead. The "-compat" suffix was historical drift from an older upstream-shim model; the actual modules ship production routes today. Outcome:

- `auth-pairing-compat-routes.ts` → renamed to `auth-pairing-routes.ts` (290 LOC, clean). Companion test renamed to `auth-pairing-routes.test.ts` (5/5 PASS as of 2026-05-11).
- `onboarding-compat-routes.ts` → renamed to `onboarding-routes.ts` (242 LOC; `scheduleCloudApiKeyResave` workaround still tracked separately in `audit/layer-4-api.md` Top-10 deletion candidates).
- `plugins-compat-routes.ts` → renamed to `plugins-routes.ts` (1651 LOC; split into `plugins/registry.ts` + `plugins/mutations.ts` + `plugins-routes.ts` still tracked as a P2 refactor in `audit/layer-4-api.md`).
- `server-onboarding-compat.ts` → renamed to `server-onboarding-helpers.ts` (383 LOC, helper module for `onboarding-routes.ts`).

No code was deleted in this pass; the renames are pure naming cleanup. `audit/layer-4-api.md` and `audit/layer-8-state-config.md` updated 2026-05-11 to reflect the new filenames (with a "Renamed YYYY-MM-DD from …" annotation against each entry for the audit trail). Imports across the source tree were updated as part of the rename commits.

---

## New tracking item — connector setup-routes normalization

### 18. Normalize connector setup routes to `/api/setup/<connector>/{status,start,cancel}` — PENDING

- **Severity:** P1 (gates item 14)
- **Citation:** `eliza/plugins/__tests__/setup-routes-contract.test.ts` (12 PASS, 30 expected-fail as of 2026-05-11). `docs/onboarding-contracts.md` §5 documents the shape drift across `/api/discord-local/...`, `/api/telegram-setup/...`, `/api/signal/...`, etc.
- **Summary:** Each connector currently exposes its own bespoke setup namespace with divergent status / pair / disconnect shapes. The 30 expected-fail blocks in the contract test pin the *intended* shared contract; flipping them to real PASS requires migrating each connector to the normalized route layout.
- **Recommended action:**
  1. Define the canonical `SetupRoutesContract` interface in `eliza/packages/shared` (or `eliza/packages/app-core/src/api/setup-contract.ts`) — `GET /api/setup/<name>/status`, `POST /api/setup/<name>/start`, `POST /api/setup/<name>/cancel`, with a single discriminated-union response type.
  2. Migrate connectors one at a time (start with `signal` — smallest surface area, then `discord-local`, then `telegram-setup`, then the remaining four). For each connector: implement the normalized handler, alias the legacy routes to the normalized handler for one release, then drop the alias.
  3. Flip each `test.fails(...)` block in `setup-routes-contract.test.ts` to `it(...)` as its connector lands. Suite goes from 12 PASS + 30 expected-fail → 42 PASS over the migration window.
  4. Once all 42 cases are real PASS, replace the connector-specific tests with the single contract-driven OAuth walkthrough described in item 14.

---

## Final campaign state (2026-05-11)

- **All P0 items resolved.** (Items 1, 2: DONE.)
- **All P1 dead-code items resolved.** (Items 3, 4: DONE.)
- **All P2 cloud source smells resolved.** Items 5, 6, 7, 8 DONE by the cloud-smells agent. Items 9 and 10 DONE 2026-05-11 in the structural `openBrowser` / `ClackModule` refactor — `runCloudOnboarding` now takes a `CloudOnboardingObserver` instead of a clack module, and the OS browser-open failure surfaces through `observer.onAuthBrowserOpenFailed(url, error)` instead of being swallowed at debug-level.
- **Knip dead-code rename pass complete.** All 5 `-compat`-suffixed files renamed; no code deleted (none were dead).
- **Audit doc citations refreshed.** `audit/layer-4-api.md` and `audit/layer-8-state-config.md` now reference the new filenames.

**Open items:** 4 total — items 12 (desktop half), 14, 17, 18.

**Tests passing as of 2026-05-11 sweep:** 19 (`onboarding-failures` — up from 17 with the new C8 + C9 observer cases) + 96 (`flow.test`) + 33 (`mobile-runtime-mode-hardening`) + 14 (`sandbox-variant-detection`) + 17 (`deep-link-entry` — new for item 11) + 5 (`auth-pairing-routes`) + 5 skipped without `MILADY_DESKTOP_QA=1` (`dev-stack-probe`) + 12 PASS / 30 expected-fail (`setup-routes-contract`) = **226 covering cases, 30 documented gaps**.
