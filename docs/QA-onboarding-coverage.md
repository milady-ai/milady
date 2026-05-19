# Onboarding QA Coverage Matrix

Last updated: 2026-05-10 (refreshed during manual screenshot-and-criticize QA pass — findings in [QA-findings.md](QA-findings.md))

Source of truth for which automated tests cover which onboarding steps. Master step definitions in [QA-onboarding.md](QA-onboarding.md).

## Summary

The original matrix counted 28 checkpoints derived from an outdated multi-step wizard model. After realigning to the shipping `RuntimeGate` chooser (see `eliza/packages/ui/src/components/shell/RuntimeGate.tsx`), the table below is the canonical view.

| Surface | Total intended checkpoints | Automated coverage | Operator-required | By-design absent |
|---|---|---|---|---|
| Web (W1–W11) | 11 | 9 (W1, W2, W3-neg, W4+W5-gating, W6+W7-neg, W8, W9, W10, W11) | 0 | 3 (password / features / character — counted as negative-assertion tests) |
| Desktop (D1–D5) | 5 | 2 partial (D1, D2 — Windows packaged only) + 1 opt-in probe (`dev-stack-probe.test.ts`) | 2 (D3 + D5 packaged flow) | 0 |
| Mobile (M1–M5) | 5 | 1 unit (M3 — `mobile-runtime-mode-hardening.test.ts` 33 cases) + 1 partial (M4 iOS-sim path) + scripts for M1/M2 (gracefully-skip in CI) + 1 wire-protocol (M5 — `ios-bridge-handshake-smoke.mjs`, full iOS-handshake phase requires a cloud-hybrid build) | 2 (M1, M2 real-device flows) | 0 |
| Cloud (C1–C7) | 7 | 7 (C1–C7 via `onboarding-failures.test.ts` 12 it-blocks + `RuntimeGate.cloud-provisioning.test.tsx`) | 0 | 0 |
| **Total** | **28** | **21** | **4** | **3** |

The W1–W11 "11 steps" remain in the row count for continuity with the original matrix, but three of them (W3, W6, W7) are now framed as negative-assertion tests — they verify that password, feature-toggle, and character-pick UIs do NOT render in the shipping flow. They are by-design absent, not coverage gaps.

Legacy roll-up (pre-realignment, kept for diff against the original matrix):

- Covered: 9 (mostly W6/W7/C-series in original matrix)
- Partial: 7
- Missing: 9 (many of these are now correctly identified as by-design absent)
- Manual-only: 3

## Test inventory (today)

All paths are relative to `eliza/` (the elizaOS workspace under `milady/eliza`). Only files that touch onboarding, runtime gating, auth bootstrap, cloud provisioning, pairing, mobile runtime, or first-run/setup flows are listed.

| File | Surface | Steps covered | Notes |
|---|---|---|---|
| `packages/app/test/ui-smoke/auth-startup.spec.ts` | Web (Playwright) | W3, W4, W5, C2, C3 | Drives the RuntimeGate startup phase against mocked `/api/status` + `/api/auth/*` endpoints. Covers remote-auth pairing, cloud bootstrap-token gate, bootstrap exchange persisting session bearer, pairing redeem resume, and unavailable-probe failure surfacing. |
| `packages/app/test/ui-smoke/cloud-provisioning-startup.spec.ts` | Web (Playwright) | C4, C5 | Verifies cloud-provisioned startup reaches chat from RuntimeGate across mobile / desktop / wide-web viewports. Mocks the provisioning bridge URL handoff. |
| `packages/app/test/ui-smoke/computer-use.spec.ts` | Web (Playwright) | (none — adjacent) | Computer-use feature smoke. Listed for inventory completeness; does not cover onboarding steps. |
| `packages/app/test/electrobun-packaged/electrobun-windows-startup.e2e.spec.ts` | Desktop (packaged) | D1 (partial) | Verifies packaged Windows launcher bootstraps renderer against external API override. Win32-only. Does not exercise onboarding overlay. |
| `packages/app/test/electrobun-packaged/electrobun-packaged-regressions.e2e.spec.ts` | Desktop (packaged) | D1, D2 (partial) | Asserts `onboarding-ui-overlay` selector + settings shell + connector settings render in packaged Electrobun. Regression-only — does not walk the flow. |
| `packages/ui/src/components/shell/RuntimeGate.cloud-provisioning.test.tsx` | UI unit (vitest jsdom) | W6, W7, W8, C4, C5, C6, C7 | The single richest onboarding test in the repo. Covers: provisioning job bridge URL handoff, Cloud login → first agent provision → complete onboarding, managed launch token use, auto-connect to usable existing agent, provisioning API failure surfacing, first-response timeout, queued/processing stall handling, repeated async poll failures, async-create-before-node-assignment, async stall past `PROVISION_JOB_DEADLINE_MS`, re-provision when `/api/health` fails. Also covers iOS / Android local runtime choice resolution and start. |
| `packages/ui/src/state/startup-phase-runtime.test.ts` | UI unit (vitest) | W1, W2, W3 | Unit-level state machine for `runStartingRuntime` — covers status + auth-status probing, pairing flags, pending-restart wiring. |
| `packages/ui/src/state/complete-reset-local-state-after-wipe.test.ts` | UI unit (vitest) | W11 (partial) | Verifies the local state reset path after a server wipe. Touches `OnboardingOptions` shape but does not exercise full re-onboarding. |
| `packages/ui/src/onboarding/mobile-runtime-mode.test.ts` | Mobile (vitest) | M3 | Verifies persistence of mobile runtime mode (local/remote) to localStorage + Capacitor Preferences for each server target. |
| `packages/ui/src/onboarding/probe-local-agent.test.ts` | Mobile (vitest) | M3 (partial) | Verifies the Android Capacitor probe path + iOS/desktop fetch fallback for the local-agent health check used by the runtime picker. |
| `packages/ui/src/onboarding/auto-download-recommended.test.ts` | Mobile / Web (vitest) | W9, M4 (partial) | Verifies the post-onboarding background model auto-download (iOS simulator hardware path). Only covers one fit branch. |
| `packages/ui/src/components/shell/pairing-command.test.ts` | UI unit (vitest) | W4 (helper) | Pure helper test for SSH/curl pairing command rendering. Not a flow test. |
| `packages/app-core/src/api/auth-bootstrap-routes.real.test.ts` | Server (vitest, real HTTP) | C1, C2, C3 | Real-HTTP contract test for `POST /api/auth/bootstrap/exchange` and the closed-bypass on `GET /api/onboarding/status`. Verifies JWKS-signed JWT acceptance, single-use jti replay rejection, tampered/wrong-issuer/wrong-kid/wrong-containerId rejection. CI gate for the P0 cloud-provisioning auth contract. |
| `packages/app-core/src/api/auth-pairing-compat-routes.test.ts` | Server (vitest) | W4 | Unit tests for the pairing compat routes (pair-code issuance + redeem). |
| `packages/app-core/src/api/auth-session-routes.real.test.ts` | Server (vitest, real HTTP) | W3 (partial) | Real-HTTP session route smoke. Touches the session bearer the bootstrap exchange writes. |
| `packages/app-core/src/api/sensitive-request-routes.test.ts` | Server (vitest) | (adjacent) | Sensitive request gating. Not directly onboarding. |
| `packages/app-core/test/app/onboarding-companion.live.e2e.test.ts` | Live e2e (vitest, real LLM) | W11 (partial) | `describeLive` gated — drives a real onboarding handoff to the companion app under a live provider. Requires `LIVE_TESTS_ENABLED` and a configured live provider; not run by default. |
| `packages/app-core/test/app/qa-checklist.real.e2e.test.ts` | Live e2e (vitest, real runtime) | (adjacent — full-app QA) | Real-runtime app QA checklist. Boots agent + walks scenarios; does not target the onboarding wizard specifically. |
| `plugins/app-lifeops/test/first-run-config-validation.test.ts` | Plugin domain | (n/a) | LifeOps **first-run** (in-chat onboarding for the LifeOps app). Distinct from the **W1–W11 onboarding flow** — `first-run` here means LifeOps preset selection, not the platform onboarding gate. Listed for disambiguation only. |
| `plugins/app-lifeops/test/first-run-defaults.e2e.test.ts` | Plugin domain | (n/a) | Same caveat as above. |
| `plugins/app-lifeops/test/first-run-abandon-resume.e2e.test.ts` | Plugin domain | (n/a) | Same caveat as above. |
| `plugins/app-lifeops/test/first-run-customize.e2e.test.ts` | Plugin domain | (n/a) | Same caveat as above. |
| `plugins/app-lifeops/test/first-run-replay.e2e.test.ts` | Plugin domain | (n/a) | Same caveat as above. |
| `plugins/app-lifeops/test/spine-and-first-run.integration.test.ts` | Plugin domain | (n/a) | Same caveat as above. |
| `plugins/plugin-elizacloud/__tests__/cloud-credential-provider.test.ts` | Plugin (vitest) | C6 (partial) | Cloud credential provider resolution branches. Touches the connector path the onboarding flow surfaces but does not test onboarding directly. |
| `plugins/plugin-elizacloud/__tests__/cloud-route-plugin.test.ts` | Plugin (vitest) | C1 (partial) | Asserts the cloud login/provision/connect/shutdown routes are registered. Contract-shape only. |
| `plugins/plugin-elizacloud/__tests__/cloud-billing-routes.test.ts` | Plugin (vitest) | (adjacent) | Billing route proxy. Not onboarding. |
| `packages/app/test/ui-smoke/onboarding-full-flow.spec.ts` | Web (Playwright) | W1, W2, W3 (neg), W4+W5 (gating), W6+W7 (neg), W8, W9, W10, W11 | NEW (this campaign). 9 active cases. W3 / W6 / W7 are negative-assertion checks (password / features / character do NOT render). W4+W5 verify the local sub-view is gated on `runtimeChoices.includes("local")` on production web. |
| `packages/ui/src/onboarding/__tests__/flow.test.ts` | UI unit (vitest) | (abstract step graph) | NEW (this campaign). 50 it-blocks fuzzing `flow.ts` — `getStepOrder`, `resolveOnboardingNextStep`, `resolveOnboardingPreviousStep`, `canRevertOnboardingTo`, `getOnboardingNavMetas`, `shouldSkipFeaturesStep`, `shouldUseCloudOnboardingFastTrack`. Covers the 3-step abstract graph (`deployment` → `providers` → `features`), distinct from the shipping single-chooser `RuntimeGate`. |
| `plugins/plugin-elizacloud/__tests__/onboarding-failures.test.ts` | Plugin (vitest) | C1, C2, C3, C4, C5, C6, C7 | NEW (this campaign). 13 it-blocks (1 source-constants pin + 12 case scenarios). The single richest cloud-onboarding test in the repo today. Pins 6 source smells in `plugin-elizacloud/src/onboarding.ts` not yet fixed (see `QA-onboarding-followups.md`). |
| `packages/app-core/test/dev-stack/dev-stack-probe.test.ts` | Desktop dev-stack (vitest, opt-in) | D1 / D2 (local-dev probe) | NEW (this campaign). Skips unless `MILADY_DESKTOP_QA=1`; verifies `bun run desktop:stack-status -- --json` reports `apiListening: true, uiListening: true` against a live `bun run dev:desktop`. Not in CI. |
| `packages/ui/src/onboarding/__tests__/mobile-runtime-mode-hardening.test.ts` | Mobile (vitest) | M3 | NEW (this campaign). 25 it-blocks (some `.each` parameterized — 33 effective cases) covering `normalizeMobileRuntimeMode`, `mobileRuntimeModeForServerTarget`, `readPersistedMobileRuntimeMode`, `persistMobileRuntimeModeForServerTarget`, event dispatch, Capacitor Preferences failure paths, idempotency, and round-trip persistence. |
| `plugins/__tests__/setup-routes-contract.test.ts` | Plugin contract (vitest) | (cross-plugin connector setup) | NEW (this campaign). 5 `test.fails(...)` per connector pinning the intended `/api/setup/<name>/{status,start,cancel}` contract. Today every connector diverges (see `docs/onboarding-contracts.md` §5). These tests document the gap; normalization tracked as Stage 1.6 follow-up. |
| `packages/app/scripts/ios-bridge-handshake-smoke.mjs` | Mobile (Node + iOS sim) | M5 | NEW. Wire-protocol smoke for the agent ↔ device-bridge WebSocket handshake. Boots a mock HTTP+WS server matching the agent half of `/api/local-inference/device-bridge`, dials it from a Node `ws` client that sends the same `register` frame the iOS `DeviceBridgeClient` sends, and verifies the mock surfaces the device on `GET /api/local-inference/device`. iOS-sim launch phase opt-in: only runs end-to-end when the prebuilt App.app bakes `VITE_ELIZA_IOS_API_BASE=http://127.0.0.1:31337` + `VITE_ELIZA_IOS_RUNTIME_MODE=cloud-hybrid`; otherwise skips cleanly. Not in CI. |

## Coverage matrix

### Web (W1–W11)

Note on numbering: the W-labels here match `docs/QA-onboarding.md` after the realignment (where W3 = "no password step", W4+W5 = "local sub-view gating", W6+W7 = "no features/character step"). The original matrix used the same labels for the old wizard model — those interpretations are obsolete.

| Step | Status | Test file | Notes |
|---|---|---|---|
| W1 Cold launch (RuntimeGate landing) | Covered | `packages/app/test/ui-smoke/onboarding-full-flow.spec.ts`, `packages/ui/src/state/startup-phase-runtime.test.ts` | Playwright cold-launch now asserted end-to-end alongside the unit-level state-machine test. |
| W2 Advanced disclosure / power-user options | Covered | `packages/app/test/ui-smoke/onboarding-full-flow.spec.ts` | Disclosure toggle + "Already running an agent?" card asserted. |
| W3 Negative-assertion: no password step | By-design absent (covered by negative test) | `packages/app/test/ui-smoke/onboarding-full-flow.spec.ts` | `PasswordSetupStep.tsx` is unimported dead code (Stage 5.4 deletion). Test asserts neither the heading nor the form renders on a fresh launch. |
| W4 + W5 Local provider + API key sub-view gating | Covered | `packages/app/test/ui-smoke/onboarding-full-flow.spec.ts` | Production web build has `runtimeChoices.includes("local") === false`; sub-view unreachable. Desktop / mobile builds exercise this sub-view via their own surface-specific specs. |
| W6 + W7 Negative-assertion: no feature/character steps | By-design absent (covered by negative test) | `packages/app/test/ui-smoke/onboarding-full-flow.spec.ts` | Choices are made post-onboarding from Settings / apps catalog. Cloud-only flow does not surface separate `"features"` / `"character"` pages. |
| W8 Finish writes `eliza:onboarding-complete=1` | Covered | `packages/app/test/ui-smoke/onboarding-full-flow.spec.ts` | Drives the Remote sub-view (the one end-to-end finish path the production web build exposes without a live cloud backend). Mirrors the cloud-path contract in `cloud-provisioning-startup.spec.ts`. |
| W9 Reload after completion does not re-enter gate | Covered | `packages/app/test/ui-smoke/onboarding-full-flow.spec.ts`, `packages/ui/src/onboarding/auto-download-recommended.test.ts` | Spec seeds completed state and verifies `onboarding-ui-overlay` does NOT mount on reload. |
| W10 `?reset` clears completion and re-renders gate | Covered | `packages/app/test/ui-smoke/onboarding-full-flow.spec.ts` | Verifies `applyForceFreshOnboardingReset` clears active-server / step / complete keys and re-mounts the chooser. |
| W11 Persisted step keeps gate mounted | Covered | `packages/app/test/ui-smoke/onboarding-full-flow.spec.ts`, `packages/ui/src/state/complete-reset-local-state-after-wipe.test.ts`, `packages/app-core/test/app/onboarding-companion.live.e2e.test.ts` | Resume contract asserted: persisted `eliza:onboarding:step="providers"` + no completion flag keeps chooser mounted. |

### Desktop (D1–D5)

| Step | Status | Test file | Notes |
|---|---|---|---|
| D1 Packaged Electrobun cold launch + renderer bootstrap | Partial | `packages/app/test/electrobun-packaged/electrobun-windows-startup.e2e.spec.ts`, `packages/app/test/electrobun-packaged/electrobun-packaged-regressions.e2e.spec.ts`, `packages/app-core/test/dev-stack/dev-stack-probe.test.ts` | Windows-only for cold launch. macOS / Linux packaged-launch tests are absent. Opt-in dev-stack probe added this campaign covers a live `bun run dev:desktop`. |
| D2 Onboarding overlay renders in packaged desktop | Partial | `packages/app/test/electrobun-packaged/electrobun-packaged-regressions.e2e.spec.ts` | Asserts `[data-testid="onboarding-ui-overlay"]` exists; does not walk through steps. |
| D3 Desktop local-runtime selection + agent start | Missing | — | No automated test drives the local-runtime choice through to a running agent in packaged desktop. `DesktopOnboardingRuntime.tsx` is a 10-line `return null` stub. |
| D4 Desktop cloud pairing | Missing | — | The web Playwright path covers cloud provisioning, but not in the Electrobun renderer with native IPC. |
| D5 Desktop relaunch / pending-restart on onboarding finish | Operator-required | — | No automated coverage. RuntimeGate tests touch `setPendingRestart` at the unit level but the actual desktop relaunch is a native concern. |

### Mobile (M1–M5)

| Step | Status | Test file | Notes |
|---|---|---|---|
| M1 iOS cold launch + Capacitor bootstrap | Operator-required | `scripts/qa/ios-sim-smoke.sh`, `scripts/qa/mobile-screenshot-walkthrough.mjs` | NEW (this campaign). Script gracefully skips on non-macOS / missing Xcode. CI does NOT run on iOS sim. Blocked by `MILADY_DEFAULT_THEME` missing export (see follow-up ledger). |
| M2 Android cold launch + Capacitor bootstrap | Operator-required | `scripts/qa/android-emu-smoke.sh`, `scripts/qa/mobile-screenshot-walkthrough.mjs` | NEW (this campaign). Script gracefully skips when adb/emulator/AVD missing. CI does NOT run on Android emu. Same `MILADY_DEFAULT_THEME` build blocker. |
| M3 Mobile runtime-mode persistence | Covered | `packages/ui/src/onboarding/__tests__/mobile-runtime-mode-hardening.test.ts` (NEW — 33 cases), `packages/ui/src/onboarding/mobile-runtime-mode.test.ts`, `packages/ui/src/onboarding/probe-local-agent.test.ts` | Hardening test pins normalization, server-target mapping, persistence (localStorage + Capacitor Preferences), event dispatch, idempotency, and round-trip. Android AOSP pre-seed lives in `eliza/packages/ui/src/onboarding/pre-seed-local-runtime.ts` (NOT `mobile-runtime-mode.ts`). |
| M4 Mobile auto-download recommended local model | Partial | `packages/ui/src/onboarding/auto-download-recommended.test.ts` | iOS-sim path only; Android tier / cellular-skip branches untested. |
| M5 Mobile pairing for remote target | Automated (wire-protocol) | `eliza/packages/app/scripts/ios-bridge-handshake-smoke.mjs` (`test:sim:bridge:ios`) | NEW. Wire-protocol smoke: mock device-bridge HTTP+WS server on `127.0.0.1:31337` (override via `MILADY_BRIDGE_SMOKE_PORT`), self-test dial from a Node `ws` client that sends a real `register` frame and verifies the mock surfaces the device on `GET /api/local-inference/device`. Pairing-code helper is also unit-tested at the web layer. iOS-sim launch phase runs end-to-end when the prebuilt App.app bakes `VITE_ELIZA_IOS_API_BASE=http://127.0.0.1:31337` and `VITE_ELIZA_IOS_RUNTIME_MODE=cloud-hybrid`; otherwise it skips cleanly with a rebuild instruction. Deep-link entry (`milady://onboard/...`) remains operator-required. |

### Cloud (C1–C7)

| Step | Status | Test file | Notes |
|---|---|---|---|
| C1 Cloud provisioning route surface present | Covered | `plugins/plugin-elizacloud/__tests__/cloud-route-plugin.test.ts`, `packages/app-core/src/api/auth-bootstrap-routes.real.test.ts` | Route registration + real-HTTP exchange contract. |
| C2 Bootstrap token exchange (happy + replay) | Covered | `packages/app-core/src/api/auth-bootstrap-routes.real.test.ts`, `packages/app/test/ui-smoke/auth-startup.spec.ts` | RS256/JWKS happy + single-use jti rejection + UI bootstrap-token gate. |
| C3 Bootstrap token rejection (tampered, wrong issuer/kid/container) | Covered | `packages/app-core/src/api/auth-bootstrap-routes.real.test.ts` | Four explicit rejection scenarios. |
| C4 Provisioning bridge URL handoff | Covered | `packages/ui/src/components/shell/RuntimeGate.cloud-provisioning.test.tsx`, `packages/app/test/ui-smoke/cloud-provisioning-startup.spec.ts` | UI unit + Playwright. |
| C5 Managed launch token / auto-connect existing agent | Covered | `packages/ui/src/components/shell/RuntimeGate.cloud-provisioning.test.tsx` | Two explicit it() blocks. |
| C6 Cloud credential provider for connectors | Partial | `plugins/plugin-elizacloud/__tests__/cloud-credential-provider.test.ts` | Branches covered, but not surfaced through onboarding flow. |
| C7 Provisioning failure / async-stall / timeout / re-provision | Covered | `packages/ui/src/components/shell/RuntimeGate.cloud-provisioning.test.tsx` | Eight failure scenarios. |

## Known gaps after this QA campaign

The Stage 1.1 / 1.2 / 1.3 / 1.6 / 2.2 / 2.4 deliverables in the original ledger have landed (see "Test inventory" rows tagged NEW). The remaining gaps below are the ones still standing after Stages 1–3:

- **W9 / M4 (Auto-download hardware fit branches)** — `packages/ui/src/onboarding/auto-download-recommended.test.ts` still covers only the iOS-sim path. Android tier / cellular-skip / already-downloaded short-circuit are untested.
- **D3 (Desktop local-runtime selection → running agent)** — no automated test drives the local-runtime choice through to a running agent in packaged desktop. `DesktopOnboardingRuntime.tsx` is dead-code stub (Stage 5.4 deletes it).
- **D4 (Desktop cloud pairing through Electrobun renderer)** — web Playwright covers cloud provisioning, but not in the Electrobun renderer with native IPC.
- **D5 (Desktop relaunch / pending-restart)** — operator-required; not in scope for headless Electrobun coverage.
- **M1 / M2 (Real iOS / Android cold launch)** — opt-in scripts ship but skip in CI. Blocked end-to-end on a CI signing / signing-cert path AND on the `MILADY_DEFAULT_THEME` shared-package export break (see `QA-onboarding-followups.md`).
- **M5 (Full iOS device-bridge handshake)** — wire-protocol smoke ships via `eliza/packages/app/scripts/ios-bridge-handshake-smoke.mjs` (`test:sim:bridge:ios`). The iOS-sim launch phase only runs end-to-end when the App.app baked into the simulator has `VITE_ELIZA_IOS_API_BASE=http://127.0.0.1:31337` and `VITE_ELIZA_IOS_RUNTIME_MODE=cloud-hybrid`; today's prebuilt bakes neither, so the iOS-launch phase skips cleanly. Deep-link entry (`milady://onboard/...`) remains operator-required.
- **C6 (Cloud credential provider via onboarding)** — onboarding-failures tests assert provisioning + key persistence at the orchestrator layer, but do not walk the end-to-end "agent provisioned → connector secret materialized" path through the runtime.
- **Connector OAuth flows (Discord / Telegram / Signal)** — `setup-routes-contract.test.ts` pins the *intended* contract via `test.fails(...)`. Today every connector diverges and there is no automated end-to-end OAuth walkthrough. Normalization is Stage 1.6 follow-up.
- **iOS deep-link entry (`milady://onboard/...`)** — no automated test; documented under M5.
- **Permission prompts (notifications, file access)** — no automated coverage on mobile or desktop; OS-native dialogs are out of reach for Playwright. Operator-required.
- **App relaunch after cloud agent provisioning** — `cloud-provisioning-startup.spec.ts` and `RuntimeGate.cloud-provisioning.test.tsx` cover handoff, but a real relaunch with `setPendingRestart` is not exercised in CI.
- **Sandbox / store distribution onboarding (per `docs/sandbox-mode.md`)** — variant-specific bootstrap paths (AOSP pre-seed, App Store sandboxed entitlements, AOSP terminal-access surface) have no dedicated onboarding tests. AOSP pre-seed is partially covered by the mobile-runtime-mode hardening test, but the variant detection (`ElizaOS/<tag>` user-agent marker) is not unit-tested.

## Manual evidence captured during the 2026-05-10 screenshot-and-criticize pass

The full punch list with severity tags and source pointers is in [QA-findings.md](QA-findings.md). Surface coverage from this manual pass:

| Surface | Driver | What was actually exercised | Gating issues found |
|---|---|---|---|
| iOS sim (iPhone 17 Pro, iOS 26.4, cloud-hybrid runtime) | computer-use MCP | Full 6-tab tour: Chat (download-in-progress card) / Apps (Starred + Featured) / Person (Personality + Relationships) / Wallet (empty + CoinGecko market) / Browser (URL bar empty state) / Settings (Basics + Providers=Eliza Cloud) | 13 findings — 1 fix landed (`formatGb` space); needs iOS rebuild to verify visually. |
| Android emulator (Pixel_API_35, Android 15, arm64-v8a) | adb / screencap | Splash sequence (2 visually different stacked splashes) → Welcome → Cloud sign-in → "Run it myself" disclosure → Power User card → tapped "USE LOCAL" | 13 findings — 1 S0 (AND-012): tapping `USE LOCAL →` leaves the app stuck on the splash for 20+ s with no progress indicator. |
| Web (Vite dev :2138) | Claude Preview MCP | Boot splash → loading state → Chat → Apps → Character. Wallet/inventory and deeper pages blocked by W-INFRA-001 (Vite HMR reload-loop). | 12 findings — 2 S0 (W-INFRA-001 reload loop; W-010 Wallet renders empty root). 1 fix landed (chat input placeholder copy in `en.json`). |
| Desktop (Electrobun) | — | Not exercised this pass — web shell is the same renderer; assume web findings replicate until proven otherwise. | OS-level chrome (via `/api/dev/cursor-screenshot`), pending-restart UX, and multi-window behaviour all need a `bun run dev:desktop` boot. |
