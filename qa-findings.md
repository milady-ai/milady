# QA Findings — 2026-06-01 smoke pass

Scope: apps (`apps/app` desktop + Electrobun, `apps/homepage`, `eliza/packages/cloud-frontend`) + 8 messaging connectors. Depth: automated suites + manual smoke.

Branch: `qa/2am-2026-06-01` off `develop` at commit `765e547d4` ("chore: remove obsolete voice shims").

---

## Phase 0 — Clean state

| Step | Status | Notes |
|------|--------|-------|
| Discard dirty files (`bun.lock`, `scripts/lib/install-env.test.ts`) | ✅ | Working tree clean |
| Fresh pull on `develop` | ✅ | Fast-forwarded 83 commits to `765e547d4` |
| `bun install` | ✅ | 1739 installs across 1959 packages, all patches applied or already-applied. Exit 0. |
| Create `.env` with `ANTHROPIC_API_KEY` | ✅ | `.env` confirmed gitignored (line 7 of `.gitignore`) |
| `bun run doctor` | ❌ **Finding #1** | See below |

### Finding #1 — `bun run doctor` fails with `Module not found "eliza.mjs"`

- **Command:** `bun run doctor` (alias of `bun run milady:doctor`)
- **What happens:** `tsdown` build phase succeeds (rebuilds `dist/entry.js`, `dist/eliza.js`, `dist/server.js`, `dist/index.js`, and 20 chunks totalling 7.6 MB). Then the doctor script invocation fails:
  ```
  error: Module not found "eliza.mjs"
  error: script "milady:doctor" exited with code 1
  error: script "doctor" exited with code 1
  ```
- **Invocation chain:** `package.json` → `bun run milady:doctor` → `node scripts/run-eliza-app-core-script.mjs run-node.mjs doctor`. The `run-node.mjs doctor` step is what resolves to `eliza.mjs`, which is missing.
- **Severity:** medium. Build artifacts produced successfully, so deps and patches are healthy. The doctor subcommand alone is broken, which blocks anyone using it as the documented "is my setup OK?" check.
- **Repro:** clean clone, `bun install`, `bun run doctor`.

---

## Phase 1 — Automated test sweep

| Step | Status | Time | Notes |
|------|--------|------|-------|
| 1.1 `bun run verify:typecheck` | ❌ **Finding #2** | ~5–7 min | Root workspace typecheck passed. `apps/app` typecheck failed (see below). |
| 1.2 `bun run verify:lint` | ✅ | 5s | All Biome checks passed: submodule contract, repo (37+40+40+9+16+40+40+38+12 files), apps/app (81), apps/homepage (81). Zero fixes needed. |
| 1.3 `bun run test` | ❌ **Findings #3, #4, #5** | ~70s | 207 passed, 3 failed, 1 skipped across 31 test files. Two files affected: `scripts/release-workflow-contract.test.mjs` (1 fail) and `scripts/standalone-eliza-package-contract.test.ts` (2 fails). |
| 1.4 `bun run test:e2e` | ⚠ **Finding #6** | <1s | Exit 0 but "No test files found, exiting with code 0" — false-green. |
| 1.5 `bun run verify:secrets` | ✅ | ~10 min | Eventually completed exit 0. Slow (no output during scan) but clean. |

### Finding #6 — `bun run test:e2e` finds no test files (false-green) — REVISED with deeper analysis

- **Command:** `bun run test:e2e` → `bunx vitest run --config eliza/packages/app-core/vitest.e2e.config.ts --passWithNoTests --exclude ...`
- **Behavior:** prints `No test files found, exiting with code 0` and reports success.
- **Initial cause (surface):** the include pattern in [eliza/packages/app-core/vitest.e2e.config.ts](eliza/packages/app-core/vitest.e2e.config.ts) is `src/**/*.e2e.test.ts`, but no e2e tests live under `src/` — they live under `test/`.
- **Deeper analysis (discovered while attempting the fix):**
  1. The file [eliza/packages/app-core/vitest.e2e.config.ts](eliza/packages/app-core/vitest.e2e.config.ts) is **inside the gitignored `eliza/` tree** in this repo — so any fix made here is local-only and wouldn't propagate. The real fix must land in upstream `github.com/elizaOS/eliza`.
  2. **All 4 e2e tests in `eliza/packages/app-core/test/app/`** are `.live.` or `.real.` variants. None are "plain" e2e tests. Expanding the include to `test/app/**` picks them up, but the package.json file-specific `--exclude` flags have partial-match behavior — some files get excluded, others (like `streaming-visible-text.live.e2e.test.ts`) slip through.
  3. **Many plugin packages have plain `.e2e.test.ts` files** that are entirely outside this config's reach: e.g., `plugin-lifeops/test/booking-preferences.e2e.test.ts`, `plugin-lifeops/test/relationships.e2e.test.ts`, `plugin-computeruse/test/computeruse-cross-platform.e2e.test.ts`, `plugin-vision/test/vision-cross-platform.e2e.test.ts`. These never run via `bun run test:e2e`.
  4. The naming convention documented in [eliza/packages/test/vitest/default.config.ts](eliza/packages/test/vitest/default.config.ts) header (`*.live.e2e.test.ts` for live, `*.real.e2e.test.ts` for "real infra") is **not strictly followed** by the package.json `test:e2e` command, which uses file-specific excludes rather than pattern-based ones.
- **Effect:** `bun run test:e2e` runs **zero tests** and passes. CI gets no e2e coverage from this command. Plenty of plain e2e tests exist in plugin packages but are unreachable through this config.
- **Severity:** **high.** Silent CI hole.
- **Why I'm not landing a fix here:**
  - Config lives upstream in elizaOS/eliza — Milady fork would diverge from main.
  - Need maintainer judgment: should `test:e2e` cover plugin tests too? Which `.real.` files belong in the default suite vs. on-demand? Pattern-based exclude (e.g. `**/*.live.e2e.test.ts`) vs. file-specific?
- **Recommended fix path** (for whoever owns the upstream config):
  1. Decide naming convention enforcement: pattern-level exclude `**/*.live.e2e.test.{ts,tsx}` for non-default suite.
  2. Expand `include` in `vitest.e2e.config.ts` to: `src/**/*.e2e.test.{ts,tsx}`, `test/app/**/*.e2e.test.{ts,tsx}`, AND somehow reach plugin e2e tests (workspace-aware glob, or per-plugin configs aggregated by a runner).
  3. Audit which `.real.` files belong in default `test:e2e` (some need test-env setup; others need real APIs).
  4. Optionally drop `--passWithNoTests` so a 0-file run fails loudly until the include is fixed.

### Finding #2 — apps/app typecheck: missing `@elizaos/plugin-task-coordinator/register`

- **File:** [apps/app/src/main.tsx:97](apps/app/src/main.tsx#L97)
- **Error:** `TS2882: Cannot find module or type declarations for side-effect import of '@elizaos/plugin-task-coordinator/register'.`
- **Cause:** `apps/app/src/main.tsx` imports `@elizaos/plugin-task-coordinator/register` as a side-effect. Either the plugin isn't installed, or it doesn't expose a `/register` subpath in its `package.json` exports.
- **Severity:** medium-high. Blocks `bun run verify` and CI typecheck. Root workspace typecheck passes — only `apps/app` is affected.

### Finding #3 — release-workflow-contract.test.mjs: BUN_VERSION drift

- **Test:** `scripts/release-workflow-contract.test.mjs:800` — "Electrobun release has a lightweight PR contract workflow"
- **Failure:** assertion `match(workflowText, /BUN_VERSION: "1\.3\.13"/)` failed; actual workflow file has `BUN_VERSION: "1.3.14"`.
- **Cause:** The workflow `.github/workflows/test-electrobun-release.yml` was bumped from `1.3.13` → `1.3.14`, but `scripts/release-workflow-contract.test.mjs:800` still expects `1.3.13`. Contract test was not updated alongside the version bump.
- **Severity:** low (stale-test). Fix: update the regex to `1.3.14` (or whichever is current).

### Finding #4 — standalone-eliza-package-contract.test.ts: root tsconfig references `./eliza/` paths in packages mode

- **Test:** `scripts/standalone-eliza-package-contract.test.ts` — "root tsconfig.json is packages-mode-clean by default"
- **Failure:** `AssertionError: root tsconfig.json must not reference ./eliza/ paths in packages mode`
- **Cause:** The checked-in `tsconfig.json` has `paths` and `include` entries pointing into `./eliza/packages/*/src/*` and `./eliza/plugins/*/src/*`. In `packages` (default) mode this is forbidden — only the installed package paths should resolve. Looks like a `local`-mode tsconfig accidentally got committed, or the source-mode switcher isn't restoring `packages` mode on `eliza:packages`.
- **Severity:** medium. Breaks the contract guarantee that fresh clones default to `packages` mode. Would also mask real type errors when developing without `./eliza/` cloned.

### Finding #5 — standalone-eliza-package-contract.test.ts: checked-in tsconfig diverges from packages-mode template

- **Test:** `scripts/standalone-eliza-package-contract.test.ts` — "checked-in tsconfig.json matches the packages-mode template"
- **Same root cause as #4.** Diff shows the checked-in `tsconfig.json` has extra `./eliza/...` paths and includes/excludes vs. the canonical `scripts/templates/tsconfig.packages-mode.json`.
- **Fix path:** run `bun run eliza:packages` (or `bun run workspace:restore-refs`) to restore the packages-mode tsconfig, then commit the diff. Investigate why it drifted.

---

## Phase 2 — App smoke tests

_(pending)_

### 2.1 apps/app (web + Electrobun) — ❌ BLOCKED by Finding #7

- **Command:** `bun run dev`
- **Behavior:** dev orchestrator boots, prints `[milady] Waiting for API server...`, repeatedly crashes the API child process. After 6 crashes in 10s the orchestrator gives up: `[milady] API exited with code 1 6 times in 10s — giving up. Fix the underlying issue and restart the dev process.`
- **Effect:** entire desktop+web smoke checklist (onboarding / VRM / chat / settings / console / stack-status) cannot be executed against `develop` HEAD on Windows.

### Finding #7 — apps/app dev cannot boot: `@elizaos/plugin-remote-manifest` dist never built

- **Failing import chain:**
  [eliza/packages/plugin-worker-runtime/src/dispatch.ts:23](eliza/packages/plugin-worker-runtime/src/dispatch.ts#L23) → `@elizaos/plugin-remote-manifest/rpc-mac`
- **Error:**
  ```
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module
  'A:\…\eliza\packages\plugin-worker-runtime\node_modules\@elizaos\plugin-remote-manifest\dist\rpc-mac.js'
  imported from .\eliza\packages\plugin-worker-runtime\src\dispatch.ts
  ```
- **REVISED ROOT CAUSE (was wrong initially):**
  - `rpc-mac.ts` is **Message Authentication Code (HMAC for SOC2 A-4)**, **not** macOS. Has zero platform-specific logic. The name misled the initial diagnosis.
  - `@elizaos/plugin-remote-manifest` is a `"private": true` workspace package that is NOT on npm. Its `package.json` declares `"./rpc-mac"` as an export resolving to `./dist/rpc-mac.js`, but `dist/` is **empty** in this repo.
  - The package's build (`tsc -p tsconfig.build.json`) is never triggered by any of the install scripts. Trying to run it manually also fails because its own workspace dep `@elizaos/security` is similarly unbuilt — there's a whole **chain** of unbuilt workspace packages.
- **Platform impact:** universal (not Windows-only as initially thought). Mac/Linux would hit the same `ERR_MODULE_NOT_FOUND`.
- **Severity:** **high.** Blocks all local dev of `apps/app` everywhere.
- **Fix path — significantly larger than initially scoped:**
  - Option A: Add a workspace-build step to `scripts/milady-postinstall-repo-setup.mjs` that builds `@elizaos/security` → `@elizaos/plugin-remote-manifest` → any consumers, in dependency order.
  - Option B: Change consumers to import from `src/*.ts` directly and rely on the tsx loader (works in dev, may break production bundling).
  - Option C: Have the build of the eliza/ workspace happen as part of `setup-upstreams.mjs` or `eliza:packages`.
  - Owner: someone with context on the eliza workspace build orchestration — this is a build-pipeline change, not a one-line fix.
- **Repro:** clean clone on any platform, `bun install`, `bun run dev`.
- **Tried `bun run eliza:local` as a workaround (2026-06-01):** local mode also fails to boot, but with a DIFFERENT error: native plugin builds invoke `rollup`, which is aliased in [eliza/package.json](eliza/package.json) via `"rollup": "npm:@rollup/wasm-node@4.60.3"`. Bun installs the package but does NOT create a `rollup` bin shim in the workspace `.bin/` directory — a known quirk with npm-aliased packages whose alias name differs from the resolved package name. Every native plugin's `bun run build` then fails with `bun: command not found: rollup`. So both source modes fail apps/app dev for different reasons. Documented as Finding #10.

### Finding #10 — `rollup` bin shim missing in eliza/ local-mode install

- **Trigger:** `bun run eliza:local --install`, then `bun run dev`. The native-plugin builder ([eliza/packages/app-core/scripts/build-native-plugins.mjs](eliza/packages/app-core/scripts/build-native-plugins.mjs)) iterates plugins under `eliza/packages/native/plugins/` and runs each plugin's `bun run build`, which is typically `bun run clean && tsc && rollup -c rollup.config.mjs`.
- **Symptom:** every plugin fails with `bun: command not found: rollup`, dev script aborts.
- **Cause:** [eliza/package.json](eliza/package.json) declares `"rollup": "npm:@rollup/wasm-node@4.60.3"`. Bun installs the package into its content-addressable store but does not create the `rollup` bin shim in `eliza/`'s install directory. Bun appears to not link bin entries when the alias name differs from the resolved package name.
- **Workarounds tried (none worked):**
  - Re-running `bun install` inside `eliza/` (no change — still no shim).
  - Manual bin shim creation deferred (Bun's `.bunx` shim format is a binary blob, not easy to hand-author).
- **Suggested fix:** drop the npm: alias and use plain `"rollup": "^4.60.3"` (the official `rollup` package on npm has the same name as the bin), OR add an explicit shim-link step in postinstall, OR file an upstream bun bug.
- **Severity:** **high.** Blocks local mode = blocks the only documented workaround for #7.

### 2.2 apps/homepage — ✅ GREEN

| Check | Result |
|-------|--------|
| `bun run dev:web` boots | ✅ Vite ready in 153.7s, served on `http://localhost:2139/` (auto-shifted from 2138 because apps/app took it) |
| HTTP root responds | ✅ 200, HTML 1944 bytes, title `Milady | Local-First Control` |
| `bun run --cwd apps/homepage test` | ✅ 27 tests / 9 files pass in 70s |
| `bun run --cwd apps/homepage test:e2e` | ✅ 42 tests pass in 1.9m (run after installing Chromium per #8) |

No homepage findings.

### 2.3 eliza/packages/cloud-frontend visual audit

Initial run: ❌ all 112 routes failed because Playwright Chromium wasn't installed (see Finding #8). After installing Chromium via `bun x playwright install chromium`, re-ran successfully.

**Retry result: 94 passed / 18 failed in 4.2 min.** All 18 failures were `page.goto: Timeout 60000ms exceeded` against only **2 unique routes** (× 2 viewports × retry attempts):

- `landing` (desktop + mobile) — main marketing route doesn't respond within 60s in the preview server
- `dashboard-billing-success` (desktop + mobile) — billing success page hangs

Output artifacts produced (committed under `aesthetic-audit-output/`):
- `desktop/` — 98 PNGs (rest + hover for 49 routes)
- `mobile/` — 65 PNGs (rest + hover for 32 routes that have it, rest only for others)
- `manual-review/` — 56 stub markdown files (one per route)
- `contact-sheet.html`, `report.json`, `LOOP_1_TRIAGE.md`

### Finding #9 — cloud-frontend `landing` and `dashboard-billing-success` time out under audit

- **Audit spec:** [eliza/packages/cloud-frontend/tests/e2e/aesthetic-audit.spec.ts:833](eliza/packages/cloud-frontend/tests/e2e/aesthetic-audit.spec.ts#L833)
- **Behavior:** `page.goto(<route>)` exceeds the 60s default timeout for these two routes only. All other 51 routes load fine.
- **Severity:** medium. The fact that **landing** — the public marketing root of the cloud dashboard — won't even load under a headless Vite preview is a regression worth investigating. `dashboard-billing-success` may legitimately depend on a session/token that the audit fixture doesn't provide, but landing should be entirely public.
- **Likely cause hypothesis:** these routes either pull external resources (CDN, fonts, analytics) that block document-ready, or have a synchronous hang in their JS entry. Inspect with `npx playwright show-trace test-results/aesthetic-audit-…-landing*/trace.zip`.

### Finding #8 — `audit:cloud` doesn't ensure Playwright browsers are installed

- **Command:** `bun run --cwd eliza/packages/cloud-frontend audit:cloud`
- **Initial failure:** every one of 112 test cases failed at `browserType.launch`:
  ```
  Error: browserType.launch: Executable doesn't exist at
  C:\Users\…\ms-playwright\chromium_headless_shell-1223\chrome-headless-shell-win64\chrome-headless-shell.exe
  ```
- **Workaround:** run `bun x playwright install chromium` once. Downloads ~294 MB (Chrome 148 + headless shell). After that the audit boots browsers normally.
- **Cause:** the `audit:cloud` script does not include a `playwright install` step. The pre-tests-run hook is missing.
- **Severity:** medium. Blocks any first-time contributor from running the documented visual audit. Easy fix: add `playwright install --with-deps chromium` to the script preface, or document it as a one-time prereq in [eliza/packages/cloud-frontend/AGENTS.md](eliza/packages/cloud-frontend/AGENTS.md).
- **Output state from first run:** `aesthetic-audit-output/manual-review/` (56 stub `.md` files) was generated. `desktop/` and `mobile/` screenshot dirs are empty.

---

## Phase 3 — Connector verification

All 8 messaging connector test suites passed on `develop` HEAD.

| Connector | Test status | Time | Notes |
|-----------|-------------|------|-------|
| Discord | ✅ | 81s | `vitest run` |
| Telegram | ✅ | 16s | `vitest run` |
| WhatsApp | ✅ | 114s | `vitest run --config ./vitest.config.ts` |
| Signal | ✅ | 24s | `vitest run` |
| WeChat | ✅ | 2s | `vitest run --config ./vitest.config.ts` (note: very fast — verify test file count) |
| iMessage | ⚠ partial | 8s | Unit test green (`vitest run --config vitest.config.ts`), but **live send/receive verification requires macOS + BlueBubbles** — not testable from this Windows host. Mark as code-only verified. |
| Bluesky | ✅ | 40s | `vitest run` |
| Farcaster | ✅ | 39s | `npx -y vitest@4.0.18 run` (note: pinned to vitest 4.0.18 vs. repo's 4.1.6 — possible mismatch worth checking) |

**Plugin-load verification** (probe `/api/agents` for registered plugins while `bun run dev` is up): ⚠ **BLOCKED by Finding #7**. Can't boot apps/app dev, so can't inspect plugin registry at runtime. Code-level imports look intact (connector tests run, which exercise plugin module loading).

### Sub-findings worth noting (not blocking)

- **plugin-wechat tests in 2s** — extremely fast vs. the others. Could indicate an empty test file or all tests skipped. Worth manual inspection.
- **plugin-farcaster pins vitest@4.0.18** in its `test` script while the rest of the repo uses 4.1.6. Inconsistent versioning; would not block CI but is a maintenance smell.

---

## Summary

**Overall verdict:** `develop` HEAD (`765e547d4`) is **partially broken on Windows**. Marketing site and connector test suites are healthy. The core desktop/web app cannot boot. CI contract tests have drifted from the artifacts they protect. The documented visual audit is missing a setup step.

### Per-surface verdict

| Surface | Verdict | Notes |
|---------|---------|-------|
| apps/app (web + Electrobun desktop) | ❌ **broken** | Cannot boot dev server (#7). Smoke checklist 0% executed. |
| apps/homepage | ✅ **good** | Unit tests + Playwright e2e both green. Server serves 200. |
| eliza/packages/cloud-frontend visual audit | ⚠ **mostly good** | 94/112 pass after Chromium install (#8). 2 routes (`landing`, `dashboard-billing-success`) timeout (#9). |
| 8 messaging connectors | ✅ **good (all 8/8 green)** | plugin-wechat finishes suspiciously fast (2s) — verify test coverage. |
| Plugin-load runtime check | ⚠ unable | Blocked by #7. |
| Automated test suites | ⚠ mixed | Lint green; typecheck broken (#2); 3 unit-test failures (#3, #4, #5); test:e2e silently runs nothing (#6); verify:secrets eventually green. |

### Finding inventory (10 total)

| # | Surface | Severity | One-line |
|---|---------|----------|----------|
| 1 | doctor | medium | `bun run doctor` fails: `Module not found "eliza.mjs"` |
| 2 | typecheck | medium-high | apps/app/src/main.tsx imports `@elizaos/plugin-task-coordinator/register` which has no types/exports |
| 3 | unit test | low | `release-workflow-contract.test.mjs:800` expects BUN_VERSION 1.3.13, workflow file has 1.3.14 |
| 4 | unit test | medium | `standalone-eliza-package-contract.test.ts` — root tsconfig has `./eliza/` paths in packages mode |
| 5 | unit test | medium | Same root cause as #4 — checked-in tsconfig diverges from packages-mode template |
| 6 | e2e | **high** | `bun run test:e2e` runs zero tests but exits 0 (false-green CI gate) |
| 7 | dev server | **high** | apps/app dev cannot boot in packages mode — `plugin-remote-manifest` workspace package never built |
| 8 | audit | medium | `audit:cloud` script doesn't install Playwright browsers — first-time runs always fail |
| 9 | cloud UI | medium | `landing` and `dashboard-billing-success` routes timeout under audit |
| 10 | dev server (local mode) | **high** | apps/app dev fails in `eliza:local` mode — native plugin builds need `rollup` but bin shim isn't created for the npm-aliased `@rollup/wasm-node` package |

### Suggested triage order (severity × blast radius)

1. **#7** apps/app Windows boot — blocks every Windows developer. Quick fix: gate the `rpc-mac.js` import behind `process.platform === "darwin"`.
2. **#6** test:e2e false-green — silent CI gap; fix `include` pattern in `vitest.e2e.config.ts` to also match `test/**/*.e2e.test.ts`.
3. **#2** apps/app typecheck — blocks `bun run verify`. Either install `@elizaos/plugin-task-coordinator` or remove the unused side-effect import.
4. **#4 / #5** tsconfig drift — restore packages-mode tsconfig; investigate why local-mode tsconfig got committed.
5. **#9** cloud-frontend landing timeout — investigate. Public marketing root must load.
6. **#1** doctor — fix the missing `eliza.mjs` resolution in `run-node.mjs doctor`.
7. **#8** audit:cloud chromium prereq — one-line fix to install browsers as part of audit script.
8. **#3** stale BUN_VERSION regex — one-character fix.

### Out of scope for this pass (documented, not executed)

- Live messaging platform end-to-end for connectors (requires real platform credentials).
- Heavy e2e (`test:e2e:heavy`, `smoke:lifeops`, `smoke:api-status`).
- Packaged desktop smoke (`test:desktop:packaged:windows`) — not run; #7 makes packaged-app smoke moot until dev boots.
- Mobile (iOS/Android via Capacitor).
- The visual audit's 5-loop manual-review protocol — only 1 loop run, no per-page verdicts written into `manual-review/*.md` stubs (out of scope at smoke depth).

### Cannot be tested from this Windows host (need macOS to verify)

- **plugin-imessage live send/receive** — needs Mac + BlueBubbles. Code-level test passes; runtime can't be confirmed.
- **macOS-side regression check for Finding #7 fix** — gating the `rpc-mac.js` import would need a Mac runner to confirm apps/app still boots there.
- **Anything else macOS-platform-conditional** (Apple Notes / Apple Reminders / Things-mac / camsnap / imsg skills, macOS-only signing & notarization in the release pipeline) — flagged here as a category, not enumerated; hand off to a Mac runner.

