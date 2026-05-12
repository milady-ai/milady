# Milady QA Findings — Full-surface design/UX review

Driver: Claude Opus 4.7 (1M context) doing a systematic page-by-page screenshot-and-criticize pass against desktop / iOS / Android / web.

Severity tags:
- **S0** — blocks first-run flow or breaks core UX. Fix before next release.
- **S1** — visible polish gap, broken UX edge, or design inconsistency a new user will notice. Fix this cycle.
- **S2** — cosmetic, copy, or low-impact correctness issue. Fix when convenient.
- **S3** — observation worth capturing but not a defect yet (design choice with tradeoffs).

## Surfaces & coverage

| Surface | Driver | Status | Notes |
|---|---|---|---|
| iOS sim (iPhone 17 Pro, iOS 26.4, cloud-hybrid runtime) | computer-use MCP | Full tour (6 tabs) | Initial chat/download view, Apps, Person/Character, Wallet, Browser, Settings. |
| Android emulator (Pixel_API_35) | adb / screencap | Full first-run tour | Welcome → Cloud sign-in → "Run it myself" → Power User → USE LOCAL splash-stuck (AND-012 S0). |
| Desktop (Electrobun) | `bun run dev:desktop` + /api/dev/* | W-INFRA-002 (`node:sqlite`) fixed; re-test pending | Web shell is same renderer; web findings replicate. |
| Web (Vite dev :2138, prod preview :4173) | Claude Preview MCP | Partial — chat/apps/character captured; deeper tabs blocked by W-016 (runtime gate hung). 18 additional tabs audited at source level. |

---

## P0 — Blocking issues

### W-INFRA-001 — Vite HMR reconnect-loop during dev causing pages to remount continuously (S0) — RESOLVED
- **Root cause:** `watchWorkspacePackagesPlugin` in `apps/app/vite.config.ts` matched any `/packages/` path and fired full reloads on every chokidar event — including events under `node_modules/.bun/@elizaos+...`.
- **Resolved:** scoped watcher to explicit `.add()`-ed roots; excluded `node_modules/`, `dist/`, `.vite/`, `build/`, `.eliza/`, `.tmp/`. Verified by 25s WS probe.

### W-INFRA-002 — `dev:desktop` API crashed on `node:sqlite` (S0) — RESOLVED
- **Root cause:** stale `eliza/packages/app-core/dist/api/training-benchmarks.js` had eager static `import { DatabaseSync } from "node:sqlite"` while source uses lazy `requireFromHere` with try/catch.
- **Resolved:** rebuilt app-core; `bun run dev` now starts clean with no `node:sqlite` error.

### W-INFRA-005 — Embedding model warmup rejected `text/eliza-1-lite-0_6b-32k.gguf` (S1) — RESOLVED
- **Source:** `eliza/packages/app-core/src/runtime/embedding-manager-support.ts:217-235`
- **Fix:** widened `sanitizeModelFilename` regex to permit `/`-separated segments while gating each to `[A-Za-z0-9._-]+` and rejecting `.` / `..`. Verified: accepts `text/eliza-1-lite-0_6b-32k.gguf`, rejects path-traversal patterns.

### AND-BUILD-001 — Android gradle build fails: `package app.eliza does not exist` (S0) — RESOLVED
- **Root cause:** Java source overlay in `run-mobile-build.mjs:1275-1296` rewrote `package ai.elizaos.app;` → `package ${androidPackage};` but didn't rewrite the matching `import app.eliza.{BuildConfig,R};`. With Milady's namespace = `ai.milady.milady`, BuildConfig/R are emitted under `ai.milady.milady` so the eager `app.eliza.*` imports break compilation.
- **Fix:** added `code.replaceAll(/\bimport\s+app\.eliza\.(BuildConfig|R)\s*;/g, ...)` to overlay loop. Also fixed `cloudSafeMainActivityJava` template at line 2997.

### IOS-BUILD-001 — `pod install` crashed on cocoapods 1.16.2 `Pod::Config#installation_root` (S0) — RESOLVED
- **Root cause:** cocoapods 1.16.2 crashes when the shell locale is not UTF-8.
- **Fix:** `eliza/packages/app-core/scripts/run-mobile-build.mjs:3253-3271` — force `LANG`/`LC_ALL` to `en_US.UTF-8` in the spawned pod env. Verified `pod install` succeeds (17 dependencies installed).

### MILADY_DEFAULT_THEME dead import re-introduced (S0) — RESOLVED
- **Symptom:** Vite build failed: `"MILADY_DEFAULT_THEME" is not exported by "@elizaos/shared"`. The previous QA pass deleted this import but it came back.
- **Fix:** re-removed import + theme assignment in `apps/app/src/main.tsx:17, 204`.

### W-013 — Production RuntimeGate chooser below the fold on first run (S1)
- **Surface:** Web production build at :4173 (1440×900 viewport). Splash takes full viewport; chooser at y=1081-1209.
- **Status:** agent in flight.

### W-016 — Dev runtime stuck in `runtime-bootstrap`, then API drops entirely (S0)
- **Source:** `eliza/packages/agent/src/runtime/eliza.ts` (failing import); `RuntimeGate.tsx` (gate).
- **Repro:** `GET /api/status` returns `state: "starting", phase: "runtime-bootstrap", attempt: 8` indefinitely. UI flips to "AGENT TIMEOUT — HTTP 502" after API drops.
- **Why S0:** every deep web tab unreachable in live runtime. No "continue anyway" escape hatch.
- **Recommended fix:** root-cause the `@elizaos/app-core/dist/index.js` missing-module error. Likely chains off W-INFRA-002/003. Dev orchestrator should detect and force rebuild instead of looping forever.

### AND-012 — Tapping "USE LOCAL →" leaves Android stuck on splash for 20+ seconds (S0)
- **Where:** Welcome → "I want to run it myself" → "USE LOCAL →"
- **Fix:** any operation > 1.5s needs a progress indicator. Replace static splash with "Setting up local runtime…" overlay showing step counts.

---

## iOS — iPhone 17 Pro Simulator, iOS 26.4, cloud-hybrid runtime mode

### iOS-001 — Mobile bottom tab bar icons unlabeled (S1) — FIXED
- **Source:** `eliza/packages/ui/src/components/shell/Header.tsx:72-75, 481-526`
- **Fix:** added labels under every icon. `MOBILE_BOTTOM_NAV_BUTTON_CLASSNAME` height `h-11 max-w-12` → `h-14 max-w-16`; flex `flex-col gap-0.5 py-1`. Test id `header-mobile-bottom-nav-label-<tab>`.

### iOS-002 — Two near-identical sidebar toggles in chat header (S1)
- **Fix:** distinct icons or drop the right toggle on phones.

### iOS-003 — Local model download card confusing, no progress bar (S1) — PARTIALLY FIXED
- **Source:** `MessageContent.tsx:1119-1163` (card); `ios-local-agent-kernel.ts:1921-1953` (text); `formatGb` at `:1820-1822` (number formatter).
- **Fixed:** `formatGb` now returns `"0.0 GB"` (space) instead of `"0.0GB"`.
- **Remaining:** add visible progress bar, ETA, "Switch to cloud" link; collapse three rotating templates into one.

### iOS-004 — Empty content area while download blocks usage (S2)

### iOS-005 — Status bar leading "...." is sim cellular placeholder (S3) — no fix needed.

### iOS-006 — Apps tab gradient cards have no descriptions or icons (S1)

### iOS-007 — Apps tab card shows app name twice (S2) — FIXED
- **Source:** `eliza/packages/shared/src/app-hero-art.ts:362-411`
- **Fix:** removed `<text x="80" y="816">${safeTitle}</text>` from generated hero SVG.

### iOS-008 — Character tab cards have arrow chevrons but no tap affordance (S2)

### iOS-009 — Wallet tab number letter-spacing too wide (`$ 81 , 410`) (S1)

### iOS-010 — Wallet tab empty state has no Connect/Create CTA (S1)

### iOS-011 — Browser tab empty state has competing actions (S2)

### iOS-012 — Settings tab Name field empty with no helper text (S1)

### iOS-013 — Settings tab Voice picker speaker icon ambiguous (S2)

### iOS-014 — Settings tab no save/apply pattern visible (S3)

---

## Android — Pixel_API_35 AVD, debug APK

### AND-SPLASH-001 — Two visually different splashes stacked (S2)
- Initial small salute on light-grey, then tall elegant character on cream + arcane overlays.
- **Fix:** unify; match background to dark onboarding bg.

### AND-001 — "ELIZAOS" all-caps via CSS (S2) — FIXED
- **Source:** `RuntimeGate.tsx:2057-2064`
- **Fix:** dropped `uppercase` from welcome eyebrow class so `"elizaOS — immersion agent runtime"` renders as authored.

### AND-002 — "Hosted by us" ambiguous (S2) — FIXED
- **Source:** `RuntimeGate.tsx:2081-2084`
- **Fix:** → `"Your personal AI, hosted on Eliza Cloud — ready in seconds."`

### AND-003 — "I WANT TO RUN IT MYSELF" combative all-caps (S1)
- **Fix:** `Run it myself` sentence-case with underline + chevron.

### AND-004 — Disclosure expansion adds 4 visual header layers per card (S2)

### AND-005 — Dark-mode toggle moon icon while app is dark (S2) — FIXED
- **Source:** `eliza/packages/ui/src/components/shared/ThemeToggle.tsx:40-51`
- **Fix:** swapped icons + made aria-label action-oriented. Shows `<Sun>` when dark (tap → light), `<Moon>` when light (tap → dark).

### AND-006 — Sign-in screen repeats "Sign in to Eliza Cloud" 3× (S2) — FIXED
- **Source:** `RuntimeGate.tsx:1447-1456` — removed redundant yellow eyebrow.

### AND-007 — Sign-in subtitle vague (S2) — FIXED
- **Source:** `RuntimeGate.tsx:1428-1435`
- **Fix:** → `"We'll provision a hosted agent and keep it running. Free trial; pay for what you use."`

### AND-008 — `Use local embeddings` checkbox no inline explanation (S1) — FIXED
- **Source:** `RuntimeGate.tsx:2287-2322`
- **Fix:** vertical `flex-col` with caption `"Generate semantic search locally on this device. Slower first run; private."`

### AND-009 — Yellow used for both CTA and non-interactive label (S1) — resolved by AND-006.

### AND-010 — `← BACK` web-link styling (S2) — FIXED
- **Source:** `RuntimeGate.tsx:2263-2283`
- **Fix:** dropped MONO_FONT, uppercase, tracking, underline, `←` glyph. Now `<ChevronLeft />` + sentence-case "Back".

### AND-011 — Dark mode toggle (broader issue) — resolved by AND-005.

### AND-012 — "USE LOCAL →" splash-stuck (S0) — see P0 above.

### AND-013 — Welcome screen monospace + tracking dense (S3)

---

## Web (browser)

### W-001 — Boot splash beautiful (S3) — keep.
### W-002 — Secondary loading state jarring (S2)
### W-003 — Chat input placeholder grammar (S1) — FIXED
- **Source:** `eliza/packages/ui/src/i18n/locales/en.json:499`
- **Fix:** `"Setup Provider To Chat"` → `"Set up an LLM provider in Settings to start chatting"`. Non-English locales need re-translation.

### W-004 — Apps page mixes user-facing and developer tools (S1)
### W-005 — Apps page cards no descriptions/icons (S1)
### W-006 — Apps page right-rail copy too long (S2) — FIXED
- **Source:** `eliza/packages/ui/src/components/pages/page-scoped-conversations.ts:135-137`
- **Fix:** shortened to one-line ask-me-anything.

### W-007 — Apps page Message input + Clear orphaned (S2)
### W-008 — Character page Personality card test-agent bio (S3)
### W-009 — Character page nav duplicated (S2)
### W-010 — Wallet renders nothing (S0) — likely chain of W-016; re-test after fix.
### W-011 — Top-right unlabeled icons (S2)
### W-012 — `/api/vincent/status → 404` on every load (S2)

### W-016 — Runtime gate hung (see P0).

### W-017 — Skills tab hardcodes `binance` filter + 6-id allowlist (S2)
- **Source:** `SkillsView.tsx:75-77, 91-92, 724-731`

### W-018 — TrajectoriesView hardcodes RGB colors + " tokens" suffix (S2)
- **Source:** `TrajectoriesView.tsx:40-53, 481, 487`

### W-019 — MemoryViewerView hardcodes labels and relative-time (S2)
- **Source:** `MemoryViewerView.tsx:35-40, 63-66, 82-89`

### W-020 — LogsView shadows `t` translator inside tag map (S2)
- **Source:** `LogsView.tsx:290-319`

### W-021 — DatabaseView swallows status fetch errors (S2)
- **Source:** `DatabaseView.tsx:69-77` — `try {} catch { return null }` violates AGENTS.md no-swallowing rule.

### W-022 — RuntimeView hardcodes `sectionMeta` English (S2)
- **Source:** `RuntimeView.tsx:428-460`

### W-023 — AutomationsFeed empty state hardcoded English (S2)
- **Source:** `AutomationsFeed.tsx:361-371`

### W-024 — StreamView translation keys truncated, missing `defaultValue` (S2)
- **Source:** `StreamView.tsx:119-132` — keys like `streamview.StreamingUnavailabl` (missing `e`), `streamview.CouldNotRea`, `streamview.IfThePluginIsAlr` all cut off.

### W-025 — Companion tab legacy redirect but still in nav-construction (S2)
- **Source:** `App.tsx:518-520`

### W-026 — Phone / Messages / Contacts silently fall back to ChatView on web (S2)
- **Source:** `App.tsx:486-509`

### W-027 — Fine-Tuning (TrainingDashboard) bypasses i18n and theme tokens (S1)
- **Source:** `TrainingDashboard.tsx:43-377` — hardcoded English; raw `text-green-500`/`text-red-500` instead of `text-ok`/`text-danger`.

### W-028 — Cross-cutting: many tabs trigger extra `loadX()` on every mount (S3 perf)

### W-029 — Runtime gate offers no "continue without runtime" escape hatch (S2)

---

## Code-health observations

### L-QUALITY-001 — Five LifeOps components exceed 1500 lines each (S1)
- `BrowserBridgeSetupPanel.tsx` (2191), `LifeOpsWorkspaceView.tsx` (2004), `MessagingConnectorCards.tsx` (1684), `LifeOpsSettingsSection.tsx` (1657), `LifeOpsRemindersSection.tsx` (1650).

---

## Implemented fixes during this pass (cumulative)

1. iOS-003 part 2 — `formatGb` adds space → `"0.0 GB"`. (`ios-local-agent-kernel.ts:1820`)
2. W-003 — chat input placeholder grammar. (`en.json:499`)
3. iOS-001 — mobile bottom-nav labels. (`Header.tsx:72-75, 481-526`)
4. AND-001 — drop CSS uppercase on welcome eyebrow. (`RuntimeGate.tsx:2057-2064`)
5. AND-002 — welcome subtitle ambiguity. (`RuntimeGate.tsx:2081-2084`)
6. AND-006 — sign-in eyebrow dedup. (`RuntimeGate.tsx:1447-1456`)
7. AND-007 — sign-in subtitle concrete. (`RuntimeGate.tsx:1428-1435`)
8. W-006 — Apps chat body shortened. (`page-scoped-conversations.ts:135-137`)
9. AND-005 — ThemeToggle icon + aria-label. (`ThemeToggle.tsx:40-51`)
10. iOS-007 — apps card name dedup (SVG). (`app-hero-art.ts:362-411`)
11. AND-008 — Use local embeddings inline help. (`RuntimeGate.tsx:2287-2322`)
12. AND-010 — Back link → native chevron. (`RuntimeGate.tsx:2263-2283`)
13. W-INFRA-001 — Vite HMR loop fixed. (`apps/app/vite.config.ts`)
14. W-INFRA-002 — node:sqlite stale dist; rebuilt app-core.
15. W-INFRA-005 — embedding model filename validator. (`embedding-manager-support.ts:217-235`)
16. AND-BUILD-001 — Android Java `app.eliza.*` imports → `${androidPackage}.*`. (`run-mobile-build.mjs:1275-1296, 2997`)
17. IOS-BUILD-001 — pod install LANG/LC_ALL force-UTF-8. (`run-mobile-build.mjs:3253-3271`)
18. MILADY_DEFAULT_THEME dead import — re-removed. (`apps/app/src/main.tsx:17, 204`)

### Verification

- `bun run --cwd eliza/packages/ui typecheck` — exit 0
- `bun run --cwd eliza/packages/shared typecheck` — exit 0
- `bun run --cwd eliza/packages/app-core typecheck` — exit 0
- `bun run --cwd eliza/packages/app-core build` — exit 0; rebuilt dist has lazy `requireFromHere("node:sqlite")`
- `bun run --cwd apps/app build:web` — exit 0
- `bun run dev` — starts clean, no `node:sqlite` error
- iOS `pod install` — clean with UTF-8 locale forced

## V-CAVEAT — verification deferred

- **iOS sim visual** — pending fresh `bun run build:ios` to reach the simulator with the latest fixes.
- **Android emulator visual** — pending fresh `bun run build:android` rebuild with the Java overlay fix.

## Next-pass priorities

1. W-016 — root-cause runtime-bootstrap loop on `@elizaos/app-core/dist/index.js`.
2. AND-012 — capture logcat during local-runtime init.
3. W-013 — anchor production chooser above fold (agent in flight).
4. L-QUALITY-001 — split 5× 1500+ line LifeOps components.
5. Remaining iOS-002, iOS-006, iOS-009–014; AND-003, AND-004; W-002, W-004, W-005, W-007, W-009, W-011, W-012, W-017–W-029.
