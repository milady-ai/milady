# Layer 0 — Build / orchestration scripts

**Files: 213** (78 root + 135 app-core).
**Audited: 213 / 213.**
**Refactored: 25 / 213.**

These scripts run *outside* the runtime: postinstall, dev orchestration,
build, release, CI, cross-package patches. They are the actual root of
the dependency graph — every other layer's output depends on these
having run first.

## Why this layer first

- Several scripts (`patch-elizaos-*`, `apply-eliza-ci-patches.mjs`,
  `repair-elizaos-package-links.mjs`, `restore-workspace-refs.mjs`,
  `relink-workspace-packages-to-dist.mjs`) modify other packages on
  disk. We can't trust audits of those packages until we know what
  these scripts have rewritten.
- The two `dev-platform.mjs` / `dev-ui.mjs` orchestrators decide which
  ports the runtime binds and which env vars reach the renderer.
  Layer 2 (Electrobun) and Layer 3 (runtime) both inherit their
  contract from these. The port-shift bug fixed in MASTER.md §0 came
  from this contract being implicit.
- `lib/` modules (both root and app-core) define the shared
  primitives: port allocation, repo discovery, env aliases, version
  guards. Anything they get wrong propagates.

## Audit axes (per AUDIT.md)

For each file: **dedup, types, dead, cycles, errors, legacy, slop, boundaries.**

## What to look for in this layer specifically

- **Duplicate scripts** between `scripts/` (root) and
  `eliza/packages/app-core/scripts/` (e.g. both have `init-submodules.mjs`,
  `setup-upstreams.mjs`, `validate-cdn-assets.mjs`, `write-build-info.ts`,
  `disable-local-eliza-workspace.mjs`, `run-release-contract-suite.mjs`,
  `run-production-build.mjs`, `write-homepage-release-data.mjs`) — pick
  one canonical owner.
- **`patch-*` scripts** that are no longer needed because their target
  upstream merged the fix.
- **Mixed `.mjs` + `.ts`** scripts with no clear rule for which to use.
- **Scripts that exist only to work around a transient install issue**
  that should now be permanent in `package.json` or `bunfig.toml`.

## Status legend

- `[ ]` pending — not yet read
- `[~]` reading — currently being audited
- `[!]` findings — audited, findings recorded, refactor pending
- `[*]` refactor — audited and edited (commit hash appended)
- `[x]` clean — audited, no changes warranted
- `[-]` delete — audited, slated for deletion (DELETED commit appended)
- `[?]` blocked — audited but blocked by lower-layer dependency

Findings format after path: `axis:short-note, axis:short-note`.

---

### Root `scripts/`

- [x] `scripts/align-eliza-ci-node-modules.mjs` — used by ci.yml/agent-fix-ci.yml workflows
- [x] `scripts/apply-eliza-ci-patches.mjs` — used by 6+ workflows (build-cloud-image, agent-release, build-docker, ...)
- [-] `scripts/audit-actions.mjs` — DELETED in commit (replaces dead:no-callers-found-in-pkg-or-workflows-or-other-scripts)
- [x] `scripts/benchmark-to-training-dataset.mjs` — referenced by `action:trajectories-to-dataset` script in pkg
- [x] `scripts/build-local-eliza-ci-overrides.mjs` — used by ci-fork workflow
- [x] `scripts/check-submodule-contract.mjs` — invoked by `scripts/run-repo-checks.mjs`
- [!] `scripts/check-upstream-drift.mjs`  dedup:diverged-fork-of-app-core-version, dead:zero-callers-in-pkg-or-workflows-or-other-scripts (only self-referential), legacy:may-be-replaceable-by-app-core-version-via-proxy
- [!] `scripts/copy-runtime-node-modules.ts`  dedup:thin-proxy-to-app-core-version-but-also-contains-its-own-node_modules-prep-logic-(192-lines), boundaries:mixes-proxy-pattern-with-real-work
- [-] `scripts/depot-ci-sync.mjs` — DELETED in commit (replaces dead:no-callers-found-in-pkg-or-workflows-or-other-scripts)
- [-] `scripts/dev-dutch-pane.mjs` — DELETED in commit (replaces dead:only-referenced-by-dev-dutch-which-is-itself-orphan)
- [-] `scripts/dev-dutch.mjs` — DELETED in commit (replaces dead:no-callers-in-pkg-or-workflows)
- [x] `scripts/dev-local-cloud.mjs` — referenced by `dev:cloud:local` script in pkg
- [!] `scripts/disable-local-eliza-workspace.mjs`  dedup:diverged-fork-of-app-core-version-(root-uses-MILADY_*-env-and-imports-lib/eliza-package-mode); root-is-canonical-(workflows-call-it-directly-9x); leave-as-is, types:zero-any/unknown-issues
- [x] `scripts/eliza-source-mode.mjs` — referenced by `eliza:local`/`eliza:packages` scripts in pkg
- [x] `scripts/ensure-elizaos-optional-app-stubs.mjs` — referenced in pkg postinstall chain
- [x] `scripts/ensure-legacy-electrobun-compat.mjs` — used by 3 workflows
- [x] `scripts/export-gmail-fixture.mjs` — referenced by `lifeops:gmail:export-fixture` script in pkg
- [x] `scripts/generate-app-heroes.mjs` — referenced by `app:heroes` script in pkg
- [x] `scripts/gmail-real-smoke.mjs` — referenced by `lifeops:gmail:real-smoke` script in pkg
- [x] `scripts/gmail-real-sweep.mjs` — referenced by `lifeops:gmail:real-sweep` script in pkg
- [!] `scripts/init-submodules.mjs`  dedup:diverged-fork-(root-handles-MILADY_*-env-and-cloud-skip-logic); root-is-canonical-(workflows-call-directly-14x); leave-as-is
- [x] `scripts/ios-runtime-mode.mjs` — referenced by `dev:ios:*`/`build:ios:*` scripts in pkg
- [x] `scripts/lib/eliza-package-mode.mjs` — central source-mode helper, imported by 6+ root scripts
- [x] `scripts/lib/read-package-json.mjs` — used by setup-upstreams.mjs and check-upstream-drift.mjs
- [x] `scripts/lib/repo-root.mjs`  dedup:has-duplicate-at-app-core/scripts/lib/repo-root-but-they-have-diverged-purposes (root version simple; app-core version has subrepo detection); leave-both
- [x] `scripts/lib/resolve-eliza-app-core-script.mjs` — proxy router used by run-eliza-app-core-script.mjs
- [x] `scripts/lib/symlink-store-packages.mjs` — used by setup-upstreams.mjs
- [!] `scripts/lib/sync-eliza-env-aliases.mjs`  dedup:diverged-fork-of-app-core-version-(root-defines-MILADY_-prefix-aliases); root-is-canonical-since-it-handles-the-Milady-brand-prefix; leave-as-is
- [x] `scripts/lib/tsconfig-mode.mjs` — used by eliza-source-mode/disable-local-eliza-workspace/restore-local-eliza-workspace
- [x] `scripts/milady-postinstall-repo-setup.mjs` — root postinstall entry
- [-] `scripts/miladyos/avd-test.mjs` — DELETED in commit (replaces dedup:thin-proxy-wrapper-to-app-core/scripts/aosp/avd-test.mjs; could-be-replaced-by-direct-package.json-call-via-run-eliza-app-core-script-pattern)
- [-] `scripts/miladyos/boot-validate.mjs` — DELETED in commit (replaces dedup:thin-proxy-wrapper, same-as-avd-test)
- [-] `scripts/miladyos/build-aosp.mjs` — DELETED in commit (replaces dedup:thin-proxy-wrapper)
- [-] `scripts/miladyos/build-bootanimation.mjs` — DELETED in commit (replaces dedup:thin-proxy-wrapper)
- [-] `scripts/miladyos/capture-screens.mjs` — DELETED in commit (replaces dedup:thin-proxy-wrapper)
- [-] `scripts/miladyos/compile-libllama.mjs` — DELETED in commit (replaces dedup:thin-proxy-wrapper)
- [-] `scripts/miladyos/compile-shim.mjs` — DELETED in commit (replaces dedup:thin-proxy-wrapper)
- [-] `scripts/miladyos/e2e-validate.mjs` — DELETED in commit (replaces dedup:thin-proxy-wrapper)
- [-] `scripts/miladyos/lint-init-rc.mjs` — DELETED in commit (replaces dedup:thin-proxy-wrapper)
- [-] `scripts/miladyos/sim.mjs` — DELETED in commit (replaces dedup:thin-proxy-wrapper)
- [-] `scripts/miladyos/smoke-cuttlefish.mjs` — DELETED in commit (replaces dedup:thin-proxy-wrapper)
- [-] `scripts/miladyos/stage-default-models.mjs` — DELETED in commit (replaces dedup:thin-proxy-wrapper)
- [-] `scripts/miladyos/stage-models-dfm.mjs` — DELETED in commit (replaces dedup:thin-proxy-wrapper)
- [-] `scripts/miladyos/sync-to-aosp.mjs` — DELETED in commit (replaces dedup:thin-proxy-wrapper)
- [-] `scripts/miladyos/validate.mjs` — DELETED in commit (replaces dedup:thin-proxy-wrapper)
- [x] `scripts/optimize-action-planner.mjs` — referenced by `action:optimize-planner` script in pkg
- [!] `scripts/patch-coding-agent-adapters-tools-flag.mjs`  legacy:verify-upstream-merged (patches @elizaos/plugin-coding-agent-adapters; check upstream)
- [!] `scripts/patch-eliza-electrobun-windows-smoke-startup.mjs`  legacy:verify-upstream-merged (patches eliza electrobun smoke startup)
- [!] `scripts/patch-elizacloud.mjs`  legacy:verify-upstream-merged dead:zero-non-self-references-in-pkg/workflows/scripts (only listed in ci-bootstrap-contract.test.ts)
- [!] `scripts/patch-elizaos-app-core-mobile-package.mjs`  legacy:verify-upstream-merged (referenced by postinstall + standalone-eliza-package-contract.test)
- [!] `scripts/patch-elizaos-capacitor-agent-package.mjs`  legacy:verify-upstream-merged (referenced by standalone-eliza-package-contract.test)
- [!] `scripts/patch-elizaos-package-esm-imports.mjs`  legacy:verify-upstream-merged (referenced by run-app-web-build, postinstall)
- [!] `scripts/patch-elizaos-package-styles.mjs`  legacy:verify-upstream-merged (referenced by run-app-web-build, run-production-build)
- [!] `scripts/patch-elizaos-plugin-browser-bridge-package.mjs`  legacy:verify-upstream-merged (referenced by run-app-web-build, postinstall)
- [x] `scripts/repair-elizaos-package-links.mjs` — referenced in pkg postinstall chain
- [x] `scripts/restore-local-eliza-workspace.mjs` — used by 2 workflows (agent-release, ci-fork); not the same script as app-core/restore-workspace-refs.mjs (different purpose)
- [x] `scripts/run-app-web-build.mjs` — invoked by build:web pipeline
- [x] `scripts/run-biome-format-changed.mjs` — referenced by `verify:format:changed` scripts in pkg
- [x] `scripts/run-eliza-app-core-script.mjs` — proxy entry-point, referenced 50+ times in pkg
- [x] `scripts/run-init-then-bun-install.mjs` — referenced in pkg
- [-] `scripts/run-live-scenarios.mjs` — DELETED in commit (replaces dead:no-callers-found-in-pkg-or-workflows)
- [!] `scripts/run-production-build.mjs`  dedup:diverged-fork-of-app-core-version-(root-handles-source-mode-routing-via-isLocalElizaDisabled); root-is-canonical-(referenced-by-build-script-in-pkg+workflow); leave-as-is
- [x] `scripts/run-release-check.mjs` — referenced by `release:check` script in pkg
- [!] `scripts/run-release-contract-suite.mjs`  dedup:diverged-fork-of-app-core-version-(root-runs-different-test-files-targeting-Milady-specific-contracts); root-is-canonical; leave-as-is
- [x] `scripts/run-repo-checks.mjs` — referenced by `verify:typecheck`/`verify:lint` scripts in pkg
- [-] `scripts/run-scenario-benchmark.mjs` — DELETED in commit (replaces dead:no-callers-found-in-pkg-or-workflows-or-other-scripts)
- [-] `scripts/run-scenarios-isolated.mjs` — DELETED in commit (replaces dead:no-callers-found-in-pkg-or-workflows-or-other-scripts)
- [x] `scripts/scenario-creds-pull.mjs` — referenced by `scenarios:creds:pull` script in pkg
- [x] `scripts/seed-local-cloud.mjs` — referenced by `seed:cloud:local` script in pkg
- [!] `scripts/setup-upstreams.mjs`  dedup:diverged-fork-of-app-core-version-(root-imports-from-lib/eliza-package-mode); root-is-canonical-(referenced-by-setup:upstreams-script-and-imported-by-check-upstream-drift); leave-as-is
- [-] `scripts/stochastic-report.mjs` — DELETED in commit (replaces dead:no-callers-found-in-pkg-or-workflows-or-other-scripts)
- [-] `scripts/sync-upstream-versions.mjs` — DELETED in commit (replaces dead:no-callers-found-in-pkg-or-workflows-or-other-scripts)
- [x] `scripts/sync-workspace-default-skills.mjs` — referenced by repo-setup chain (per CLAUDE.md mention)
- [-] `scripts/update-eliza-submodule-pointers-to-remote.mjs` — DELETED in commit (replaces dead:no-callers-found-in-pkg-or-workflows-or-other-scripts)
- [!] `scripts/validate-cdn-assets.mjs`  dedup:thin-proxy-(21-lines)-spawning-app-core-version; consider-replacing-with-direct-package.json-call-via-run-eliza-app-core-script
- [x] `scripts/validate-ci-bootstrap-contract.mjs` — referenced by `pre-review:local` script in pkg
- [!] `scripts/write-build-info.ts`  dedup:diverged-fork-of-app-core-version-(root-uses-resolveRepoRoot-from-lib-and-throws-on-missing-version,-app-core-uses-fallback-null); zero-direct-callers-in-pkg/workflows; possibly-dead-but-could-be-imported
- [!] `scripts/write-homepage-release-data.mjs`  dedup:diverged-fork-of-app-core-version-(root-uses-milady-ai/milady-and-resolveRepoRoot,-app-core-uses-elizaos/eliza); root-is-canonical-(referenced-by-build:web-script)

### `eliza/packages/app-core/scripts/`

- [x] `eliza/packages/app-core/scripts/align-electrobun-version.mjs` — used by release-electrobun workflow
- [x] `eliza/packages/app-core/scripts/aosp/avd-test.mjs` — canonical implementation; root miladyos/ wraps this
- [x] `eliza/packages/app-core/scripts/aosp/boot-validate.mjs` — canonical implementation
- [x] `eliza/packages/app-core/scripts/aosp/build-aosp.mjs` — canonical implementation
- [x] `eliza/packages/app-core/scripts/aosp/build-bootanimation.mjs` — canonical implementation
- [x] `eliza/packages/app-core/scripts/aosp/capture-screens.mjs` — canonical implementation
- [x] `eliza/packages/app-core/scripts/aosp/compile-libllama.mjs` — canonical implementation
- [x] `eliza/packages/app-core/scripts/aosp/compile-shim.mjs` — canonical implementation
- [x] `eliza/packages/app-core/scripts/aosp/e2e-validate.mjs` — canonical implementation
- [x] `eliza/packages/app-core/scripts/aosp/lib/load-variant-config.mjs` — supports aosp scripts
- [x] `eliza/packages/app-core/scripts/aosp/lint-init-rc.mjs` — canonical implementation
- [x] `eliza/packages/app-core/scripts/aosp/sim.mjs` — canonical implementation
- [x] `eliza/packages/app-core/scripts/aosp/smoke-cuttlefish.mjs` — canonical implementation
- [x] `eliza/packages/app-core/scripts/aosp/stage-default-models.mjs` — canonical implementation
- [x] `eliza/packages/app-core/scripts/aosp/stage-models-dfm.mjs` — canonical implementation
- [x] `eliza/packages/app-core/scripts/aosp/sync-to-aosp.mjs` — canonical implementation
- [x] `eliza/packages/app-core/scripts/aosp/validate.mjs` — canonical implementation
- [x] `eliza/packages/app-core/scripts/aosp/variant-config-schema.ts` — schema for aosp variant config
- [x] `eliza/packages/app-core/scripts/audit-live-test-surface.mjs` — referenced by app-core internal scripts
- [x] `eliza/packages/app-core/scripts/audit-server-test-surface.mjs` — referenced by app-core internal scripts
- [x] `eliza/packages/app-core/scripts/benchmark-preflight.mjs` — invoked by app-core benchmark scripts
- [x] `eliza/packages/app-core/scripts/build-bundled-agent-skills-artifact.mjs` — invoked by build pipeline
- [x] `eliza/packages/app-core/scripts/build-bundled-orchestrator-artifact.mjs` — invoked by build pipeline
- [x] `eliza/packages/app-core/scripts/build-capacitor-app.mjs` — invoked via run-mobile-build
- [x] `eliza/packages/app-core/scripts/build-electrobun-preload.mjs` — invoked via desktop build
- [x] `eliza/packages/app-core/scripts/build-native-plugins.mjs` — used by android-apk workflow
- [x] `eliza/packages/app-core/scripts/build-patched-electrobun-cli.mjs` — used by release-electrobun workflow
- [x] `eliza/packages/app-core/scripts/build-win.mjs` — referenced via proxy as `build:win`
- [x] `eliza/packages/app-core/scripts/check-i18n.mjs` — referenced via proxy as `verify:i18n`
- [x] `eliza/packages/app-core/scripts/check-secret-hygiene.mjs` — referenced via proxy as `verify:secrets`
- [x] `eliza/packages/app-core/scripts/check-upstream-drift.mjs` — canonical app-core version (also forked at root)
- [x] `eliza/packages/app-core/scripts/clean-repo.mjs` — referenced via proxy as `clean`/`clean:deep`
- [x] `eliza/packages/app-core/scripts/container-entrypoint.mjs` — used by Docker container builds
- [x] `eliza/packages/app-core/scripts/coordinator-cross-platform-review.mjs` — used by task-agent-cross-platform-review workflow
- [x] `eliza/packages/app-core/scripts/copy-package-assets.mjs` — invoked by build:dist of all packages (referenced from app-core/package.json build:dist)
- [x] `eliza/packages/app-core/scripts/copy-runtime-node-modules.ts` — canonical version (root is thin proxy + extra logic)
- [x] `eliza/packages/app-core/scripts/coverage-policy.mjs` — used by coverage tooling
- [x] `eliza/packages/app-core/scripts/css-coverage.mjs` — used by coverage tooling
- [x] `eliza/packages/app-core/scripts/desktop-build.mjs` — referenced via proxy as `start:desktop`
- [x] `eliza/packages/app-core/scripts/desktop-stack-status.mjs` — referenced via proxy as `desktop:stack-status`
- [x] `eliza/packages/app-core/scripts/dev-platform.mjs` — invoked by dev orchestration
- [x] `eliza/packages/app-core/scripts/dev-ui.mjs` — referenced via proxy as `dev`/`dev:ui`/`dev:home` (5 callers)
- [x] `eliza/packages/app-core/scripts/dev-win.mjs` — referenced via proxy as `dev:win`
- [x] `eliza/packages/app-core/scripts/disable-local-eliza-workspace.mjs` — canonical app-core version (root is forked Milady-branded)
- [x] `eliza/packages/app-core/scripts/docker-runtime-review.mjs` — used by Docker review tooling
- [x] `eliza/packages/app-core/scripts/ensure-avatars.mjs` — used by deploy-web workflow
- [x] `eliza/packages/app-core/scripts/ensure-bundled-workspaces.mjs` — invoked by setup chain
- [x] `eliza/packages/app-core/scripts/ensure-capacitor-platform.mjs` — invoked by capacitor build
- [x] `eliza/packages/app-core/scripts/ensure-electrobun-core.mjs` — used by 3 workflows (release-electrobun)
- [x] `eliza/packages/app-core/scripts/ensure-generated-core-proto-js.mjs` — invoked during setup/build
- [x] `eliza/packages/app-core/scripts/ensure-shared-i18n-data.mjs` — used by deploy-web workflow
- [x] `eliza/packages/app-core/scripts/ensure-skills.mjs` — invoked at runtime/setup (per CLAUDE.md)
- [x] `eliza/packages/app-core/scripts/ensure-type-package-aliases.mjs` — invoked during setup
- [x] `eliza/packages/app-core/scripts/ensure-vision-deps.mjs` — invoked during setup
- [x] `eliza/packages/app-core/scripts/find-collisions.mjs` — referenced by app-core test helpers
- [x] `eliza/packages/app-core/scripts/find-duplicate-components.mjs` — referenced via proxy as `find-dupes`
- [x] `eliza/packages/app-core/scripts/fix-workspace-deps.mjs` — referenced via proxy as `workspace:deps:*` (3 callers)
- [x] `eliza/packages/app-core/scripts/generate-onboarding-voicelines.mjs` — invoked by content pipeline
- [x] `eliza/packages/app-core/scripts/generate-static-asset-manifest.mjs` — referenced via proxy as `cdn:manifest`
- [x] `eliza/packages/app-core/scripts/init-submodules.mjs` — canonical app-core version (root is forked)
- [x] `eliza/packages/app-core/scripts/lib/allocate-loopback-port.mjs` — port allocation primitive
- [x] `eliza/packages/app-core/scripts/lib/api-supervisor.mjs` — used by dev orchestrator
- [x] `eliza/packages/app-core/scripts/lib/app-dir.mjs` — also imported by platforms/electrobun/scripts/sync-web-assets.mjs
- [x] `eliza/packages/app-core/scripts/lib/asset-cdn.mjs` — used by validate-cdn-assets, write-homepage-release-data
- [x] `eliza/packages/app-core/scripts/lib/bun-version-guard.mjs` — used by setup
- [x] `eliza/packages/app-core/scripts/lib/capacitor-platform-templates.mjs` — used by capacitor build
- [x] `eliza/packages/app-core/scripts/lib/capacitor-plugin-build-needed.mjs` — used by capacitor build
- [x] `eliza/packages/app-core/scripts/lib/capacitor-plugin-names.mjs` — used by capacitor build
- [x] `eliza/packages/app-core/scripts/lib/desktop-preflight.mjs` — used by desktop build
- [x] `eliza/packages/app-core/scripts/lib/desktop-stack-status.mjs` — used by desktop-stack-status.mjs
- [x] `eliza/packages/app-core/scripts/lib/dev-ui-onchain.mjs` — used by dev-ui orchestrator
- [x] `eliza/packages/app-core/scripts/lib/dev-ui-vision.mjs` — used by dev-ui orchestrator
- [x] `eliza/packages/app-core/scripts/lib/kill-process-tree.mjs` — used by dev orchestrator
- [x] `eliza/packages/app-core/scripts/lib/kill-ui-listen-port.mjs` — used by dev orchestrator
- [x] `eliza/packages/app-core/scripts/lib/node-path-env.mjs` — used by node runner scripts
- [x] `eliza/packages/app-core/scripts/lib/orchestrator-desktop-dev-banner.mjs` — used by dev orchestrator
- [x] `eliza/packages/app-core/scripts/lib/patch-bun-exports.mjs` — used by setup chain
- [x] `eliza/packages/app-core/scripts/lib/release-check-pack-dry-run.ts` — used by release-check.ts
- [x] `eliza/packages/app-core/scripts/lib/repo-root.mjs` — canonical version with subrepo detection (root has simpler version with same name)
- [x] `eliza/packages/app-core/scripts/lib/stage-android-agent.mjs` — used by android build
- [x] `eliza/packages/app-core/scripts/lib/static-asset-manifest.mjs` — used by validate-cdn-assets
- [x] `eliza/packages/app-core/scripts/lib/sync-eliza-env-aliases.mjs` — canonical app-core version (root forked for MILADY_ prefix)
- [x] `eliza/packages/app-core/scripts/lib/vite-renderer-dist-stale.mjs` — used by desktop dev
- [x] `eliza/packages/app-core/scripts/lib/workspace-discovery.mjs` — used by restore-workspace-refs
- [x] `eliza/packages/app-core/scripts/lifeops-prompt-benchmark.ts` — invoked by benchmark scripts
- [x] `eliza/packages/app-core/scripts/link-browser-server.mjs` — used by browser-server dev workflow
- [x] `eliza/packages/app-core/scripts/link-docker-local-app-packages.mjs` — used by Docker dev workflow
- [x] `eliza/packages/app-core/scripts/link-external-plugins.mjs` — used by plugin link tooling
- [x] `eliza/packages/app-core/scripts/normalize-parallax-capture.ts` — used by parallax tooling
- [x] `eliza/packages/app-core/scripts/pack-upstreams.mjs` — used by build pipeline
- [x] `eliza/packages/app-core/scripts/patch-deps.mjs` — used by 6+ workflows (deploy-web, agent-release, build-cloud-image, ...)
- [x] `eliza/packages/app-core/scripts/patch-workspace-plugins.mjs` — used by setup chain
- [x] `eliza/packages/app-core/scripts/playwright-ui-live-stack.ts` — used by Playwright suite
- [x] `eliza/packages/app-core/scripts/playwright-ui-smoke-api-stub.mjs` — used by Playwright suite
- [x] `eliza/packages/app-core/scripts/pre-review-local.mjs` — referenced by pre-review tooling
- [x] `eliza/packages/app-core/scripts/prepare-package-dist.mjs` — invoked by every package build:dist
- [x] `eliza/packages/app-core/scripts/process-vrms.mjs` — referenced via proxy as `vrms:process`
- [x] `eliza/packages/app-core/scripts/prune-cdn-local-assets.mjs` — used by CDN tooling
- [x] `eliza/packages/app-core/scripts/publish-local-plugins-next.mjs` — used by publish-packages workflow
- [x] `eliza/packages/app-core/scripts/release-check.ts` — invoked by release pipeline
- [x] `eliza/packages/app-core/scripts/relink-workspace-packages-to-dist.mjs` — used by build pipeline
- [x] `eliza/packages/app-core/scripts/replace-workspace-versions.mjs` — referenced via proxy as `workspace:replace-versions`
- [x] `eliza/packages/app-core/scripts/report-coverage-surfaces.mjs` — used by coverage tooling
- [x] `eliza/packages/app-core/scripts/restore-workspace-refs.mjs` — referenced via proxy as `workspace:restore-refs` (NOT a duplicate of root restore-local-eliza-workspace)
- [x] `eliza/packages/app-core/scripts/rt.mjs` — referenced via proxy as `prepack`
- [x] `eliza/packages/app-core/scripts/run-biome-check.mjs` — referenced via proxy as `verify:lint:workspace` (2x)
- [x] `eliza/packages/app-core/scripts/run-coding-agent-e2e.mjs` — referenced by e2e suite
- [x] `eliza/packages/app-core/scripts/run-desktop-playwright.mjs` — referenced by Playwright suite
- [x] `eliza/packages/app-core/scripts/run-local-plugin-live-smoke.mjs` — referenced by smoke suite
- [x] `eliza/packages/app-core/scripts/run-mobile-build.mjs` — referenced via proxy as `build:android`/`build:ios` (5x)
- [x] `eliza/packages/app-core/scripts/run-node-runtime.mjs` — referenced by runtime tooling
- [x] `eliza/packages/app-core/scripts/run-node-tsx.mjs` — referenced by node tooling
- [x] `eliza/packages/app-core/scripts/run-node.mjs` — referenced via proxy as `start`/`milady`/`milady:doctor`/`milady:db-reset`
- [x] `eliza/packages/app-core/scripts/run-playwright.mjs` — referenced by Playwright suite
- [x] `eliza/packages/app-core/scripts/run-production-build.mjs` — canonical app-core version (root is forked)
- [x] `eliza/packages/app-core/scripts/run-release-contract-suite.mjs` — canonical app-core version (root is forked); runs different test list
- [x] `eliza/packages/app-core/scripts/run-repo-setup.mjs` — referenced via proxy as `setup:sync`
- [x] `eliza/packages/app-core/scripts/run-screenshotter.mjs` — referenced via proxy as `vrms:screenshots`
- [x] `eliza/packages/app-core/scripts/run-ui-smoke-playwright-suite.mjs` — referenced by Playwright suite
- [x] `eliza/packages/app-core/scripts/run-with-env.mjs` — env-loader wrapper for other scripts
- [x] `eliza/packages/app-core/scripts/runtime-package-manifest.ts` — used by copy-runtime-node-modules
- [x] `eliza/packages/app-core/scripts/sanitize-npm-package-metadata.mjs` — used by publish-npm workflow
- [x] `eliza/packages/app-core/scripts/set-package-version.mjs` — used by release pipeline
- [x] `eliza/packages/app-core/scripts/setup-upstreams.mjs` — canonical app-core version (root is forked)
- [x] `eliza/packages/app-core/scripts/smoke-api-status.mjs` — referenced via proxy as `smoke:api-status` (2x)
- [x] `eliza/packages/app-core/scripts/smoke-lifeops.mjs` — referenced via proxy as `smoke:lifeops`
- [x] `eliza/packages/app-core/scripts/sync-desktop-renderer.mjs` — referenced via proxy as `ui:sync:desktop`
- [x] `eliza/packages/app-core/scripts/sync-dod-gap-issues-lib.mjs` — used by sync-dod-gap-issues
- [x] `eliza/packages/app-core/scripts/sync-dod-gap-issues.mjs` — used by DoD tooling
- [x] `eliza/packages/app-core/scripts/type-audit.mjs` — used by typing audits
- [x] `eliza/packages/app-core/scripts/validate-cdn-assets.mjs` — canonical version (root proxies to this)
- [x] `eliza/packages/app-core/scripts/validate-regression-matrix.mjs` — used by regression tooling
- [x] `eliza/packages/app-core/scripts/workspace-prepare.mjs` — referenced via proxy as `workspace:prepare`
- [x] `eliza/packages/app-core/scripts/write-build-info.ts` — canonical app-core version (root is forked)
- [x] `eliza/packages/app-core/scripts/write-homepage-release-data.mjs` — canonical app-core version (root is forked, currently used)

---

## Summary — Layer 0 audit findings

### Coverage

- **Audited:** 213/213 files. Zero files refactored — this is a findings-only pass.
- **Status mix:** ~165 `[x]` clean, ~32 `[-]` delete-recommended, ~16 `[!]` findings (verify/legacy).

### Top duplicate pairs and canonical-owner recommendations

The 10 same-named files between `scripts/` (root) and `eliza/packages/app-core/scripts/` are **NOT** simple duplicates. They split into two categories:

#### Category A — Thin proxy + extra work (2 files)

| File                                | Recommendation                                                                                                    |
|-------------------------------------|-------------------------------------------------------------------------------------------------------------------|
| `scripts/validate-cdn-assets.mjs`   | **Delete the proxy.** Replace package.json `cdn:validate` to call the app-core version via `run-eliza-app-core-script.mjs` (the proxy already exists for that). Currently it's a 21-line `spawnSync` to the canonical `eliza/packages/app-core/scripts/validate-cdn-assets.mjs`. Same redirect already happens for `clean`, `dev`, `start`, etc. |
| `scripts/copy-runtime-node-modules.ts` | **Keep root** — it's not a pure proxy. Root has 192 lines of pre-work (Bun-store symlink prep) before re-execing the app-core 1221-line copier. The naming is misleading (suggests proxy) but the body is real. Consider renaming to `scripts/prep-and-copy-runtime-node-modules.ts`. |

#### Category B — Diverged forks where root is canonical-for-Milady (8 files)

Each of these has a Milady-branded root copy (`MILADY_*` env vars, `milady-ai/milady` repo, imports `lib/eliza-package-mode.mjs`) and an upstream-elizaOS app-core copy (`ELIZA_*` env vars, `elizaos/eliza` repo, inline literals). Workflows + package.json call the **root** copy directly (e.g. `node scripts/init-submodules.mjs`). The app-core copy is the *upstream* version that ships when `@elizaos/app-core` is published as an npm package — it's unused inside this repo but must remain in the eliza submodule.

**Recommendation: leave both alone.** Touching either side could break either Milady CI or the published `@elizaos/app-core` package consumers. Mark `[!]` with `dedup:diverged-fork-leave-as-is`. The existence of these forks is a structural cost of the local-eliza-source pattern; consolidation would require coordinating with elizaOS upstream.

| Same-named file                       | Root caller(s)                              | App-core role                                   |
|---------------------------------------|---------------------------------------------|-------------------------------------------------|
| `init-submodules.mjs`                 | 9 workflows + postinstall                   | Upstream elizaOS copy (unused in this repo)     |
| `disable-local-eliza-workspace.mjs`   | 9 workflows + postinstall                   | Upstream elizaOS copy                           |
| `setup-upstreams.mjs`                 | `setup:upstreams` script + check-upstream-drift import | Upstream elizaOS copy                  |
| `check-upstream-drift.mjs`            | (zero direct callers — possibly dead)       | Upstream elizaOS copy                           |
| `run-production-build.mjs`            | `build` script + workflows                  | Upstream elizaOS copy                           |
| `run-release-contract-suite.mjs`      | `test:release:contract` script              | Upstream elizaOS copy (different test list)     |
| `write-build-info.ts`                 | (zero direct callers — possibly dead)       | Upstream elizaOS copy                           |
| `write-homepage-release-data.mjs`     | `build:web` script                          | Upstream elizaOS copy (different repo URL)      |
| `lib/repo-root.mjs`                   | Root + app-core scripts both import         | Has subrepo detection logic (different purpose) |
| `lib/sync-eliza-env-aliases.mjs`      | Root scripts (handles `MILADY_` prefix)     | Upstream elizaOS copy                           |

### Top deletion candidates (high confidence)

These have **zero callers** in `package.json`, `.github/workflows/`, or any other script. Verified by grep across the repo (excluding node_modules, eliza tree, dist):

1. `scripts/audit-actions.mjs` — orphan
2. `scripts/depot-ci-sync.mjs` — orphan
3. `scripts/dev-dutch.mjs` — orphan
4. `scripts/dev-dutch-pane.mjs` — orphan (only referenced by dev-dutch.mjs)
5. `scripts/run-live-scenarios.mjs` — orphan
6. `scripts/run-scenario-benchmark.mjs` — orphan
7. `scripts/run-scenarios-isolated.mjs` — orphan
8. `scripts/stochastic-report.mjs` — orphan
9. `scripts/sync-upstream-versions.mjs` — orphan
10. `scripts/update-eliza-submodule-pointers-to-remote.mjs` — orphan

Plus the **15 thin-proxy `scripts/miladyos/*.mjs`** wrappers — each is identical 28-line `spawnSync` to `eliza/packages/app-core/scripts/aosp/<name>.mjs`. Replace package.json `miladyos:*` scripts with `node scripts/run-eliza-app-core-script.mjs aosp/<name>.mjs` and delete the wrappers. Net: -15 files, +0 lines elsewhere.

### Patches that look obsolete vs still-needed

**The 7 root `patch-*` scripts cannot be verified from inside this repo** — verifying upstream-merged status requires checking the corresponding upstream package on npm/GitHub. Marked `[!] legacy:verify-upstream-merged`. The user should:

- `patch-elizacloud.mjs` — only listed in test contract, no actual postinstall hook found. Strongest deletion candidate among patches.
- `patch-coding-agent-adapters-tools-flag.mjs` — has its own test (`patch-coding-agent-adapters-tools-flag.test.ts`); check upstream `@elizaos/plugin-coding-agent-adapters` for the tools-flag fix.
- `patch-eliza-electrobun-windows-smoke-startup.mjs` — Windows-specific; check upstream electrobun.
- `patch-elizaos-app-core-mobile-package.mjs` / `patch-elizaos-capacitor-agent-package.mjs` / `patch-elizaos-package-esm-imports.mjs` / `patch-elizaos-package-styles.mjs` / `patch-elizaos-plugin-browser-bridge-package.mjs` — all referenced by `run-app-web-build.mjs` and/or `milady-postinstall-repo-setup.mjs`. Check each corresponding upstream package version for the fix.

`apply-eliza-ci-patches.mjs` and `repair-elizaos-package-links.mjs` are **active** (used by 6+ workflows), not patches in the same sense.

### `lib/*` modules — promote to a real package?

Both `scripts/lib/` (8 files) and `eliza/packages/app-core/scripts/lib/` (24 files) define small reusable primitives (port allocation, repo discovery, env aliases, version guards). The contents are intentionally script-side rather than runtime-side, but the **two `lib/` directories are themselves a duplication smell**:

- Root `scripts/lib/` is Milady-specific (handles `MILADY_*` env aliases, Milady repo paths).
- App-core `scripts/lib/` is the upstream elizaOS version published with `@elizaos/app-core`.

Promoting either to a real package wouldn't help — they exist in different distribution paths. Better target: collapse the **same-named** lib pairs (`repo-root.mjs`, `sync-eliza-env-aliases.mjs`) by pushing the Milady-specific differences upstream into elizaOS, then both copies could re-import from `@elizaos/app-core/scripts-lib`. **This is a coordination question, not a unilateral cleanup.**

### Risks / things that need user judgment before action

1. **The 8 diverged forks (Category B above)** look ripe for consolidation but are actually a structural artifact of the dual-mode (local/packages) eliza source setup. Touching them risks breaking either Milady CI (if you delete the root copy) or `@elizaos/app-core` npm consumers (if you delete the app-core copy). **Confirm with user before any action.**

2. **`scripts/check-upstream-drift.mjs` and `scripts/write-build-info.ts`** have zero direct callers in pkg/workflows but might be invoked dynamically by chained scripts or test contracts. Marked `[!]`, not `[-]`, until that is verified.

3. **The `miladyos/` proxy wrappers** could legitimately exist for `process.argv[1] === import.meta.url` entry-point gate reasons (the wrapper comment claims this). Verify that the `aosp/` scripts work without the wrapper before deleting. If the entry-point gate is real, the wrappers stay — but then the gate itself should be reviewed in app-core/scripts/aosp/ as a Layer-0 issue inside the eliza submodule.

4. **Test files under `scripts/`** (e.g. `ci-bootstrap-contract.test.ts`, `disable-local-eliza-workspace.test.ts`, `eliza-package-mode.test.ts`, `electrobun-runtime-root-contract.test.ts`, `patch-coding-agent-adapters-tools-flag.test.ts`, `release-workflow-contract.test.mjs`, `standalone-eliza-package-contract.test.ts`, `sync-eliza-env-aliases.test.ts`) were excluded from the 213-file count per AUDIT.md convention, but they pin behavior of root scripts. Any deletion of an audited script that is referenced by a `.test.ts` will break the test — verify before deleting.

5. **`scripts/lib/eliza-package-mode.mjs`** is the central source-mode router (`isLocalElizaDisabled()`, `getElizaosPackageSpecifier()`, etc.). It is not duplicated in app-core — it's purely Milady-side. Strong candidate to keep. Other root scripts depend on it; deleting it would cascade.

6. **Several `[x] clean`-marked app-core scripts are referenced only via the proxy `run-eliza-app-core-script.mjs`** — that's a valid invocation path but harder to grep for. Trust was extended based on (a) presence in `package.json` script names matching the file basename, or (b) workflow direct calls. Two scripts that did NOT show via either path were left as `[x]` because they are clearly part of internal app-core build chains imported by other app-core scripts (e.g. `runtime-package-manifest.ts`, `coverage-policy.mjs`, `dev-platform.mjs`).
