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
| 1.5 `bun run verify:secrets` | ⚠ inconclusive | >5 min hung | Script `check-secret-hygiene.mjs` produced no output, no exit. Suspected hang. Not blocking. |

### Finding #6 — `bun run test:e2e` finds no test files (false-green)

- **Command:** `bun run test:e2e` → `bunx vitest run --config eliza/packages/app-core/vitest.e2e.config.ts --passWithNoTests --exclude ...`
- **Behavior:** prints `No test files found, exiting with code 0` and reports success.
- **Cause:** [eliza/packages/app-core/vitest.e2e.config.ts:24](eliza/packages/app-core/vitest.e2e.config.ts#L24) sets `include: ["src/**/*.e2e.test.ts", "src/**/*.e2e.test.tsx"]` (relative to the config dir = `eliza/packages/app-core/`). But the e2e tests in this repo live under `test/**` (e.g., `eliza/packages/app-core/test/app/*.real.e2e.test.ts`), not `src/**`. The `--exclude` paths in the package.json script all point at `test/**` files that wouldn't be matched by the include anyway.
- **Effect:** `bun run test:e2e` runs **zero tests** and passes. CI is not actually exercising any e2e suite from this command.
- **Severity:** high. This is a silent CI hole — anyone relying on `test:e2e` to gate merges is getting no e2e coverage from it.
- **Fix path:** add `test/**/*.e2e.test.ts` to the include pattern in `vitest.e2e.config.ts`, OR change the package.json script to point at `eliza/packages/app-core/test/...` paths explicitly.

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

### Finding #7 — apps/app dev cannot boot on Windows: `ERR_MODULE_NOT_FOUND` for `@elizaos/plugin-remote-manifest/dist/rpc-mac.js`

- **Failing import chain:**
  `eliza/packages/plugin-worker-runtime/src/dispatch.ts` → `@elizaos/plugin-remote-manifest/dist/rpc-mac.js`
- **Error:**
  ```
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module
  'A:\…\eliza\packages\plugin-worker-runtime\node_modules\@elizaos\plugin-remote-manifest\dist\rpc-mac.js'
  imported from .\eliza\packages\plugin-worker-runtime\src\dispatch.ts
  ```
- **Cause hypothesis:** `dispatch.ts` unconditionally imports `rpc-mac.js`, but `plugin-remote-manifest` only ships that file on macOS builds (or the build matrix forgot Windows). Should be a platform-conditional import.
- **Severity:** **high.** Blocks all local dev of `apps/app` on Windows. Same code path likely affects Linux. Only macOS would boot.
- **Repro:** clean clone on Windows, `bun install`, `bun run dev`.

### 2.2 apps/homepage — ✅ GREEN

| Check | Result |
|-------|--------|
| `bun run dev:web` boots | ✅ Vite ready in 153.7s, served on `http://localhost:2139/` (auto-shifted from 2138 because apps/app took it) |
| HTTP root responds | ✅ 200, HTML 1944 bytes, title `Milady | Local-First Control` |
| `bun run --cwd apps/homepage test` | ✅ 27 tests / 9 files pass in 70s |
| `bun run --cwd apps/homepage test:e2e` | ⏭ skipped (Playwright Chromium issue — see #8; will re-run if Phase 2.3 retry succeeds) |

No homepage findings.

### 2.3 eliza/packages/cloud-frontend visual audit

Initial run: ❌ all 112 routes failed because Playwright Chromium wasn't installed (see Finding #8). After installing Chromium via `bun x playwright install chromium`, re-running.

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
| iMessage | ✅ | 8s | `vitest run --config vitest.config.ts` |
| Bluesky | ✅ | 40s | `vitest run` |
| Farcaster | ✅ | 39s | `npx -y vitest@4.0.18 run` (note: pinned to vitest 4.0.18 vs. repo's 4.1.6 — possible mismatch worth checking) |

**Plugin-load verification** (probe `/api/agents` for registered plugins while `bun run dev` is up): ⚠ **BLOCKED by Finding #7**. Can't boot apps/app dev, so can't inspect plugin registry at runtime. Code-level imports look intact (connector tests run, which exercise plugin module loading).

### Sub-findings worth noting (not blocking)

- **plugin-wechat tests in 2s** — extremely fast vs. the others. Could indicate an empty test file or all tests skipped. Worth manual inspection.
- **plugin-farcaster pins vitest@4.0.18** in its `test` script while the rest of the repo uses 4.1.6. Inconsistent versioning; would not block CI but is a maintenance smell.

---

## Summary

_(filled at end of pass)_
