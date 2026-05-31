<!-- Generated 2026-05-30 by apple-linux-deploy-audit workflow (31 agents, adversarially verified). -->

Confirmed. The empirical evidence reframes the headline finding entirely: the DMG **is** attached, but it ships **mis-branded as elizaOS** and the README points to non-existent `Milady-*.dmg` filenames. This is the real first-try blocker for the macOS direct-download channel — not "never attached."

I now have all verified evidence. The deliverable is a markdown report returned as my final message (per instructions: no .md file, return directly). Writing the synthesis.

---

# Apple Platform Deploy/Build/Start/Dev — Synthesis Report (macOS + iOS)
**Scope:** MILADY (`/Users/home/Documents/milady`, committable) + ELIZA upstream (`/Users/home/Documents/milady/eliza`, upstream PRs). June 2026.

---

## 1. Executive Summary — true current state

The Apple architecture is **sound**: one renderer (`apps/app`) → one Electrobun desktop shell → two deliberate macOS signing channels (sandboxed MAS `.pkg` + direct notarized `.dmg`), plus iOS as a Capacitor wrapper of the same renderer. `dev:desktop` is genuinely well-engineered once in local mode. The problems are **plumbing, branding, and documentation gaps**, not architecture. "First-try usable today?" splits by audience:

- **(a) Fresh-clone dev/build: NO.** A fresh clone defaults to `packages` mode, but `build:desktop` AND `build:ios`/`dev:ios` silently require `bun run eliza:local` (the `eliza/` clone ships the Electrobun bundle, `platforms/{electrobun,ios,macos}`, and the 130 MB `ElizaBunEngine.xcframework` — none are in the npm tarball: `@elizaos/app-core` publishes `"files":["dist"]` only). `README.md:238` literally claims these "all work in both modes" — **false** (verified). On top of that, `build:desktop` on a fresh Mac also needs **Xcode CLT** (unconditional `build:native-effects` → `xcrun clang++`) and **cmake** (whisper defaults ON → `cmake` ENOENT), neither documented as a hard prereq.

- **(b) Credentialed release pipeline: NO.** Three independent blockers on the secret-bearing path: the iOS App Store job references `eliza/...` scripts but never clones eliza; MAS `altool` upload never writes the `.p8` key; and the macOS/MAS builds ship **branded as elizaOS, not Milady** (no `ELIZA_APP_*` env in CI). The README sends users to `Milady-arm64.dmg`/`Milady-x64.dmg` that **do not exist** — releases carry `eliza-canary-macos-arm64.app.tar.gz` / `canary-macos-arm64-elizaOS-canary.dmg` instead (verified live: `gh release view v2.0.0-alpha.140/.139`).

- **(c) Secret-less forks:** the release blockers **skip clean** (validate gates set `ready=false`), so a fork that only wants local dev hits only the (a) traps.

**Empirically settled (two audit self-contradictions resolved against live evidence):**
1. **DMG "never attached" is FALSE.** Live `gh release view` shows macOS installers ARE attached. `publish_release:false` is a **no-op gate**: inside a `uses:`-called reusable workflow `github.event_name` inherits the *caller's* event (never the literal `'workflow_call'`), so `release-electrobun.yml`'s `Create Release` job runs and attaches. Downgrade from blocker → de-confuse item. The *real* macOS-download blocker is **branding/filename mismatch**, surfaced by this same check.
2. **`required:true` Apple-secret contract causing parent `startup_failure` is FALSE.** Empirically refuted in-audit (`gh run view 25933478672`: `failure` not `startup_failure`; every child job dispatched; `Apple Stores / Prepare` succeeded). `secrets: inherit` doesn't enumerate secrets, so GitHub's queue-time validator has nothing to check. Real upstream divergence worth a cosmetic re-sync; **not a blocker.**

**Dropped (verdict isReal:false / not-a-problem):** `ruby-version 4.0.3` (4.0.x genuinely exists), single-arch local build (correct/faster), "silently ships unsigned" (file hardened post-audit — verify step now hard-fails on missing Developer ID; note as already-fixed, not live).

---

## 2. Out-of-Box Blockers — ranked

| # | Blocker | Repo | File:line | Fix |
|---|---------|------|-----------|-----|
| **B1** | **macOS DMG ships mis-branded as elizoS; README points to non-existent `Milady-*.dmg`.** Direct-download release names are `canary-macos-arm64-elizaOS-canary.dmg` etc. (verified live). `release-electrobun.yml:2071` names the release "Eliza"; CI build step lacks `ELIZA_APP_*`. README sends users to filenames that don't exist. | both | `README.md:74-85`; `release-electrobun.yml:2071`; build step missing `ELIZA_APP_NAME/ID/SCHEME` (cf. local `package.json:74`) | Inject the four `ELIZA_APP_*` vars in the electrobun build step + rename release; align README asset names to what's actually published. |
| **B2** | **Fresh-clone build:desktop/build:ios silently require local mode; README:238 says "both modes".** packages mode ships no `platforms/`; opaque resolution failure, no `run eliza:local` hint. | both | `README.md:238` (false); `scripts/lib/eliza-package-mode.mjs:1`; `dev-platform.mjs` electrobun dir (no `existsSync` guard); `run-mobile-build.mjs` ios path | Fix README:238; add fail-fast preflight in `scripts/run-eliza-app-core-script.mjs` (and `predev:desktop`/new `prebuild:ios`) detecting packages-mode + desktop/iOS request → print `bun run eliza:local`. |
| **B3** | **iOS App Store job references `eliza/...` scripts but never clones eliza** — credentialed iOS publish always dies at line 203. | milady | `.github/workflows/apple-store-release.yml:203,216` (no clone in build-ios; build-macos clones at `:344`) | Add the build-macos "Initialize eliza source checkout" step (`:344-354`) to build-ios before `:203`, **or better** route via `node scripts/run-eliza-app-core-script.mjs …` so it can't recur. |
| **B4** | **MAS `altool` upload never writes the `.p8` AuthKey** — upload hard-fails ("Could not find the private key"). milady CI has zero `APP_STORE_API_KEY_P8`/`private_keys` refs (verified); eliza writes it at `:466-471`. | milady | `apple-store-release.yml:504-509` (altool, no key); secrets block `:23-51`; `validate_mas:330-342` doesn't require P8 | Add `APP_STORE_API_KEY_P8` secret; add to env + `validate_mas` missing-check; write/chmod-600/rm at `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8` before altool (mirror eliza `:466-471`). |
| **B5** | **CI MAS resign omits `mas-bun.entitlements` → bun loses `allow-jit`** → MAS `.pkg` crashes / App-Store-rejected. CI re-signs inline with only `mas.entitlements`/`mas-child.entitlements`; the extension-less `Contents/MacOS/bun` Mach-O isn't matched and gets no `allow-jit`. CI stays green (`codesign --verify` checks seal, not entitlement correctness). | both | milady `apple-store-release.yml:461-485`; eliza `:425-448`; `codesign-mas.mjs` unused in CI | Replace inline re-sign with `node packages/app-core/scripts/codesign-mas.mjs`. **Caveat (see §3):** not a pure drop-in. |
| **B6 (build-time)** | **build:desktop on fresh Mac needs Xcode CLT + cmake**, undocumented. Unconditional `build:native-effects` → `xcrun clang++` (exit1 if CLT absent); whisper ON by default → `cmake` ENOENT. | both | `desktop-build.mjs:1033-1038`, `build-macos-effects.sh:8-13,21`; `desktop-build.mjs:165-167` → `build-whisper.mjs:426`; `README.md:630` lists `xcode-select` only as "Optional" | Add `xcrun -f clang++` + `which(cmake)` preflights with `xcode-select --install` / `brew install cmake`; document both as hard `build:desktop` prereqs; default whisper **OFF** for local dev (opt-in `--build-whisper` like CI `release-electrobun.yml:792`). |

> **Not blockers** (settled above): DMG-never-attached (it IS attached — B1 is the real issue), `required:true` startup_failure, ruby 4.0.3, single-arch, silent-unsigned.

---

## 3. Ranked Fix Plan (high → low confidence)

### MILADY (committable in this repo)

| Conf | Title | Sev | Change | Files |
|------|-------|-----|--------|-------|
| **High** | Inject Milady branding into macOS CI builds + rename | blocker (B1) | Export `ELIZA_APP_NAME=Milady ELIZA_APP_ID=ai.milady.milady ELIZA_URL_SCHEME=milady ELIZA_NAMESPACE=milady` in the electrobun build step and MAS build step; rename release from "Eliza"; rename pkg from `Eliza-…-mas.pkg`. | `release-electrobun.yml` build step + `:2071`; `apple-store-release.yml:454-459,493` |
| **High** | Align README macOS/desktop install to reality | blocker (B1) | Fix asset names to what's published (or fix names via branding so `Milady-*.dmg` is real); `docs/build-and-release.md` (linked at README:79) **does not exist** — create or repoint. | `README.md:74-85,79` |
| **High** | Fix README:238 "both modes" + add local-mode preflight | blocker (B2) | Correct README:238 to state desktop+iOS builds require `bun run eliza:local`; add fail-fast in `run-eliza-app-core-script.mjs` / new `prebuild:ios`,`predev:ios`. | `README.md:238`; `scripts/run-eliza-app-core-script.mjs`; `package.json` |
| **High** | Add eliza clone to build-ios job | blocker (B3) | Add the build-macos clone step to build-ios, or route through `run-eliza-app-core-script.mjs`. | `apple-store-release.yml:203,216` |
| **High** | Write `.p8` before altool | blocker (B4) | Add secret + env + validate-check + key-write. | `apple-store-release.yml:504-509,330-342,23-51` |
| **High** | Fix iOS runtime-mode env prefix | high | `ios-runtime-mode.mjs buildModeEnv()` emits `VITE_MILADY_IOS_*` but the renderer reads `VITE_ELIZA_IOS_*` → `build:ios:remote-mac`/`cloud-hybrid` connection params silently dropped (phone falls back to cloud). Emit `VITE_ELIZA_IOS_*` names; update `.env.example:8-15`, `README-IOS-SIMULATOR.md:113-130`. **Caveat:** necessary-but-insufficient for remote-mac (see below). | `scripts/ios-runtime-mode.mjs:88-152`; `apps/app/.env.example`; renderer `eliza/packages/ui/src/platform/ios-runtime.ts` (do NOT change — shared contract) |
| **High** | Add `dev:ios:sim` / wire `run-ios-simulator.mjs` | high (ergonomics) | `dev:ios`/`build:ios` route through the App-Store cloud-hybrid full-Bun-engine **device** build (130 MB xcframework staging + agent bundle + device `xcodebuild`) before `capacitor open ios` — wrong, heavy variant for a dev who wants the simulator. Add `dev:ios:sim` → `run-mobile-build.mjs ios-local`; point QA-onboarding M1 + `apps/app/README` at it; reserve `build:ios` for release. | `package.json`; `docs/QA-onboarding.md:75`; `apps/app/README.md` |
| **High** | Wire or delete orphan `check:ios:store-readiness` | medium | `package.json:90` defines it; nothing calls it; CI also dropped eliza's `preflight:ios:store`. Wire into build-ios after cap:sync, or delete the dead script+entry. | `package.json:90`; `apple-store-release.yml` |
| **High** | Fix `apps/app/README` desktop commands | medium | README tells devs to run `build:desktop`/`dev:desktop` from `apps/app`, but those scripts exist only at repo root. | `apps/app/README.md:97-103` |
| **Medium** | Author/repoint missing desktop docs | low | `docs/apps/desktop-local-development.md` + `docs/apps/desktop.md` referenced ~5× from README but absent → 404. | `README.md:527,692` |
| **Medium** | Decide sync-script story | low | `scripts/sync-root-github-workflows-from-eliza.mjs` is the `@generated by` header on 6 root workflows but is absent (verified) → silent drift. Restore generator + CI existence/contract test, OR drop the `@generated` headers and own the files. | `scripts/`; 6 `.github/workflows/*.yml:1` |
| **Medium** | Re-sync `required:true`→`required:false` Apple secrets | low (cosmetic) | Empirically NOT a startup_failure (settled), but real upstream divergence. Match eliza for consistency. | `apple-store-release.yml:24,25,39` |
| **High** | Doc the two-channel macOS story | low | Add `docs/apple.md`: one renderer → one Electrobun shell → two signing variants (MAS `.pkg` via apple-store-release; direct notarized `.dmg` via release-electrobun) + iOS Capacitor. State both channels are intentional. | new `docs/apple.md` |

### ELIZA (upstream elizaOS/eliza PRs)

| Conf | Title | Sev | Change | Files |
|------|-------|-----|--------|-------|
| **High** | **Delete the dead Swift macOS app** | medium | See §4. Zero CI/script refs; dev harness; macOS-26-only; not whitelabeled. | `eliza/packages/app-core/platforms/macos/` (entire dir) |
| **High** | Make `codesign-mas.mjs` the single MAS signing path | blocker (B5) | Replace inline CI re-sign in eliza `apple-store-release.yml:425-448` with `codesign-mas.mjs`. **Caveat:** not a drop-in — it calls `loadEntitlementReviewManifest()`/`assertSourceEntitlementsReviewed()` + a native-evidence scan and throws unless the reviewed entitlement manifest is present and in sync; the PR must ship that manifest. | eliza `apple-store-release.yml:425-448`; `codesign-mas.mjs` |
| **High** | `buildWeb` must respect a pre-set runtime mode | high | For the env-prefix fix to make `remote-mac` work, `buildWeb` spreads `process.env` THEN the policy object, unconditionally clobbering `VITE_ELIZA_IOS_RUNTIME_MODE` back to `cloud-hybrid`. Make it `process.env.VITE_ELIZA_IOS_RUNTIME_MODE || policyMode` (mirroring how it already does `ELIZA_BUILD_VARIANT`). | `run-mobile-build.mjs:873-877` |
| **High** | Ship `platforms/` (or stop hardcoding the clone path) | high | Published `@elizaos/app-core` ships `scripts/` but not `platforms/`; `resolvePlatformTemplateRoot()` hardcodes the clone path. Add platform templates + native-plugins to the published `files` allowlist, or make the resolver mode-aware. (Root cause of B2/B3.) | `eliza/.../package.json` files; `capacitor-platform-templates.mjs` |
| **High** | De-dup the iOS `INCLUDE_LLAMA` opt-in + dup-OR slop | low | `isIosLlamaRequested` reads `ELIZA_IOS_INCLUDE_LLAMA \|\| ELIZA_IOS_INCLUDE_LLAMA` (dup); `MILADY_IOS_INCLUDE_LLAMA` opt-in is dead. Either alias `MILADY_…→ELIZA_…` (milady side) or fix the read; remove the double-set / double-`'store'` clauses. | `run-mobile-build.mjs:3170-3175,3211-3216,6527-6549`; `ios-runtime.ts:131-138` |
| **High** | Derive iOS IPA `output_name` from brand | medium | `Fastfile:41` hardcodes `Eliza.ipa`; milady ships `Eliza.ipa` in a whitelabel repo. `ENV["IOS_IPA_NAME"] \|\| "App.ipa"`; have `applyIosAppIdentity()` set it. | `eliza/.../ios/fastlane/Fastfile:41,54` |
| **Medium** | Default desktop whisper OFF for local dev | medium (B6) | `desktop-build.mjs:165-167` default ON → cmake ENOENT on fresh Mac; opt-in like CI. | `desktop-build.mjs:165-167`; `build-whisper.mjs:426` |
| **Medium** | Consolidate macOS state-dir resolution | medium | `agent.ts:278-287` re-implements precedence that `core/state-dir.ts` owns; direct (`~/.local/state/milady`) vs store (`<userData>/state`) diverge — non-idiomatic on macOS. Reuse `resolveStateDir` from `@elizaos/core`; consider `~/Library/Application Support/Milady`. | `electrobun/src/native/agent.ts:278-287`; `core/src/utils/state-dir.ts:49-64` |
| **Medium** | Wire `build-llama-ffi-{ios,macos}` into a gate | medium | Never-run scaffolds (`run_real_build=false`); the on-device/Metal inference XCFramework/dylib is uncovered. Add scheduled/release gate; verify load; attach/consume. | eliza `build-llama-ffi-{ios,macos}.yml` |
| **Low** | Remove/repurpose `publish_release` no-op gate | low | It's effectively dead under `uses:` invocation (settled empirically). Remove it or actually wire it. | `release-electrobun.yml:1986,1097,2115` |

---

## 4. APPLE CONSOLIDATION VERDICT

### Should the native Swift macOS platform be collapsed into the single Electrobun desktop codebase (retire it)? — **YES. Delete it. Decisive.**

**What the Swift app ships today: nothing.** It is structurally incapable of shipping to a consumer:
- `RuntimeController.swift:59-66` (verified) shells out to `bun run start` from a **detected elizaOS repo root** and throws `RuntimeControllerError.missingRepository` otherwise. It is a **developer harness that assumes a full source checkout on disk** — the opposite of a distributable. Electrobun *bundles* the runtime; ElizaMac cannot.
- `Package.swift` pins `.macOS(.v26)` (verified) — macOS-26-only.
- Hardcodes `name: "ElizaMac"` (verified) / `ai.eliza.mac` — **not Milady-whitelabeled**, unlike Electrobun which takes `ELIZA_APP_NAME=Milady ELIZA_APP_ID=ai.milady.milady` from env.

**Is it wired into any release? No.** `grep -rn "ElizaMac|platforms/macos|swift build|build_and_run"` across `.github/workflows/`, `scripts/`, `package.json`, and `packages/app-core/scripts/` in **both repos returns ZERO matches** (verified). The shipping macOS product is exclusively the Electrobun `.app` (apple-store-release.yml + release-electrobun.yml build only Electrobun).

**Recent activity = churn.** The last commits touching it are cosmetic renames only (verified): `52b544856c refactor(app): rename babylon app to feed`, `88762f1e13 chore(rename): Babylon→Feed in macos README`.

**Unique capabilities lost: none shippable.** Electrobun already provides every macOS-native surface — native window effects (`libMacWindowEffects.dylib`), menu/tray, the full entitlement set (screen-recording/camera/mic/AppleEvents/addressbook/calendars, `electrobun.config.ts:585-597`, verified), and the sandboxed MAS variant (`buildVariant === "store"` → `mas.entitlements`, verified at `:579-583`). No MAS-only API is unlocked by Swift that the Electrobun MAS `.pkg` doesn't already cover.

**iOS relationship:** independent — iOS is Capacitor wrapping `apps/app`. Deleting ElizaMac doesn't touch iOS.

**Migration cost: ~zero.** Delete `eliza/packages/app-core/platforms/macos/`. Nothing imports it, builds it, or references it. **Risk: none to shipping.** Loss: an experimental macOS-26-only SwiftUI prototype. (If a native-SwiftUI experiment must survive, move it to a clearly-labeled `research/`/`examples/` tree so it stops reading as a parallel macOS product. This is an upstream eliza PR.)

### Should the Apple **release pipeline** collapse into one? — **NO. Keep two.**

`apple-store-release.yml` (sandboxed **MAS `.pkg`** → App Store Connect via `altool`, bypassing GitHub releases) and `release-electrobun.yml` (hardened-runtime **direct notarized `.dmg`/`.app`** → GitHub release + auto-update) are **legitimately distinct distribution channels**, forked deliberately by `buildVariant` in `electrobun.config.ts:579` (store → `mas.entitlements` with app-sandbox; direct → inline hardened-runtime no-sandbox, verified). Collapsing them forces dropping either App Store or direct distribution. The real consolidation wins are **(a) deleting the Swift app, (b) de-duping MAS signing into `codesign-mas.mjs`, (c) fixing the milady↔eliza workflow drift** — NOT merging channels.

### The single simplest honest Apple story
**One renderer (`apps/app`) → one Electrobun desktop shell → two macOS signing variants (MAS sandboxed `.pkg`; direct notarized `.dmg`) + iOS Capacitor wrapping the same renderer.** Once ElizaMac is deleted and the branding/p8/clone/allow-jit plumbing is fixed, that's the whole picture, and it's clean.

---

## 5. Simplify / De-confuse

- **Delete `eliza/packages/app-core/platforms/macos/`** — biggest single de-confusion (kills "which macOS app starts?").
- **Reframe `publish_release`** — it's a misleading no-op gate under `uses:` invocation (DMGs *are* attached; verified). Remove it or wire it; don't treat it as a blocker.
- **One env convention for iOS runtime mode** — kill the three-way split (`VITE_MILADY_*` emit vs `VITE_ELIZA_*` read vs stale local-mode clone). Emit `VITE_ELIZA_*` (the shared contract) and stop double-wrapping `build:ios`.
- **One MAS signing source of truth** — `codesign-mas.mjs`, not inline CI.
- **Decide the `@generated` story once** — restore generator + contract test, or own the workflows by hand. Frozen "generated" files with an absent generator caused every milady↔eliza drift in this audit.
- **`build:ios` should default to a runnable target** — bare `build:ios` produces an unsigned device `.app` (neither simulator-runnable nor shippable). Make the documented dev command the simulator path.

## Open Questions (user decisions only)

1. **macOS state-dir on direct builds:** keep `~/.local/state/milady` (XDG, cross-platform-consistent) or move to idiomatic `~/Library/Application Support/Milady`? (Affects direct↔store convergence + migration.)
2. **`@generated` workflows:** restore the sync generator, or formally adopt the root workflows as hand-maintained? (Determines whether eliza-side fixes auto-propagate.)
3. **`releases.milady.ai` auto-update host** (`release-electrobun.yml:1097,2086,2110`): provision it, or fold auto-update onto GitHub release assets like eliza already does? (Currently an unprovisioned placeholder baked as the update baseUrl.)
4. **On-device iOS/macOS llama (`build-llama-ffi-*`):** is Metal/bun:ffi local inference an Apple ship goal? If yes, the scaffolds must be gated/validated; if no, mark them clearly experimental.
5. **Swift prototype:** confirm OK to delete outright (recommended), vs. move to `research/`.

**Key files:** `/Users/home/Documents/milady/README.md:74-85,238`; `/Users/home/Documents/milady/.github/workflows/apple-store-release.yml:203,216,344,461-509`; `/Users/home/Documents/milady/.github/workflows/release-electrobun.yml:1097,2071`; `/Users/home/Documents/milady/.github/workflows/agent-release.yml:417`; `/Users/home/Documents/milady/scripts/ios-runtime-mode.mjs:88-152`; `/Users/home/Documents/milady/eliza/packages/app-core/platforms/macos/` (delete); `/Users/home/Documents/milady/eliza/packages/app-core/platforms/electrobun/electrobun.config.ts:579-597`; `/Users/home/Documents/milady/eliza/packages/app-core/scripts/{desktop-build.mjs:1033-1038,165-167, run-mobile-build.mjs:873-877, codesign-mas.mjs}`.