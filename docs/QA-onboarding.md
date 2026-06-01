# Onboarding QA — Manual & Automated Walkthroughs

This is the canonical guide for verifying any onboarding flow in Milady. Every step has a precondition, an expected outcome, and an automation pointer where one exists.

## Surfaces covered

- **Web** — the Vite-served React app at http://localhost:2138 in dev. The shipping onboarding surface is the `RuntimeGate` chooser at `eliza/packages/ui/src/components/shell/RuntimeGate.tsx`, not a multi-step wizard.
- **Desktop** — Electrobun-wrapped same app. `DesktopOnboardingRuntime` (`eliza/packages/ui/src/desktop-runtime/DesktopOnboardingRuntime.tsx`) is currently a 10-line `return null` stub kept for the lazy-permissions flow; it does not drive onboarding UI today.
- **Mobile** — Capacitor builds for iOS and Android; `apps/app/capacitor.config.ts`. Same `RuntimeGate` chooser, with mobile-specific pre-seed and runtime-mode persistence.
- **Cloud pairing** — OAuth + device polling via `eliza/plugins/plugin-elizacloud/src/onboarding.ts` (CLI / first-time-setup orchestrator). The browser-side cloud login lives in `eliza/plugins/plugin-elizacloud/src/routes/cloud-routes.ts` and is gated by the `cloudDisconnectEpoch` race guard at `cloud-routes.ts:121`.

## Common preconditions

1. Repo on develop, deps installed: `bun install`.
2. No leftover `~/.local/state/milady/` state from a previous run (or use the `?reset` query param documented in packages/app-core/src/api/onboarding-reset.ts).
3. For mocked runs: no live API keys in env.
4. For live runs: `ELIZA_LIVE_TEST=1` + provider API key (Cerebras recommended for cheapest spend).

## Flow steps — what every onboarding traverses

Source of truth: `eliza/packages/ui/src/onboarding/flow.ts` for the abstract step graph, and `eliza/packages/ui/src/components/shell/RuntimeGate.tsx` for the single shipping chooser. They are **not** the same surface — the abstract graph defines `"deployment" | "providers" | "features"`, but the shipping web onboarding renders `RuntimeGate` as one chooser screen and does not walk the user through three pages.

1. **Bootstrap (RuntimeGate chooser)** — `RuntimeGate` renders the welcome chooser with "Get started" (cloud fast-track), advanced disclosure ("I want to run it myself") that surfaces "Connect remote" everywhere and "Use local" only when the build can host a local agent (desktop / Vite dev / mobile native). On the production web build, `runtimeChoices` excludes `"local"` so only Cloud and Remote appear.
2. **Provider selection (local-runtime sub-view only)** — gated behind `runtimeChoices.includes("local")` on `RuntimeGate`. The provider catalog (OpenAI, Anthropic, Groq, Gemini, OpenRouter, XAI, Cloud) appears only when the local sub-view opens. Production web never reaches this sub-view.
3. **API key entry (local-runtime sub-view only)** — same gate as provider selection. UI primitives in `eliza/packages/ui/src/components/onboarding/onboarding-form-primitives.tsx`.
4. **Finish** — completion marker written:
   - `localStorage["eliza:onboarding-complete"] = "1"` (writer at `eliza/packages/ui/src/state/persistence.ts:398`; reader at `persistence.ts:382` checks `=== "1"`).
   - `localStorage["elizaos:active-server"] = JSON.stringify(<PersistedActiveServer>)` (writer in `useOnboardingState.ts`; key constant at `persistence.ts:853`).
   - `meta.onboardingComplete = true` in `~/.local/state/milady/milady.json` (server-side, `eliza/packages/app-core/src/api/onboarding-routes.ts:238`).
   - `firstRunPending` transitions to `false` via the lifeops first-run state store (`eliza/plugins/app-lifeops/src/providers/first-run.ts:94`).

### What does NOT appear in the shipping web onboarding

The original QA spec listed password setup, feature toggles, and character pick as wizard steps. They are **not** part of the shipping web onboarding flow. The W3 / W6 / W7 test cases below are **negative-assertion** checks — they verify these UIs do **not** render — and they are by-design absent rather than coverage gaps.

- **Password setup** — `PasswordSetupStep.tsx` (`eliza/packages/ui/src/components/onboarding/PasswordSetupStep.tsx`) exists in source but is **not imported** by any production code path. It is dead code scheduled for removal (Stage 5.4). Tests assert its absence; do not treat it as a missing step.
- **Feature toggles** — choices are made post-onboarding from Settings / the apps catalog. The abstract `flow.ts` includes a `"features"` step, but `RuntimeGate` does not walk users through one as part of the first-run chooser.
- **Character pick** — same as feature toggles: chosen later via the agent settings UI or app catalog, not in the cold-launch chooser.

## Per-surface walkthrough

### Web (browser)

Surfaces tested via `eliza/packages/app/test/ui-smoke/onboarding-full-flow.spec.ts` (W1–W11, 9 active cases — W3/W6/W7 are negative-assertion checks, W4+W5 fold into a single gating assertion).

| # | Step | Manual action | Automation | Pass criteria |
|---|---|---|---|---|
| W1 | Cold launch | `bun run dev`, open http://localhost:2138 in fresh profile | `onboarding-full-flow.spec.ts` "W1 cold launch renders the runtime gate landing" | `data-testid="onboarding-ui-overlay"` mounts; "Welcome to Eliza/Milady" heading visible; "Get started" button visible; `eliza:onboarding-complete` is null |
| W2 | Advanced disclosure | Click "I want to run it myself" | `onboarding-full-flow.spec.ts` "W2 advanced disclosure surfaces the power-user options" | Disclosure toggle goes `aria-expanded="true"`; "Already running an agent?" card visible. "Use local" appears only on builds with local probe true |
| W3 | **Negative-assertion: no password step** | n/a | `onboarding-full-flow.spec.ts` "W3 fresh launch does not surface password setup" | No `/set your login password/i` heading; no `form[aria-label="Password setup"]`. `PasswordSetupStep.tsx` is by-design absent (dead code; Stage 5.4 deletion) |
| W4+W5 | Local provider + API key sub-view | Toggle disclosure → check for "Pick a model provider" | `onboarding-full-flow.spec.ts` "W4 + W5 local provider + API key sub-view is gated on local availability" | On production web build (`runtimeChoices` excludes "local"), neither "Pick a model provider" nor "Add your API key" renders; `?runtime=picker&pickerTarget=local` URL still shows chooser landing |
| W6+W7 | **Negative-assertion: no feature/character steps** | n/a | `onboarding-full-flow.spec.ts` "W6 + W7 no separate feature-toggle or character-pick steps render" | No "Feature toggles" / "Choose your character" / "Pick a character" headings render. These are by-design absent — choices are made post-onboarding |
| W8 | Finish via Remote sub-view | Open advanced → "Already running an agent?" → enter API base → click Connect | `onboarding-full-flow.spec.ts` "W8 completing the remote flow writes eliza:onboarding-complete=1" | `localStorage["eliza:onboarding-complete"] === "1"` (NOT `"true"`); `elizaos:active-server` JSON populated |
| W9 | Reload after complete | Reload page | `onboarding-full-flow.spec.ts` "W9 reload after onboarding-complete does not re-enter the gate" | `onboarding-ui-overlay` not present; "Welcome to …" heading absent |
| W10 | Reset | Navigate to `/?reset` | `onboarding-full-flow.spec.ts` "W10 ?reset clears completion and re-renders the gate" | `eliza:onboarding-complete` cleared to null; chooser re-mounts |
| W11 | Resume mid-flow | Pre-seed `localStorage["eliza:onboarding:step"] = "providers"` and reload | `onboarding-full-flow.spec.ts` "W11 persisted onboarding step keeps the gate mounted on reload" | Chooser stays mounted; step key still `"providers"`; complete key remains null |

### Desktop (Electrobun)

| # | Step | Manual action | Automation | Pass criteria |
|---|---|---|---|---|
| D1 | Cold launch | `bun run dev:desktop` from fresh `~/.local/state/milady/` | `bun run desktop:stack-status -- --json` must report `apiListening: true, uiListening: true` | All three ports up |
| D2 | Window screenshot | n/a | `curl http://127.0.0.1:<apiPort>/api/dev/cursor-screenshot > screenshot.png` | PNG of BootstrapStep |
| D3 | Driving the flow | Click through W2–W8 with mouse | Reuse Playwright spec via Electrobun's CDP (renderer URL from `/api/dev/stack`) | Same as W2–W8 |
| D4 | Pairing token | Open `/api/auth/pair` UI | Manual click + verify token TTL (5 min per auth-pairing-compat-routes.ts) | Token expires after 5 min |
| D5 | Reset | Quit, delete `~/.local/state/milady/`, relaunch | n/a | Returns to BootstrapStep |
| D6 | Permission prompts (lazy cascade D1-D7) | Reset granted permissions per the macOS pre-flight (`tccutil reset Notifications/Camera/Microphone/MediaLibrary/Accessibility/ScreenCapture ai.elizaos.app`), launch `bun run dev:desktop`, drive each prompt: D1 notifications, D2 camera, D3 microphone, D4 location, D5 photos, D6 accessibility, D7 screen recording. Grant or skip per prompt | `node scripts/qa/desktop-permission-walkthrough.mjs --init` scaffolds `reports/qa/<date>/desktop-permissions/` with a D1-D7 `CHECKLIST.md` (including the `tccutil reset` operator block); capture each OS dialog via `mcp__computer-use__screenshot` into that directory using the listed filenames; `--finalize` validates and writes `SUMMARY.md` with sizes + sha256s. Playwright cannot reach native OS dialogs — computer-use MCP is required. Windows + Linux variants are TODO comments in the script | Each prompt observed; outcome (granted/skipped) recorded in CHECKLIST.md; SUMMARY.md reports `PASS: 7/7 prompts captured` or itemizes the gaps |

### Mobile (Capacitor — local dev only)

iOS sim and Android emu are not in CI. Local-dev procedure only.

| # | Step | Manual action | Automation | Pass criteria |
|---|---|---|---|---|
| M1 | iOS sim build | `bun run --cwd apps/app build:ios` then open `apps/app/ios/App.xcworkspace` in Xcode, run on iPhone 15 sim | `bash scripts/qa/ios-sim-smoke.sh [--device "iPhone 15"]` (local dev only — gracefully skips on non-macOS / missing Xcode) for the boot+launch; for a full screenshot walkthrough also run `node scripts/qa/mobile-screenshot-walkthrough.mjs --init --surface ios`, save MCP screenshots into `reports/qa/<date>/mobile/ios/`, then `--finalize --surface ios` to emit `SUMMARY.md` | App boots, BootstrapStep renders; screenshot at `/tmp/milady-ios-onboarding-*.png` (smoke) or `reports/qa/<date>/mobile/ios/M1-cold-launch.png` (walkthrough) |
| M2 | Android emu build | `bun run --cwd apps/app build:android` then `npx cap run android` | `bash scripts/qa/android-emu-smoke.sh [--avd <name>]` (local dev only — gracefully skips when adb/emulator/AVD missing) for the boot+launch; for the screenshot walkthrough run `node scripts/qa/mobile-screenshot-walkthrough.mjs --init/--finalize --surface android` and capture each step via computer-use MCP into the generated directory | App boots, BootstrapStep renders; screenshot at `/tmp/milady-android-onboarding-*.png` (smoke) or `reports/qa/<date>/mobile/android/M2-bootstrap-step.png` (walkthrough) |
| M3 | Android pre-seed (AOSP ElizaOS build only) | First launch on AOSP ElizaOS variant | Pre-seed lives in `eliza/packages/ui/src/onboarding/pre-seed-local-runtime.ts` (NOT `mobile-runtime-mode.ts`). Runtime-mode persistence covered by `eliza/packages/ui/src/onboarding/__tests__/mobile-runtime-mode-hardening.test.ts` (33 cases) | Active server pre-seeded so chooser is skipped; stock Android Capacitor APKs must NOT pre-seed (would dead-end on 127.0.0.1:31337 connect loop) |
| M4 | Deep link entry | Open `milady://onboard/step/provider` | computer-use MCP — save screenshot as `M4-deep-link-provider.png` under the directory scaffolded by `node scripts/qa/mobile-screenshot-walkthrough.mjs --init --surface <ios\|android>`; `--finalize` records its size + sha256 | Skips to provider step |
| M5 | Permission prompts (lazy cascade P1-P6) | Drive the app to trigger each prompt in turn: P1 notifications, P2 photos/files, P3 camera, P4 microphone, P5 location, P6 bluetooth/local-network (Android only). Grant or skip per prompt | `node scripts/qa/mobile-permission-walkthrough.mjs --init --surface <ios\|android>` scaffolds `reports/qa/<date>/mobile-permissions/<surface>/` with a P1-P6 `CHECKLIST.md`; capture each OS dialog via `mcp__computer-use__screenshot` into that directory using the listed filenames; `--finalize` validates and writes `SUMMARY.md` with sizes + sha256s. Playwright CANNOT reach native dialogs — computer-use MCP is required | Each prompt observed; outcome (granted/skipped) recorded in CHECKLIST.md; SUMMARY.md reports `PASS: N/N prompts captured` or itemizes the gaps |

### Cloud pairing

Covered by `eliza/plugins/plugin-elizacloud/__tests__/onboarding-failures.test.ts` (C1–C7, 12 it-blocks total) and `eliza/packages/ui/src/components/shell/RuntimeGate.cloud-provisioning.test.tsx` (UI handoff).

| # | Step | Manual action | Automation | Pass criteria |
|---|---|---|---|---|
| C1 | Availability check | Choose "Cloud" / "Get started" on RuntimeGate | `onboarding-failures.test.ts` "C1 — availability=true happy path" | `acceptingNewAgents: true` returned; flow advances availability → auth → provisioning → running |
| C2 | Availability false | Mock availability=false | `onboarding-failures.test.ts` "C2 — availability=false" (3 it-blocks: prompt-to-local, capacity-exhaustion, non-2xx) | UI surfaces "run locally instead" affordance; `checkCloudAvailability` returns descriptive reason string |
| C3 | Browser auth | Click "Sign in" | `onboarding-failures.test.ts` "C3 — auth success" | Returns `{ apiKey, agentId, baseUrl }`; persisted via `persistCloudLoginStatus()` in `cloud-routes.ts` |
| C4 | Auth timeout | Hang the poll | `onboarding-failures.test.ts` "C4 — auth timeout" (2 it-blocks: local-fallback, retry-also-times-out) | UI shows timeout; user can retry or fall back to local; race guarded by `cloudDisconnectEpoch` at `cloud-routes.ts:121` |
| C5 | Provisioning happy progression | After auth, agent gets provisioned | `onboarding-failures.test.ts` "C5 — provisioning happy progression" (2 it-blocks: queued→provisioning→running, and `completed` alias) | Polls every `PROVISION_POLL_INTERVAL_MS = 3_000` and returns `{ agentId, bridgeUrl }` |
| C6 | Provisioning timeout | Stay in `"provisioning"` > 2 min | `onboarding-failures.test.ts` "C6 — provisioning timeout" | Returns `agentId` so user can reconnect later; timeout = `PROVISION_TIMEOUT_MS = 120_000` |
| C7 | Saved-key validation | Restart with revoked key | `onboarding-failures.test.ts` "C7 — saved-key validation against /models" | Logs warning and keeps cached key when `/models` rejects |

## Evidence checklist for any QA report

Every onboarding QA pass must include:

1. The test command run, exit code, duration.
2. For UI: at least one screenshot per surface tested (Playwright artifact or `/api/dev/cursor-screenshot`).
3. For desktop: `bun run desktop:stack-status -- --json` output.
4. For cloud: the fixture set used + observed state transitions.
5. For mobile: screenshots from sim/emu via computer-use MCP, OR a documented "untestable in this environment" with reason.

## When a step is untestable

Mark as **DEGRADED** with reason. Do not mark as PASS without evidence. Acceptable reasons:

- Mobile sim not available on this host
- Real cloud unavailable (use `*.real.test.ts` lane post-merge)
- OS-specific keychain check (run on the target OS)

## Coverage matrix

See [QA-onboarding-coverage.md](QA-onboarding-coverage.md) for the live tracking of which automated tests cover which steps.
