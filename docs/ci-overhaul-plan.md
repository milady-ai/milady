# Milady CI / Release Pipeline Overhaul Plan

**Status:** Draft — not yet executed
**Branch target:** `develop` (via stacked PRs)
**Author signal:** Recurring failure pattern across PRs #1989/#1992/agent-release; user authorized overhaul 2026-04-17.

---

## Why an overhaul

Multiple sessions have been spent chasing symptoms. The same root causes keep producing new failures:

1. **TS version drift** between Build (TS 6.0.3 hoisted from `eliza/packages/typescript` devDep), Cloud-image build (TS 5.9.3 from milady root), and mobile contexts. Single tsconfig change can be valid in one and invalid in another.
2. **`disable-local-eliza-workspace.mjs` + 300-line fallback shell** (`scripts/install-published-workspace-fallback-deps.sh`) — fragile rebuild of the workspace install graph for "published-only" mode. Every new transitive dep eventually triggers a missing-package error, requiring another `append_*` line in the shell.
3. **Plugin builds not run before consumers in the test transform graph.** Vitest `real.config.ts` aliases `@elizaos/plugin-telegram/account-auth-service` to source via `fallbackPath`, but the alias only fires when no installed `dist/` resolution exists; when the plugin is partially built (only `index.js`), it returns `undefined` for subpath exports → ERR_MODULE_NOT_FOUND.
4. **17+ required checks per PR with no tier**, so a single flake (e.g. Website Blocker iOS Simulator boot timeout) blocks merge.
5. **Monolithic `agent-release.yml`** (~10 jobs in one workflow) reuses the fragile install paths above. Failures in one matrix leg cascade to "All Tests Passed".
6. **Auto-regenerated Depot mirror** (`.depot/workflows/`) keeps overwriting manual fixes. Closed-loop fix only with `migrate-config.yaml` skip list.
7. **Duplicate runner execution** (GHA + Depot CI mirror) on workflows that don't benefit from Depot. Doubles CI minutes.

The overhaul is the path to making `agent-release.yml` *sustainably* green.

---

## Architecture target

### Single source of truth

| Concern | Today | After overhaul |
|---|---|---|
| TypeScript version | Two pins (root `^5.9.3`, eliza `^6.0.0`) hoisted differently per context | One pin in root, eliza inherits via workspace hoisting |
| Bun version | Pinned in `.bun-version` + 5+ workflow files | Pinned in `.bun-version`, all workflows read from it via `oven-sh/setup-bun@v2` |
| Install path | `setup-upstreams.mjs` + `disable-local-eliza-workspace.mjs` + `install-published-workspace-fallback-deps.sh` + `patch-deps.mjs` | Single `scripts/repo-install.mjs` with explicit phase ordering |
| Plugin build ordering | Implicit; consumers fail at test time | Explicit pre-test `bun run build:plugins` phase |
| Required checks | 17+ all-or-nothing | Tier 1 blocking (5 checks) + Tier 2 informational |

### Three-tier release pipeline

```
Phase A: validate (always — PR + push)
  - Lint, TypeCheck, Build, Real Tests, Pre-Review
  - Hard gate, fast (<5 min target)

Phase B: artifact (release tag only)
  - build-electrobun (matrix: macos-14, macos-15, ubuntu-24.04, windows-latest)
  - build-docker (Depot)
  - build-cloud-image (Depot)
  - Each uploads artifact to GH releases draft

Phase C: publish (manual approval after Phase B)
  - publish-npm, publish-electrobun, publish-mobile
  - Reads artifacts from Phase B, no rebuild
```

---

## Phased execution

### Phase 0 — Stop the bleeding (already in flight)

Current PR #1992 fixes are part of this phase:
- ✅ Twitter→Bird, Chrome→Compass, Fingerprint→FingerprintPattern, Github→CodeXml lucide icons
- ✅ `ignoreDeprecations: "6.0"` restored in eliza/packages/typescript/tsconfig.declarations.json

### Phase 1 — TypeScript single-source-of-truth

**Files:**
- `package.json` (root) — keep `typescript: ^5.9.3`
- `eliza/packages/typescript/package.json` — drop `typescript` from devDependencies (or align to ^5.9.3)
- `eliza/tsconfig.json` — verify `ignoreDeprecations: "6.0"` works on TS 5.9 (it does — added in TS 5.6)

**Verify:** `bun run typecheck` passes on root + eliza packages with single TS version.

### Phase 2 — Replace `disable-local-eliza-workspace.mjs`

The published-only mode is what cloud-image builds use to simulate "user installs from npm". The current implementation rewrites the workspace then patches it back up via shell.

**Replacement:** Two clean install profiles, selected via `MILADY_INSTALL_PROFILE` env:
- `workspace` (default): `bun install` with full workspace, eliza linked from source
- `published`: `bun install --production` with `eliza/` excluded from workspaces field, all `@elizaos/*` resolved from npm published versions

**Implementation:** `scripts/repo-install.mjs` with explicit phases:
```
1. Detect profile (env or auto-detect from CI context)
2. If published:
     - Use a separate root package.json template (`package.published.json`) with eliza removed from workspaces
     - bun install
3. If workspace:
     - bun install
     - run setup-upstreams.mjs (link local eliza)
4. Always:
     - patch-deps.mjs (post-install patches)
     - ensure-skills.mjs
```

This eliminates `disable-local-eliza-workspace.mjs` and `install-published-workspace-fallback-deps.sh` entirely.

### Phase 3 — Plugin build pre-phase

Add `bun run build:plugins` script that explicitly builds:
- `eliza/plugins/plugin-*` (all that have `dist/` outputs and subpath exports)
- `eliza/packages/typescript` (if not already built)

Wire into `bun run dev` and CI test jobs as a pre-step. Eliminates ERR_MODULE_NOT_FOUND for plugin subpath imports.

### Phase 4 — Required check tiering

In `.github/branch-protection.yml` (or via `gh api`):

**Required (blocking):**
- Lint & Format
- Type Check
- Build
- Real tests (Vitest, no mocks)
- Pre-Review

**Informational (run on PR but not blocking):**
- Website Blocker matrix (iOS, Android, Desktop, Cross-Platform)
- UI Playwright Smoke
- Live Surface Audit
- Database Security Check
- Cloud Live E2E
- End-to-End Validation
- All Tests Passed (composite)

Rationale: blocking checks are deterministic and fast. Informational checks have flake history (mobile sim boots, browser headless) and currently force re-runs on flakes.

### Phase 5 — agent-release.yml restructure

Split into:
- `.github/workflows/release-validate.yml` — runs Phase A on every PR
- `.github/workflows/release-build.yml` — runs Phase B on tag push
- `.github/workflows/release-publish.yml` — runs Phase C on manual dispatch with environment approval

Each phase:
- Uses `actions/upload-artifact@v4` with retention 7 days
- Downstream phases use `actions/download-artifact@v4`
- No rebuild between phases

### Phase 6 — Depot mirror cleanup

Already largely done in PR #1989. Remaining:
- Remove `.depot/workflows/` mirrors that don't add value (lint, typecheck, fast jobs)
- Keep mirrors for: `build-docker.yml`, `build-cloud-image.yml`, `nightly.yml`, `benchmark-tests.yml`
- Document the regeneration policy in `docs/ci-depot.md` (done in PR #1989)

---

## Risks & rollback

| Phase | Risk | Mitigation |
|---|---|---|
| 1 (TS pin) | Hidden API differences between TS 5.9 and 6.0 break a transitive package | Single PR, full CI run, revert by changing one line |
| 2 (install path) | Published mode misses a transitive dep we didn't catch | Keep old shell script for one release cycle, gated by env flag |
| 3 (plugin builds) | Slow cold builds | Cache `dist/` in CI via actions/cache |
| 4 (check tiering) | Real regressions slip through informational tier | Add weekly informational-tier audit job that fails loudly if any informational check has been red >24h |
| 5 (release split) | Tag-push triggers don't fire on existing tags | Document one-time republish procedure for in-flight releases |
| 6 (Depot) | Already done; no new risk | — |

---

## Sequencing

Each phase is one PR. Land in order; do not stack until previous is on develop.

1. **PR A (Phase 1)** — TS single pin. Small, fast feedback.
2. **PR B (Phase 4)** — Branch protection tier change. Reversible via GitHub UI.
3. **PR C (Phase 3)** — Plugin pre-build phase. Self-contained.
4. **PR D (Phase 2)** — `repo-install.mjs`. Largest blast radius — land last among substrate changes.
5. **PR E (Phase 5)** — Release workflow split. Depends on A-D being stable.

Estimated total: 4-6 hours focused work, spread across multiple sessions to allow each PR to bake on develop.

---

## Out of scope

- Migrating to Turborepo/Nx (would be bigger overhaul; current setup works once substrate is fixed)
- Replacing Vitest with another runner
- Moving away from Bun (Bun-specific patches like `patch-deps.mjs` are an annoyance but not a CI blocker)
- Replacing the eliza submodule with a monorepo merge
