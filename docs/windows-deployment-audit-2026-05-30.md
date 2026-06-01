<!-- Generated 2026-05-30 by the windows-deploy-audit workflow (14 agents, 7 surfaces, adversarially verified). -->

# Windows Deployment Audit — Synthesis Report (milady + eliza)

## 1. Executive summary

**Windows is NOT first-try usable today on the developer path, and the user-download path is mis-wired.** A fresh Windows clone defaults to `packages` source mode (no `eliza/` checkout on disk), but every desktop command — `build:desktop`, `dev:desktop`, `start:desktop` — silently requires `local` mode because the published `@elizaos/app-core` tarball ships **no** `platforms/electrobun/` directory. `README.md:238` actively misleads by claiming `build:desktop` "work[s] in both modes," and the `dev:desktop` preflight (`check-eliza-git-freshness.mjs:93-96`) exits 0 in packages mode, so the failure surfaces as an opaque electrobun-resolution error instead of "run `bun run eliza:local` first." Even after switching to local mode, `build:desktop` then hard-fails on a fresh box because it defaults to bundling Whisper via `bash` + `cmake` (absent on stock Windows). Separately, the **canonical Release pipeline builds the Windows installer but never attaches it to any GitHub release** (`agent-release.yml:417` calls the inner workflow with `publish_release: false`, which skips the release job at `release-electrobun.yml:1986`), and `README.md:80` links a download named `Milady-Setup.exe` that the pipeline never produces (it emits `ElizaOSApp-Setup-*.exe`). The underlying CI **release build** on the `windows-2025` runner is genuinely solid (Inno installer, signing, MSIX, packaged renderer-bootstrap e2e) — the problem is plumbing, mode coupling, documentation, and a publish gate, not the build mechanics. Net: the pieces work; the first-try paths into them are broken or undocumented.

---

## 2. Out-of-box blockers (ranked)

Only three root blockers genuinely break first-try Windows. They are sequential on the dev path (you hit #1, then #2) and parallel on the user path (#3).

### Blocker 1 — Desktop build/dev requires `local` mode, default is `packages`, and docs claim "both modes"
**Repo:** both (doc/plumbing = MILADY; clean error in scripts = ELIZA) · **Persona:** developer
- Fresh clone has no `eliza/` and no root `packages/`. Published `@elizaos/app-core` ships no `platforms/` dir (verified: `node_modules/@elizaos/app-core/` has only `i18n, packages, plugins, scripts, styles, test`).
- `app-dir.mjs:44-60` `resolveElectrobunDir()` only looks in `<repo>/packages|eliza/packages`, never `node_modules`.
- `README.md:238` states `build:desktop` "all work in both modes" — false. The real path is local-mode-only: `release-electrobun.yml:405` forces `MILADY_ELIZA_SOURCE: local` and `:792/:1036` call `node eliza/packages/app-core/scripts/desktop-build.mjs` with explicit `eliza/` paths.
- `dev:desktop:preflight` (`package.json:121` → `check-eliza-git-freshness.mjs:93-96`) returns 0 silently in packages mode, so the failure is cryptic.
- **Fix:** (MILADY) correct `README.md:238` to state desktop commands require `bun run eliza:local` first; add a fail-fast in the `predev:desktop` / `dev:desktop:preflight` chain that detects packages-mode + desktop request and prints the exact remediation. (ELIZA) guard `dev-platform.mjs` with `existsSync(path.join(electrobunDir, 'package.json'))` — the dir exists, only `package.json` is missing, so a bare `existsSync(electrobunDir)` would not fire.

### Blocker 2 — `build:desktop` defaults to bundling Whisper via `bash` + `cmake` (sequential, reached only after Blocker 1 is fixed)
**Repo:** both (invocation = MILADY; bash dependency = ELIZA) · **Persona:** developer (local mode)
- `desktop-build.mjs:165-166` sets `buildWhisper=true` whenever `ELIZA_DESKTOP_BUILD_WHISPER !== '0'`; `package.json:74` does not set it. `stageBundledWhisperRuntime()` runs `bash .../ensure-whisper-gguf.sh` then a `cmake` build; `run()` is strict (`process.exit` on spawn failure). A fresh Windows box has neither Git-Bash nor cmake → hard fail.
- CI survives because it passes explicit `--build-whisper` on a tooled `windows-2025` runner and pre-seeds the model into the cache.
- **Fix:** (MILADY) add `ELIZA_DESKTOP_BUILD_WHISPER=0` to `build:desktop` (`package.json:74`) and `start:desktop` (`package.json:169`) — both stage; do **not** add it to `desktop:preflight` (preflight never stages whisper). CI-safe: CI's explicit `--build-whisper` overrides. Document the opt-in flag for users who want bundled local ASR.

### Blocker 3 — Canonical Release never publishes the installer, and the documented download name is wrong
**Repo:** MILADY-committable · **Persona:** end user downloading from Releases
- `agent-release.yml:417` calls `release-electrobun.yml` with `publish_release: false`; the inner `release` job is gated `if: (github.event_name != 'workflow_call' || inputs.publish_release)` (`release-electrobun.yml:1986`) → on this call `(false || false)` → **skipped**. The `ElizaOSApp-Setup-*.exe`/`.msix` collected at `:2007-2075` attach nowhere. The `agent-release` publish job has zero asset-attach step yet its release body asserts `- ✅ Electrobun artifacts (uploaded during build phase)` (`agent-release.yml:1238`) — false.
- The only path that *could* publish is a `v*` tag push re-firing `release-electrobun.yml:36-38`, but `agent-release.yml` pushes that tag with the default `GITHUB_TOKEN` (`:1132`), which GitHub's recursion rule prevents from triggering other workflows. So nothing publishes. (This same token fact disproves the "double build" theory — see §6.)
- Compounding: `README.md:80` links `Milady-Setup.exe`, but the built artifact is `ElizaOSApp-Setup-<channel>.exe` (`build-inno.ps1:160`).
- **Fix:** (MILADY) change `agent-release.yml:412-417` to pass `publish_release: true` (matching `eliza release-all.yml:319`) **or** add an explicit download-artifact + attach step in the publish job; remove/correct the false "uploaded during build phase" claim. Then either rename the installer to match `Milady-Setup.exe` (paired with §3 branding fix) or correct `README.md:80` to the real name — prefer fixing the artifact name so doc and reality agree.

> **Not in this section (reframed by verdicts):** PR-time Windows CI gaps (ci-smoke #1/#2/#3, start-runtime #1) are regression-risk coverage gaps, not "develop is currently red on Windows" — they are high-severity fix-plan items. Windows OTA auto-update (release #4) was downgraded blocker→high: it breaks *post-install update*, not first launch. The Electrobun POSIX dev-script concern is **not** a blocker (bun normalizes `VAR=val`/`$PWD`; the bash `zip` shim is unreachable on any current Windows codepath).

---

## 3. Ranked fix plan (high → low confidence)

### MILADY-committable

| # | Title | Severity | Change | Files |
|---|-------|----------|--------|-------|
| M1 | Fix README "both modes" claim + add desktop preflight fail-fast | blocker | State desktop commands need `bun run eliza:local`; make `dev:desktop:preflight` detect packages-mode + desktop and fail with that exact message | `README.md:238`; `scripts/check-eliza-git-freshness.mjs` or a new step in `package.json:121` predev chain |
| M2 | Default whisper OFF for local desktop build | blocker | Add `ELIZA_DESKTOP_BUILD_WHISPER=0` to `build:desktop` and `start:desktop` (NOT `desktop:preflight`) | `package.json:74,169` |
| M3 | Make canonical Release actually attach the Windows installer | blocker | `publish_release: true` in `agent-release.yml`, or add asset-attach step in publish job; delete the false release-body line | `agent-release.yml:417,1238` |
| M4 | Correct README Windows download name (or rename artifact) | medium | Make `README.md:80` and the built artifact name agree | `README.md:80` (+ depends on E2 for true rename) |
| M5 | Brand the live GitHub release name | medium | The live release is named the bare `${tag}` from the agent-release publish job (`agent-release.yml:1217`) — NOT "Eliza ${tag}" (that job is skipped). Brand the publish job's `name:`/body | `agent-release.yml:1217` |
| M6 | Delete dead `sign-windows.yml` | medium | Triggers on nonexistent workflow `"build-desktop"` (`:28-30`); downloads nonexistent artifact `milady-windows-unsigned` (`:36,52`); uses a third divergent secret scheme `WINDOWS_CODE_SIGNING_CERT_PFX_*`. Signing already happens inline in `release-electrobun.yml:1177,1521`. Self-verified (the `sign` verdict array was empty — no adversary check ran) | delete `.github/workflows/sign-windows.yml`; update `docs/security/audits/05-clients.md:197-199` to canonical `WINDOWS_SIGN_CERT_*` names |
| M7 | Delete orphan `build:win`/`dev:win` scripts | medium | `build:win` crashes in packages mode (`build-win.mjs:19-22` imports nonexistent `../../app/scripts/capacitor-plugin-names.mjs`); `dev:win` is defective via bogus `rootDir` cwd resolution (NOT a missing-import crash). Both assume the eliza monorepo layout, are undocumented, never in CI, and shadow the canonical `build:desktop`/`dev:desktop`. Confusion items, not first-try blockers | `package.json:200-201` |
| M8 | Fix Windows OTA update baseUrl | high | `release-electrobun.yml:1097` bakes either an empty string (canonical call) or the placeholder `https://releases.milady.ai/` (TODO); rsync no-ops without `RELEASE_UPLOAD_KEY`. Adopt eliza's GitHub-release-assets baseUrl: `format('https://github.com/{0}/releases/download/{1}/', github.repository, tag)` | `release-electrobun.yml:1095-1097,2094-2110` |
| M9 | Add PR-time Windows CI (collapse all coverage gaps) | high | `ci.yml` jobs are all `ubuntu-24.04`; no PR ever builds/starts the Windows app. Lowest-lift: add a `windows-2025` matrix leg to the existing `test-electrobun-release.yml` (already PR-triggers on the desktop paths and resolves the eliza/ checkout) running `desktop:preflight` + a renderer build; feed it into the merge gate. Heavier `test:desktop:packaged:windows`/`:playwright:windows` behind label/schedule | new leg in `test-electrobun-release.yml` (currently pins `ubuntu-24.04`); wire into `ci.yml` `all-tests-passed` |
| M10 | Resolve missing generator-script reference | medium | Six workflows carry `# @generated by scripts/sync-root-github-workflows-from-eliza.mjs` (verified absent). Either commit the generator or replace the banner with the real manual-sync process | `release-electrobun.yml:1-2` + 5 others |
| M11 | Decide Windows Store path | high | Milady has no `windows-store-release.yml` and no Store submission job, yet `release-electrobun.yml:1583-1979` builds an MSIX consumed by nothing (orphaned because the release job is skipped, per M3). Either port eliza's store job or delete the dead inline MSIX build | `release-electrobun.yml` (delete inline MSIX) or new `windows-store-release.yml` + `agent-release.yml` job |
| M12 | Drop `continue-on-error` on installer smoke for non-draft release | medium | `release-electrobun.yml:1356` swallows installer-smoke failure; the renderer-bootstrap gate then launches `launcher.exe` from the build tree (`packaged-app-helpers.ts:163`), bypassing the installer — a broken installer can ship | `release-electrobun.yml:1356` |
| M13 | Add Windows orphan/port cleanup branch | medium | `cleanup-desktop-orphans.mjs` uses `pgrep`/`lsof`/macOS `.app` patterns → silent no-op on Windows; a live orphan from an ungraceful exit keeps port 31337 + PGlite lock, defeating the preflight. Add `Get-CimInstance Win32_Process`/`tasklist` + `netstat -ano` detection (PID-stamped lock check via `process.kill(pid,0)` is already cross-platform) | `scripts/cleanup-desktop-orphans.mjs` |
| M14 | Windows-appropriate Node-version remediation | medium | `install-env.mjs` emits Unix-only fixes (`export PATH`, `~/.nvm`) when active Node ∉ 22–24. Branch on `process.platform==='win32'` for nvm-windows/fnm guidance | `scripts/lib/install-env.mjs:270-308,378-395` |
| M15 | Rename misleading `app-windows.spec.ts` | low | It is a generic Chromium UI-smoke test (no platform gate), not a Windows-OS test; the name masks the real coverage gap | `apps/app/test/ui-smoke/app-windows.spec.ts` |
| M16 | Document `dev:guard*`/`desktop:preflight` or delete | low | PowerShell-only git-status poller, undocumented, redundant with bun/vite watch; name implies a relationship to `dev:desktop` that doesn't exist. Prefer deletion; if kept, rename (e.g. `watch:checks`) and document | `package.json:126-129`, `scripts/dev-guard.ps1`, README |
| M17 | One consolidated "Build/dev desktop on Windows" doc section | medium | No single doc threads long-paths → `eliza:local` → root `build:desktop`/`dev:desktop` → avoid `build:win`. `apps/app/README.md:97-104` wrongly shows desktop commands run from `apps/app` | `README.md`, `apps/app/README.md:97-104` |

### ELIZA-upstream-PR

| # | Title | Severity | Change | Files |
|---|-------|----------|--------|-------|
| E1 | Packages-mode detection + actionable error in desktop scripts | blocker (paired w/ M1) | `desktop-build.mjs` detect packages mode → "run `bun run eliza:local` first"; `dev-platform.mjs` guard `existsSync(path.join(electrobunDir,'package.json'))` (dir exists, only package.json missing) | `eliza/.../scripts/desktop-build.mjs`, `dev-platform.mjs:123-148` |
| E2 | Honor `ELIZA_APP_NAME`/`ELIZA_APP_ID` in the Windows installer | medium | `build-inno.ps1` hardcodes `ElizaOSApp`/`ai.elizaos.app`/install dir/output filename. Having the ps1 read `$env:ELIZA_APP_NAME` is **insufficient alone** — the Inno CI step env block (`release-electrobun.yml:1276-1279`) only injects signing secrets, so the fix must ALSO export `ELIZA_APP_NAME`/`ELIZA_APP_ID` into that step AND update the verify-step filename glob (`:1292`). `desktop-build.mjs:1223` already threads `appIdentityEnv()` into the electrobun package step — apply the same pattern | `eliza/.../packaging/inno/build-inno.ps1`; CI step env in MILADY's `release-electrobun.yml:1276-1292` |
| E3 | Cross-platform whisper fetch | low | Provide a Node equivalent of `ensure-whisper-gguf.sh` so opt-in bundled ASR works on Windows | `eliza/.../scripts/ensure-whisper-gguf.sh` |
| E4 | Default state dir to `%LOCALAPPDATA%\Milady` on win32 | medium | `resolveStateDir` defaults to `~/.local/state/milady` (`C:\Users\X\.local\state\milady`), non-idiomatic; PGlite inherits it. Branch on `process.platform==='win32'` or have the launcher set `ELIZA_STATE_DIR` to a `%LOCALAPPDATA%` path pre-boot. Add a packaged e2e variant that does NOT inject state-dir overrides | `eliza/packages/core/src/utils/state-dir.ts`; `app-core/platforms/electrobun/src/database/pglite-paths.ts:22` |
| E5 | Fatal-fail on missing/empty preload in packaged runtime | medium | `index.ts:899-905` swallows preload read errors → `// preload unavailable` → white-screen renderer. Treat unreadable/empty preload as fatal in production; keep soft fallback only in dev | `eliza/.../platforms/electrobun/src/index.ts:899-905` |
| E6 | Remove dead bash `zip` shim cruft (low) | low | `#!/bin/bash` zip shim is cross-platform-incorrect but unreachable on Windows today (dev never zips; Windows uses `Compress-Archive`). Replace with node archiver so a future build-path change can't silently inherit it | `eliza/.../platforms/electrobun/scripts/bin/zip` |
| E7 | Brand the MSIX artifact/Partner Center identity | low | `windows-store-release.yml:121-123` names `Eliza-$version.msix`; use Milady identity | `eliza/.../windows-store-release.yml`, `packaging/msix/build-msix.ps1` |
| E8 | First-run CEF download notice on win32 | low | Print a one-time "downloading Chromium (CEF)…" notice and pad wait timeouts before the Electrobun child starts on Windows | `eliza/.../platforms/electrobun/scripts/dev-platform.mjs:478-501` |

---

## 4. Simplify / de-confuse

The single highest-value cleanup is collapsing cross-dimension duplicates into one action each:

1. **One canonical Windows desktop path; delete the trap.** Make `build:desktop` (build) / `dev:desktop` (run) / `desktop:preflight` (validate) the only desktop commands. **Delete `build:win` + `dev:win`** (M7): they're eliza-internal Capacitor scripts that never touch milady's `apps/app`, are broken in packages mode, undocumented, in zero CI — yet `build:win`/`dev:win` are the first names a Windows dev scanning `package.json` would try. This was flagged in three dimensions (build #5, dev #5, plumbing #2) → one delete.

2. **One Windows signing path; delete the dead workflow.** **Delete `sign-windows.yml`** (M6) — flagged across build #6, sign #1–4, ci-smoke #4. Signing already happens inline in `release-electrobun.yml`. Standardize on `WINDOWS_SIGN_CERT_BASE64`/`_PASSWORD`/`_TIMESTAMP_URL` everywhere (kills the divergent `WINDOWS_CODE_SIGNING_CERT_PFX_*` scheme) and fix the stale EV-as-PFX docs to point at the Azure Trusted Signing path `sign-windows.ps1` already supports.

3. **One release publishing path.** Resolve the `publish_release:false` skip (M3) so there is a single authoritative path that builds AND attaches. The verdict killed the "double build" worry — there is no redundant trigger because the default-token tag push can't re-fire `on:push:tags`. Decide whether `release-electrobun.yml`'s `on:push:tags:v*` is even a wanted entry, or whether `agent-release.yml` is the sole orchestrator.

4. **One generator story.** Either commit `scripts/sync-root-github-workflows-from-eliza.mjs` (M10) or strip the `@generated by` banners from all six workflows and document the real manual sync. A maintainer following the banner after an eliza pin bump currently hits a dead end.

5. **Reconcile the milady↔eliza workflow surface.** eliza's `release-all.yml` exposes desktop + windows-store + update-manifest jobs; milady imports a subset and reinvents others inline. Decide explicitly which eliza jobs milady adopts (port) vs. omits (delete the dead inline MSIX), and document the omissions, so the two-repo release surface stops drifting.

6. **Shift Windows CI left, once.** Collapse start-runtime #1 + ci-smoke #1/#2/#3 into M9 — add one `windows-2025` leg to the existing PR-triggered `test-electrobun-release.yml` rather than authoring a net-new workflow. Optionally port eliza's cheap PR smokes (`windows-dev-smoke.yml`, `windows-desktop-preload-smoke.yml`) as the fastest first-try signal.

---

## 5. Open questions (user decisions only)

1. **Windows Store distribution: yes or no?** If yes → port `windows-store-release.yml` + a `windows-store` job into milady (M11). If no → delete the dead inline MSIX build from `release-electrobun.yml`. The MSIX currently builds and is consumed by nothing. (Decides E7 too.)
2. **OTA update host:** adopt eliza's free GitHub-release-assets baseUrl (M8, zero infra), or stand up `releases.milady.ai` + set `RELEASE_UPLOAD_KEY`/`RELEASE_HOST_FINGERPRINT` secrets? A real release must not ship the empty/placeholder URL either way.
3. **Whitelabel completeness:** is full installer/MSIX/state-dir rebranding (`Milady` / `ai.milady.milady`) in scope for this branch (`feat/milady-whitelabel-executive`), or is the bare-`${tag}` release name + `ElizaOSApp` installer acceptable interim? This gates E2, E4, E7, M5, M4 and the `Milady-Setup.exe` rename.
4. **Generator script:** commit `scripts/sync-root-github-workflows-from-eliza.mjs`, or abandon the generated-workflows pattern and maintain root workflows manually (M10)?
5. **`dev:guard*`:** delete as redundant, or keep and rename/document as a Windows convenience watcher (M16)?
6. **Bundled local ASR (Whisper) on Windows:** is it a wanted default eventually (needs E3 cross-platform fetch), or strictly opt-in via `ELIZA_DESKTOP_BUILD_WHISPER=1`?

**Key files:** `/Users/home/Documents/milady/package.json:74,169,200-201`, `/Users/home/Documents/milady/README.md:80,238`, `/Users/home/Documents/milady/.github/workflows/agent-release.yml:417,1217,1238`, `/Users/home/Documents/milady/.github/workflows/release-electrobun.yml:1097,1356,1986`, `/Users/home/Documents/milady/.github/workflows/sign-windows.yml`, `/Users/home/Documents/milady/scripts/cleanup-desktop-orphans.mjs`, `/Users/home/Documents/milady/scripts/check-eliza-git-freshness.mjs`, `/Users/home/Documents/milady/eliza/packages/app-core/scripts/desktop-build.mjs`, `/Users/home/Documents/milady/eliza/packages/app-core/scripts/dev-platform.mjs`, `/Users/home/Documents/milady/eliza/packages/app-core/packaging/inno/build-inno.ps1`, `/Users/home/Documents/milady/eliza/packages/core/src/utils/state-dir.ts`, `/Users/home/Documents/milady/eliza/packages/app-core/platforms/electrobun/src/index.ts:899-905`.