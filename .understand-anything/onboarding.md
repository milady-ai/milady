# Milady Onboarding Guide

## Project Overview

Milady is represented in this graph as `miladyai`.
Milady is a personal AI assistant that is local-first by default and can also connect to Eliza Cloud or a remote self-hosted backend when you want hosted runtime access. Built on [elizaOS](https://github.com/elizaOS). Note: this project has over 100 source files; this graph scopes the embedded eliza checkout to Milady-relevant runtime, UI, agent, core, security, vault, local inference, and app/plugin management surfaces.

Languages: adoc, awk, batch, c, ci, cmake, comp, conf, config, cpp, css, cu, darwin-arm64-metal-fused, desktop, dockerfile, entitlements, example, glb, ....
Frameworks: React, Vite, Vitest, Tailwind CSS, Express, Three.js, Electrobun, Capacitor, Docker, Docker Compose, GitHub Actions.

## Architecture Layers

### Product Entry And Desktop Shell

Top-level Milady launcher, desktop renderer, packaged startup, and platform bootstrap code.

- `apps/app/scripts/android-local-mode-smoke.mjs` — android-local-mode-smoke.mjs is a javascript source file in the Milady codebase. It contains 9 functions.
- `apps/app/scripts/cloud-provisioning-e2e.mjs` — cloud-provisioning-e2e.mjs is a javascript source file in the Milady codebase. It contains 42 functions.
- `apps/app/src/elizaos-app-core-shim.d.ts` — elizaos-app-core-shim.d.ts is a typescript source file in the Milady codebase.
- `apps/app/src/main.tsx` — main.tsx is a typescript source file in the Milady codebase. It contains 50 functions, 8 imports.
- `apps/app/src/native-plugin-stubs.ts` — native-plugin-stubs.ts is a typescript source file in the Milady codebase. It contains 2 functions.
- `apps/app/src/optional-eliza-app-stub.tsx` — optional-eliza-app-stub.tsx is a typescript source file in the Milady codebase. It contains 29 functions.
- `apps/app/test/design-review/run-design-review.ts` — run-design-review.ts is a typescript source file in the Milady codebase. It contains 21 functions, 2 imports.
- `apps/app/test/electrobun-packaged/electrobun-packaged-regressions.e2e.spec.ts` — electrobun-packaged-regressions.e2e.spec.ts is a typescript source file in the Milady codebase. It contains 21 functions, 3 imports.

### Homepage And Docs Site

Public homepage, documentation site, release presentation, and web-facing product pages.

- `apps/homepage/public/vrms/shaw.vrm` — shaw.vrm is a vrm source file in the Milady codebase.
- `apps/homepage/src/components/dashboard/InstanceCard.tsx` — InstanceCard.tsx is a typescript source file in the Milady codebase. It contains 1 function, 3 imports.
- `apps/homepage/src/components/dashboard/InstanceGrid.tsx` — InstanceGrid.tsx is a typescript source file in the Milady codebase. It contains 3 functions, 3 imports.
- `apps/homepage/src/components/dashboard/ProvisionAgentModal.tsx` — ProvisionAgentModal.tsx is a typescript source file in the Milady codebase. It contains 2 functions, 1 imports.
- `apps/homepage/src/components/guides/GuidesLanding.tsx` — GuidesLanding.tsx is a typescript source file in the Milady codebase. It contains 3 functions.
- `apps/homepage/src/components/layout/Sidebar.tsx` — Sidebar.tsx is a typescript source file in the Milady codebase. It contains 5 functions, 3 imports.
- `apps/homepage/src/docs/registry.ts` — registry.ts is a typescript source file in the Milady codebase. It contains 2 functions.
- `apps/homepage/src/lib/AgentProvider.tsx` — AgentProvider.tsx is a typescript source file in the Milady codebase. It contains 16 functions, 4 imports.

### Runtime App Core

Embedded app-core runtime, API server, CLI entry, startup state, Electrobun platform integration, and runtime services.

- `eliza/packages/app-core/__tests__/voice/barge-in.test.ts` — barge-in.test.ts is a typescript source file in the Milady codebase. It contains 3 functions, 4 classes.
- `eliza/packages/app-core/deploy/cloud-agent-shared.ts` — cloud-agent-shared.ts is a typescript source file in the Milady codebase. It contains 2 functions.
- `eliza/packages/app-core/deploy/deploy-to-nodes.sh` — deploy-to-nodes.sh automates a Milady workspace, build, verification, or runtime task.
- `eliza/packages/app-core/deploy/Dockerfile.cloud` — Dockerfile.cloud defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.
- `eliza/packages/app-core/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/packaging/flatpak/node-sources.json` — node-sources.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/packaging/PUBLISHING_GUIDE.md` — PUBLISHING_GUIDE.md documents eliza/packages/app-core/packaging with 707 lines of reference material.
- `eliza/packages/app-core/packaging/snap/snapcraft.yaml` — snapcraft.yaml configures yaml settings for the Milady workspace or one of its embedded packages.

### Shared UI And First Run

Shared React UI package, shell components, first-run setup, voice/chat surfaces, state hooks, and frontend runtime adapters.

- `eliza/packages/ui/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/ui/src/api/android-native-agent-transport.test.ts` — android-native-agent-transport.test.ts is a typescript source file in the Milady codebase. It contains 1 function, 1 imports.
- `eliza/packages/ui/src/api/android-native-agent-transport.ts` — android-native-agent-transport.ts is a typescript source file in the Milady codebase. It contains 22 functions, 4 imports.
- `eliza/packages/ui/src/api/auth-client.ts` — auth-client.ts is a typescript source file in the Milady codebase. It contains 8 functions, 3 imports.
- `eliza/packages/ui/src/api/client-agent.training-models.test.ts` — client-agent.training-models.test.ts is a typescript source file in the Milady codebase. It contains 2 imports.
- `eliza/packages/ui/src/api/client-agent.ts` — client-agent.ts is a typescript source file in the Milady codebase. It contains 41 functions, 7 imports.
- `eliza/packages/ui/src/api/client-base.ts` — client-base.ts is a typescript source file in the Milady codebase. It contains 12 functions, 1 class, 14 imports.
- `eliza/packages/ui/src/api/client-chat.ts` — client-chat.ts is a typescript source file in the Milady codebase. It contains 18 functions, 4 imports.

### Agent Core And Shared Contracts

Eliza agent package, core runtime contracts, shared utilities, security, vault, and remote manifest types.

- `eliza/packages/agent/docs/capability-router-remote-plugins.md` — capability-router-remote-plugins.md documents eliza/packages/agent/docs with 1500 lines of reference material.
- `eliza/packages/agent/docs/e2b-capability-routing.md` — e2b-capability-routing.md documents eliza/packages/agent/docs with 313 lines of reference material.
- `eliza/packages/agent/docs/tee-agent-implementation-plan.md` — tee-agent-implementation-plan.md documents eliza/packages/agent/docs with 538 lines of reference material.
- `eliza/packages/agent/evidence/tee/full-stack-local-2026-05-20.json` — full-stack-local-2026-05-20.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/agent/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/agent/scripts/build-mobile-bundle.mjs` — build-mobile-bundle.mjs is a javascript source file in the Milady codebase. It contains 13 functions.
- `eliza/packages/agent/scripts/live-sandbox-smoke.ts` — live-sandbox-smoke.ts is a typescript source file in the Milady codebase. It contains 13 functions, 1 class, 2 imports.
- `eliza/packages/agent/scripts/tee-dstack-local-smoke.ts` — tee-dstack-local-smoke.ts is a typescript source file in the Milady codebase. It contains 12 functions, 1 class, 6 imports.

### Plugins Local Inference And App Management

Selected plugins for local inference, Eliza Cloud, agent skills, app control, app manager, registry, browser, and coding tools.

- `eliza/plugins/plugin-agent-skills/README.md` — README.md documents eliza/plugins/plugin-agent-skills with 316 lines of reference material.
- `eliza/plugins/plugin-agent-skills/src/actions/search-skills.ts` — search-skills.ts is a typescript source file in the Milady codebase. It contains 3 functions, 3 imports.
- `eliza/plugins/plugin-agent-skills/src/actions/use-skill.test.ts` — use-skill.test.ts is a typescript source file in the Milady codebase. It contains 1 imports.
- `eliza/plugins/plugin-agent-skills/src/actions/use-skill.ts` — use-skill.ts is a typescript source file in the Milady codebase. It contains 5 functions, 1 imports.
- `eliza/plugins/plugin-agent-skills/src/api/curated-skills-routes.ts` — curated-skills-routes.ts is a typescript source file in the Milady codebase. It contains 9 functions.
- `eliza/plugins/plugin-agent-skills/src/api/skill-discovery-helpers.ts` — skill-discovery-helpers.ts is a typescript source file in the Milady codebase. It contains 12 functions, 1 imports.
- `eliza/plugins/plugin-agent-skills/src/api/skills-routes.ts` — skills-routes.ts is a typescript source file in the Milady codebase. It contains 12 functions, 2 imports.
- `eliza/plugins/plugin-agent-skills/src/parser.ts` — parser.ts is a typescript source file in the Milady codebase. It contains 11 functions, 1 imports.

### Mobile Native And Platform Packaging

Native mobile/platform packaging, iOS/Android smoke tooling, OS integration docs, and platform assets.

- `native/ios-bun-port/BRIDGE_CONTRACT.md` — BRIDGE_CONTRACT.md documents native/ios-bun-port with 278 lines of reference material.
- `native/ios-bun-port/models/download-first-light.sh` — download-first-light.sh automates a Milady workspace, build, verification, or runtime task.
- `native/ios-bun-port/polyfill/src/bun.ts` — bun.ts is a typescript source file in the Milady codebase. It contains 8 functions, 2 imports.
- `native/ios-bun-port/polyfill/src/modules/__tests__/pglite-shim-spec.md` — pglite-shim-spec.md documents native/ios-bun-port/polyfill/src/modules/__tests__ with 356 lines of reference material.
- `native/ios-bun-port/polyfill/src/modules/buffer.ts` — buffer.ts is a typescript source file in the Milady codebase. It contains 14 functions, 1 imports.
- `native/ios-bun-port/polyfill/src/modules/crypto.ts` — crypto.ts is a typescript source file in the Milady codebase. It contains 30 functions, 4 classes, 2 imports.
- `native/ios-bun-port/polyfill/src/modules/fs.ts` — fs.ts is a typescript source file in the Milady codebase. It contains 35 functions, 1 class, 3 imports.
- `native/ios-bun-port/polyfill/src/modules/http.ts` — http.ts is a typescript source file in the Milady codebase. It contains 5 functions, 5 classes, 4 imports.

### Build Scripts CI And Deployment

Repository scripts, CI/CD workflows, install/bootstrap tooling, deployment runbooks, and build configuration.

- `.github/actions/setup-bun-workspace/action.yml` — action.yml configures yaml settings for the Milady workspace or one of its embedded packages.
- `.github/TRUST_DESIGN.md` — TRUST_DESIGN.md documents .github with 315 lines of reference material.
- `.github/trust-scoring.cjs` — trust-scoring.cjs is a javascript source file in the Milady codebase. It contains 14 functions.
- `.github/trust-scoring.js` — trust-scoring.js is a javascript source file in the Milady codebase. It contains 12 functions.
- `.github/workflows/agent-fix-ci.yml` — agent-fix-ci.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.
- `.github/workflows/agent-implement.yml` — agent-implement.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.
- `.github/workflows/agent-release.yml` — agent-release.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.
- `.github/workflows/agent-review-apply-greptile-suggestions.yml` — agent-review-apply-greptile-suggestions.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.

### Governance Security And Reference Docs

Project documentation, policies, audits, checklists, agent guidance, QA notes, and security/privacy references.

- `.claude/plans/entity-model-analysis.md` — entity-model-analysis.md documents .claude/plans with 518 lines of reference material.
- `.claude/plans/system-permissions-implementation.md` — system-permissions-implementation.md documents .claude/plans with 865 lines of reference material.
- `.claude/plugins/electrobun-dev/commands/electrobun-align.md` — electrobun-align.md documents .claude/plugins/electrobun-dev/commands with 374 lines of reference material.
- `.claude/plugins/electrobun-dev/commands/electrobun-setup.md` — electrobun-setup.md documents .claude/plugins/electrobun-dev/commands with 1045 lines of reference material.
- `.claude/plugins/electrobun-dev/skills/electrobun-build/SKILL.md` — SKILL.md documents .claude/plugins/electrobun-dev/skills/electrobun-build with 330 lines of reference material.
- `.claude/plugins/electrobun-dev/skills/electrobun-platform/SKILL.md` — SKILL.md documents .claude/plugins/electrobun-dev/skills/electrobun-platform with 297 lines of reference material.
- `.claude/plugins/electrobun-dev/skills/electrobun-testing/SKILL.md` — SKILL.md documents .claude/plugins/electrobun-dev/skills/electrobun-testing with 294 lines of reference material.
- `AGENTS.md` — AGENTS.md documents the project with 321 lines of reference material.

### Templates Agent Packs And Examples

Reusable templates, archived agent packs, scaffold examples, and sample implementation material.

- `docs/agent-packs/electrobun-agentic-desktop-2026/agent-plugin.json` — agent-plugin.json configures json settings for the Milady workspace or one of its embedded packages.
- `docs/agent-packs/electrobun-agentic-desktop-2026/MANIFEST.txt` — MANIFEST.txt documents docs/agent-packs/electrobun-agentic-desktop-2026 with 124 lines of reference material.
- `docs/agent-packs/electrobun-agentic-desktop-2026/templates/electrobun/electrobun.config.ts` — electrobun.config.ts is a typescript source file in the Milady codebase. It contains 1 imports.
- `docs/agent-packs/electrobun-agentic-desktop-2026/templates/electrobun/src/shared/rpc.ts` — rpc.ts is a typescript source file in the Milady codebase. It contains 1 imports.
- `docs/agent-packs/electrobun-agentic-desktop-2026/templates/electrobun/src/shared/validation.ts` — validation.ts is a typescript source file in the Milady codebase. It contains 5 functions.
- `templates/electrobun/electrobun.config.ts` — electrobun.config.ts is a typescript source file in the Milady codebase. It contains 1 imports.
- `templates/electrobun/src/shared/rpc.ts` — rpc.ts is a typescript source file in the Milady codebase. It contains 1 imports.
- `templates/electrobun/src/shared/validation.ts` — validation.ts is a typescript source file in the Milady codebase. It contains 5 functions.

### Miscellaneous Source

Remaining source, configuration, and support files that do not fit a narrower architectural layer.

- `install.ps1` — install.ps1 automates a Milady workspace, build, verification, or runtime task.
- `plugins.json` — plugins.json configures json settings for the Milady workspace or one of its embedded packages.
- `skills/.defaults/discord/SKILL.md` — SKILL.md documents skills/.defaults/discord with 578 lines of reference material.
- `skills/.defaults/skill-creator/scripts/init_skill.py` — init_skill.py is a python source file in the Milady codebase. It contains 6 functions.
- `skills/.defaults/skill-creator/SKILL.md` — SKILL.md documents skills/.defaults/skill-creator with 370 lines of reference material.
- `upstreams.lock.json` — upstreams.lock.json configures json settings for the Milady workspace or one of its embedded packages.
- `.env.example` — .env.example configures config settings for the Milady workspace or one of its embedded packages.
- `.understand-anything/.understandignore` — .understandignore is a unknown source file in the Milady codebase.

## Key Concepts

- Local-first desktop bootstrap is split between top-level Milady app glue, Electrobun native runtime management, and app-core runtime startup.
- First-run setup is owned by the shared UI first-run controller and shell, while persistence and packaged startup live below the renderer boundary.
- The embedded eliza runtime is the source of truth for agent APIs, core contracts, local inference, and app/plugin management.
- The graph deliberately scopes the embedded eliza checkout to Milady-relevant surfaces so new contributors start with the owned product architecture.

## Guided Tour

### 1. Project Overview

Start with the product README, project guidance, and package manifest to understand Milady as a local-first elizaOS desktop/mobile assistant.

- `document:README.md` (README.md): README.md documents the project with 719 lines of reference material.
- `document:AGENTS.md` (AGENTS.md): AGENTS.md documents the project with 321 lines of reference material.
- `config:package.json` (package.json): package.json configures json settings for the Milady workspace or one of its embedded packages.

### 2. Top-Level Launch Path

Follow the Milady CLI and desktop renderer entry points to see how the wrapper starts and selects the branded app surface.

- `file:milady.mjs` (milady.mjs): milady.mjs is a javascript source file in the Milady codebase.
- `file:apps/app/src/main.tsx` (apps/app/src/main.tsx): main.tsx is a typescript source file in the Milady codebase. It contains 50 functions, 8 imports.
- `file:apps/app/src/character-catalog.ts` (apps/app/src/character-catalog.ts): character-catalog.ts is a typescript source file in the Milady codebase.

### 3. Packaged Desktop Bootstrap

Inspect the Electrobun native agent manager and packaged startup tests to understand how the desktop app starts the embedded runtime out of the box.

- `file:eliza/packages/app-core/platforms/electrobun/src/native/agent.ts` (eliza/packages/app-core/platforms/electrobun/src/native/agent.ts): agent.ts is a typescript source file in the Milady codebase. It contains 56 functions, 1 class, 10 imports.
- `file:apps/app/test/electrobun-packaged/windows-bootstrap.ts` (apps/app/test/electrobun-packaged/windows-bootstrap.ts): windows-bootstrap.ts is a typescript source file in the Milady codebase. It contains 4 functions.

### 4. First-Run And Onboarding Shell

Read the first-run shell, controller, flow contract, and QA docs to understand setup, state persistence, and first-run readiness.

- `file:eliza/packages/ui/src/components/shell/FirstRunShell.tsx` (eliza/packages/ui/src/components/shell/FirstRunShell.tsx): FirstRunShell.tsx is a typescript source file in the Milady codebase. It contains 10 functions, 2 imports.
- `file:eliza/packages/ui/src/first-run/use-first-run-controller.ts` (eliza/packages/ui/src/first-run/use-first-run-controller.ts): use-first-run-controller.ts is a typescript source file in the Milady codebase. It contains 12 functions, 13 imports.
- `file:eliza/packages/ui/src/first-run/first-run.ts` (eliza/packages/ui/src/first-run/first-run.ts): first-run.ts is a typescript source file in the Milady codebase. It contains 24 functions, 4 imports.
- `document:docs/first-run-contracts.md` (docs/first-run-contracts.md): first-run-contracts.md documents docs with 59 lines of reference material.

### 5. Runtime API And App Core

Trace app-core startup, runtime loading, and the agent API server that the desktop/web UI talks to.

- `file:eliza/packages/app-core/src/entry.ts` (eliza/packages/app-core/src/entry.ts): entry.ts is a typescript source file in the Milady codebase. It contains 2 imports.
- `file:eliza/packages/app-core/src/runtime/eliza.ts` (eliza/packages/app-core/src/runtime/eliza.ts): eliza.ts is a typescript source file in the Milady codebase. It contains 41 functions, 5 imports.
- `file:eliza/packages/agent/src/api/server.ts` (eliza/packages/agent/src/api/server.ts): server.ts is a typescript source file in the Milady codebase. It contains 49 functions, 86 imports.

### 6. Agent Core And Shared Contracts

Review core runtime types, shared contracts, and foundational runtime classes before changing behavior that crosses package boundaries.

- `file:eliza/packages/core/src/runtime.ts` (eliza/packages/core/src/runtime.ts): runtime.ts is a typescript source file in the Milady codebase. It contains 22 functions, 2 classes, 49 imports.
- `file:eliza/packages/core/src/types/index.ts` (eliza/packages/core/src/types/index.ts): index.ts is a typescript source file in the Milady codebase.
- `file:eliza/packages/shared/src/index.ts` (eliza/packages/shared/src/index.ts): index.ts is a typescript source file in the Milady codebase.

### 7. Voice And Local Inference

Study the local inference plugin, embedding warmup policy, and voice service types that govern bundled ASR/TTS and local model behavior.

- `file:eliza/plugins/plugin-local-inference/src/index.ts` (eliza/plugins/plugin-local-inference/src/index.ts): index.ts is a typescript source file in the Milady codebase.
- `file:eliza/plugins/plugin-local-inference/src/runtime/embedding-warmup-policy.ts` (eliza/plugins/plugin-local-inference/src/runtime/embedding-warmup-policy.ts): embedding-warmup-policy.ts is a typescript source file in the Milady codebase. It contains 3 functions.
- `file:eliza/plugins/plugin-local-inference/src/services/voice/types.ts` (eliza/plugins/plugin-local-inference/src/services/voice/types.ts): types.ts is a typescript source file in the Milady codebase.

### 8. App And Plugin Management

Follow app manager, app control, and agent skills plugins to understand how runtime skills/apps/plugins are exposed to the agent.

- `file:eliza/plugins/plugin-app-manager/src/index.ts` (eliza/plugins/plugin-app-manager/src/index.ts): index.ts is a typescript source file in the Milady codebase.
- `file:eliza/plugins/plugin-app-control/src/index.ts` (eliza/plugins/plugin-app-control/src/index.ts): index.ts is a typescript source file in the Milady codebase. It contains 1 imports.
- `file:eliza/plugins/plugin-agent-skills/src/index.ts` (eliza/plugins/plugin-agent-skills/src/index.ts): index.ts is a typescript source file in the Milady codebase. It contains 10 imports.

### 9. Build, Setup, And CI

Close with the repository script wrappers, upstream setup tooling, and CI workflow that keep Milady and embedded eliza packages aligned.

- `file:scripts/run-eliza-app-core-script.mjs` (scripts/run-eliza-app-core-script.mjs): run-eliza-app-core-script.mjs is a javascript source file in the Milady codebase. It contains 1 function, 1 imports.
- `file:scripts/setup-upstreams.mjs` (scripts/setup-upstreams.mjs): setup-upstreams.mjs is a javascript source file in the Milady codebase. It contains 65 functions, 2 imports.
- `pipeline:.github/workflows/ci.yml` (.github/workflows/ci.yml): ci.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.

### 10. QA And Operational Docs

Use first-run and desktop QA docs as the checklist for verifying startup, packaged desktop, and state-directory behavior.

- `document:docs/QA-first-run.md` (docs/QA-first-run.md): QA-first-run.md documents docs with 40 lines of reference material.
- `document:docs/QA-first-run-coverage.md` (docs/QA-first-run-coverage.md): QA-first-run-coverage.md documents docs with 12 lines of reference material.

## File Map

### Product Entry And Desktop Shell
- `apps/app/.env.example` — .env.example configures config settings for the Milady workspace or one of its embedded packages.
- `apps/app/native-overrides/ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json` — Contents.json configures json settings for the Milady workspace or one of its embedded packages.
- `apps/app/native-overrides/ios/App/App/Assets.xcassets/Splash.imageset/Contents.json` — Contents.json configures json settings for the Milady workspace or one of its embedded packages.
- `apps/app/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `apps/app/tsconfig.json` — tsconfig.json configures json settings for the Milady workspace or one of its embedded packages.
- `apps/app/README.md` — README.md documents apps/app with 150 lines of reference material.
- `apps/app/docs/CLIENT-DATA-SECURITY.md` — CLIENT-DATA-SECURITY.md documents apps/app/docs with 68 lines of reference material.
- `apps/app/docs/SECURITY-SMOKE.md` — SECURITY-SMOKE.md documents apps/app/docs with 57 lines of reference material.
- `apps/app/app.config.ts` — app.config.ts is a typescript source file in the Milady codebase.
- `apps/app/capacitor.config.ts` — capacitor.config.ts is a typescript source file in the Milady codebase. It contains 1 imports.
- `apps/app/electrobun/scripts/ensure-whisper-model.sh` — ensure-whisper-model.sh automates a Milady workspace, build, verification, or runtime task.
- `apps/app/index.html` — index.html is a html source file in the Milady codebase.
- `apps/app/playwright.electrobun.packaged.config.ts` — playwright.electrobun.packaged.config.ts is a typescript source file in the Milady codebase.
- `apps/app/playwright.ui-packaged.config.ts` — playwright.ui-packaged.config.ts is a typescript source file in the Milady codebase.
- `apps/app/playwright.ui-smoke.config.ts` — playwright.ui-smoke.config.ts is a typescript source file in the Milady codebase.
- `apps/app/scripts/android-local-mode-smoke.mjs` — android-local-mode-smoke.mjs is a javascript source file in the Milady codebase. It contains 9 functions.
- `apps/app/scripts/build.mjs` — build.mjs is a javascript source file in the Milady codebase. It contains 1 imports.
- `apps/app/scripts/cloud-provisioning-e2e.mjs` — cloud-provisioning-e2e.mjs is a javascript source file in the Milady codebase. It contains 42 functions.
- `apps/app/scripts/generate-android-icons.mjs` — generate-android-icons.mjs is a javascript source file in the Milady codebase.
- `apps/app/scripts/prod-bundle-dev-endpoint-guard.mjs` — prod-bundle-dev-endpoint-guard.mjs is a javascript source file in the Milady codebase. It contains 2 functions.

### Homepage And Docs Site
- `apps/homepage/.env.example` — .env.example configures config settings for the Milady workspace or one of its embedded packages.
- `apps/homepage/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `apps/homepage/src/data/agent-phrases.json` — agent-phrases.json configures json settings for the Milady workspace or one of its embedded packages.
- `apps/homepage/tsconfig.json` — tsconfig.json configures json settings for the Milady workspace or one of its embedded packages.
- `apps/homepage/src/docs/content/advanced/connect-acp.mdx` — connect-acp.mdx documents apps/homepage/src/docs/content/advanced with 67 lines of reference material.
- `apps/homepage/src/docs/content/advanced/connect-iq-solana.mdx` — connect-iq-solana.mdx documents apps/homepage/src/docs/content/advanced with 71 lines of reference material.
- `apps/homepage/src/docs/content/advanced/connect-mcp.mdx` — connect-mcp.mdx documents apps/homepage/src/docs/content/advanced with 98 lines of reference material.
- `apps/homepage/src/docs/content/advanced/connect-tlon.mdx` — connect-tlon.mdx documents apps/homepage/src/docs/content/advanced with 66 lines of reference material.
- `apps/homepage/src/docs/content/advanced/multi-connector-setup.mdx` — multi-connector-setup.mdx documents apps/homepage/src/docs/content/advanced with 75 lines of reference material.
- `apps/homepage/src/docs/content/advanced/plugins-for-users.mdx` — plugins-for-users.mdx documents apps/homepage/src/docs/content/advanced with 106 lines of reference material.
- `apps/homepage/src/docs/content/advanced/power-user-shortcuts.mdx` — power-user-shortcuts.mdx documents apps/homepage/src/docs/content/advanced with 169 lines of reference material.
- `apps/homepage/src/docs/content/advanced/privacy-and-data.mdx` — privacy-and-data.mdx documents apps/homepage/src/docs/content/advanced with 127 lines of reference material.
- `apps/homepage/src/docs/content/advanced/stream-custom-rtmp.mdx` — stream-custom-rtmp.mdx documents apps/homepage/src/docs/content/advanced with 73 lines of reference material.
- `apps/homepage/src/docs/content/advanced/stream-twitch.mdx` — stream-twitch.mdx documents apps/homepage/src/docs/content/advanced with 64 lines of reference material.
- `apps/homepage/src/docs/content/advanced/stream-youtube.mdx` — stream-youtube.mdx documents apps/homepage/src/docs/content/advanced with 72 lines of reference material.
- `apps/homepage/src/docs/content/advanced/wallet-and-payments.mdx` — wallet-and-payments.mdx documents apps/homepage/src/docs/content/advanced with 106 lines of reference material.
- `apps/homepage/src/docs/content/beginner/first-run.mdx` — first-run.mdx documents apps/homepage/src/docs/content/beginner with 67 lines of reference material.
- `apps/homepage/src/docs/content/beginner/install.mdx` — install.mdx documents apps/homepage/src/docs/content/beginner with 103 lines of reference material.
- `apps/homepage/src/docs/content/beginner/picking-a-provider.mdx` — picking-a-provider.mdx documents apps/homepage/src/docs/content/beginner with 97 lines of reference material.
- `apps/homepage/src/docs/content/beginner/settings-basics.mdx` — settings-basics.mdx documents apps/homepage/src/docs/content/beginner with 73 lines of reference material.

### Runtime App Core
- `eliza/packages/app-core/biome.json` — biome.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/deploy/cloud-agent-template/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/deploy/deploy.defaults.env` — deploy.defaults.env configures config settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/deploy/tsx-runtime-tsconfig.json` — tsx-runtime-tsconfig.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/knip.json` — knip.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/packaging/flatpak/ai.elizaos.App.metainfo.xml` — ai.elizaos.App.metainfo.xml configures xml settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/packaging/flatpak/ai.elizaos.App.store.yml` — ai.elizaos.App.store.yml configures yaml settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/packaging/flatpak/ai.elizaos.App.yml` — ai.elizaos.App.yml configures yaml settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/packaging/flatpak/node-sources.json` — node-sources.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/packaging/msix/AppxManifest.store.xml` — AppxManifest.store.xml configures xml settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/packaging/msix/AppxManifest.xml` — AppxManifest.xml configures xml settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/packaging/msix/store/listing.json` — listing.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/packaging/pypi/pyproject.toml` — pyproject.toml configures toml settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/packaging/snap/snapcraft.yaml` — snapcraft.yaml configures yaml settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/platforms/android/app/build.gradle` — build.gradle configures gradle settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/platforms/android/app/capacitor.build.gradle` — capacitor.build.gradle configures gradle settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/platforms/android/app/src/main/AndroidManifest.xml` — AndroidManifest.xml configures xml settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/platforms/android/app/src/main/res/layout/activity_main.xml` — activity_main.xml configures xml settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/app-core/platforms/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` — ic_launcher.xml configures xml settings for the Milady workspace or one of its embedded packages.

### Shared UI And First Run
- `eliza/packages/ui/biome.json` — biome.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/ui/knip.json` — knip.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/ui/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/ui/src/i18n/locales/en.json` — en.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/ui/src/i18n/locales/es.json` — es.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/ui/src/i18n/locales/ja.json` — ja.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/ui/src/i18n/locales/ko.json` — ko.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/ui/src/i18n/locales/pt.json` — pt.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/ui/src/i18n/locales/tl.json` — tl.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/ui/src/i18n/locales/vi.json` — vi.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/ui/src/i18n/locales/zh-CN.json` — zh-CN.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/ui/src/i18n/voice-first-run.json` — voice-first-run.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/ui/src/i18n/voice-tier.json` — voice-tier.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/ui/stories/tsconfig.json` — tsconfig.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/ui/tsconfig.build.json` — tsconfig.build.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/ui/tsconfig.json` — tsconfig.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/ui/src/first-run/README.md` — README.md documents eliza/packages/ui/src/first-run with 12 lines of reference material.
- `eliza/packages/ui/src/genui/README.md` — README.md documents eliza/packages/ui/src/genui with 135 lines of reference material.
- `eliza/packages/ui/src/services/local-inference/README.md` — README.md documents eliza/packages/ui/src/services/local-inference with 70 lines of reference material.
- `eliza/packages/ui/src/App.cloud-shell.test.tsx` — App.cloud-shell.test.tsx is a typescript source file in the Milady codebase. It contains 2 imports.

### Agent Core And Shared Contracts
- `eliza/packages/agent/evidence/tee/full-stack-local-2026-05-20.json` — full-stack-local-2026-05-20.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/agent/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/agent/tee/dstack-agent-deployment.example.json` — dstack-agent-deployment.example.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/agent/tee/revocations.example.json` — revocations.example.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/agent/tsconfig.build.json` — tsconfig.build.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/agent/tsconfig.bundle.json` — tsconfig.bundle.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/agent/tsconfig.json` — tsconfig.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/core/biome.json` — biome.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/core/bunfig.toml` — bunfig.toml configures toml settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/core/knip.json` — knip.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/core/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/core/tsconfig.declarations.json` — tsconfig.declarations.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/core/tsconfig.json` — tsconfig.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/plugin-remote-manifest/examples/hello-remote-plugin/plugin.json` — plugin.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/plugin-remote-manifest/examples/remote-plugin-clock/plugin.json` — plugin.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/plugin-remote-manifest/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/plugin-remote-manifest/tsconfig.build.json` — tsconfig.build.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/plugin-remote-manifest/tsconfig.json` — tsconfig.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/security/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/packages/security/tsconfig.build.json` — tsconfig.build.json configures json settings for the Milady workspace or one of its embedded packages.

### Plugins Local Inference And App Management
- `eliza/plugins/plugin-agent-skills/biome.json` — biome.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-agent-skills/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-agent-skills/tsconfig.json` — tsconfig.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-app-control/biome.json` — biome.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-app-control/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-app-control/tsconfig.json` — tsconfig.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-app-control/tsconfig.views.json` — tsconfig.views.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-app-manager/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-app-manager/tsconfig.json` — tsconfig.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-browser/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-browser/tsconfig.build.json` — tsconfig.build.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-browser/tsconfig.json` — tsconfig.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-coding-tools/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-coding-tools/tsconfig.build.json` — tsconfig.build.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-coding-tools/tsconfig.json` — tsconfig.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-elizacloud/biome.json` — biome.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-elizacloud/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-elizacloud/prompts/evaluators.json` — evaluators.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-elizacloud/tsconfig.build.json` — tsconfig.build.json configures json settings for the Milady workspace or one of its embedded packages.
- `eliza/plugins/plugin-elizacloud/tsconfig.json` — tsconfig.json configures json settings for the Milady workspace or one of its embedded packages.

### Mobile Native And Platform Packaging
- `native/ios-bun-port/models/manifest.json` — manifest.json configures json settings for the Milady workspace or one of its embedded packages.
- `native/ios-bun-port/polyfill/package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `native/ios-bun-port/polyfill/tsconfig.json` — tsconfig.json configures json settings for the Milady workspace or one of its embedded packages.
- `os/android/brand.milady.json` — brand.milady.json configures json settings for the Milady workspace or one of its embedded packages.
- `native/ios-bun-port/BRIDGE_CONTRACT.md` — BRIDGE_CONTRACT.md documents native/ios-bun-port with 278 lines of reference material.
- `native/ios-bun-port/PLATFORM_MATRIX.md` — PLATFORM_MATRIX.md documents native/ios-bun-port with 81 lines of reference material.
- `native/ios-bun-port/README.md` — README.md documents native/ios-bun-port with 41 lines of reference material.
- `native/ios-bun-port/SQLITE_BRIDGE.md` — SQLITE_BRIDGE.md documents native/ios-bun-port with 257 lines of reference material.
- `native/ios-bun-port/STATUS.md` — STATUS.md documents native/ios-bun-port with 81 lines of reference material.
- `native/ios-bun-port/milestones/M01-jsc-no-jit-builds.md` — M01-jsc-no-jit-builds.md documents native/ios-bun-port/milestones with 124 lines of reference material.
- `native/ios-bun-port/milestones/M02-deps-cross-build.md` — M02-deps-cross-build.md documents native/ios-bun-port/milestones with 110 lines of reference material.
- `native/ios-bun-port/milestones/M03-zig-cmake-ios-targets.md` — M03-zig-cmake-ios-targets.md documents native/ios-bun-port/milestones with 97 lines of reference material.
- `native/ios-bun-port/milestones/M04-bun-embedded-c-abi.md` — M04-bun-embedded-c-abi.md documents native/ios-bun-port/milestones with 152 lines of reference material.
- `native/ios-bun-port/milestones/M05-audit-syscalls.md` — M05-audit-syscalls.md documents native/ios-bun-port/milestones with 150 lines of reference material.
- `native/ios-bun-port/milestones/M06-simulator-hello-world.md` — M06-simulator-hello-world.md documents native/ios-bun-port/milestones with 56 lines of reference material.
- `native/ios-bun-port/milestones/M07-device-hello-world.md` — M07-device-hello-world.md documents native/ios-bun-port/milestones with 36 lines of reference material.
- `native/ios-bun-port/milestones/M08-agent-bundle-loads.md` — M08-agent-bundle-loads.md documents native/ios-bun-port/milestones with 44 lines of reference material.
- `native/ios-bun-port/milestones/M09-llamacpp-static-linkage.md` — M09-llamacpp-static-linkage.md documents native/ios-bun-port/milestones with 69 lines of reference material.
- `native/ios-bun-port/milestones/M10-end-to-end-simulator.md` — M10-end-to-end-simulator.md documents native/ios-bun-port/milestones with 63 lines of reference material.
- `native/ios-bun-port/milestones/M11-device-perf-battery.md` — M11-device-perf-battery.md documents native/ios-bun-port/milestones with 53 lines of reference material.

### Build Scripts CI And Deployment
- `.github/ISSUE_TEMPLATE/bug_report.yml` — bug_report.yml configures yaml settings for the Milady workspace or one of its embedded packages.
- `.github/ISSUE_TEMPLATE/config.yml` — config.yml configures yaml settings for the Milady workspace or one of its embedded packages.
- `.github/ISSUE_TEMPLATE/qa_report.yml` — qa_report.yml configures yaml settings for the Milady workspace or one of its embedded packages.
- `.github/actionlint.yaml` — actionlint.yaml configures yaml settings for the Milady workspace or one of its embedded packages.
- `.github/actions/normalize-snapd-root/action.yml` — action.yml configures yaml settings for the Milady workspace or one of its embedded packages.
- `.github/actions/setup-bun-workspace/action.yml` — action.yml configures yaml settings for the Milady workspace or one of its embedded packages.
- `.github/contributor-trust.json` — contributor-trust.json configures json settings for the Milady workspace or one of its embedded packages.
- `.github/dependabot.yml` — dependabot.yml configures yaml settings for the Milady workspace or one of its embedded packages.
- `.github/labeler.yml` — labeler.yml configures yaml settings for the Milady workspace or one of its embedded packages.
- `deploy/deploy.env` — deploy.env configures config settings for the Milady workspace or one of its embedded packages.
- `deploy/nodes.json` — nodes.json configures json settings for the Milady workspace or one of its embedded packages.
- `deploy/observability/grafana/dashboards/security-overview.json` — security-overview.json configures json settings for the Milady workspace or one of its embedded packages.
- `deploy/observability/loki/loki-config.yaml` — loki-config.yaml configures yaml settings for the Milady workspace or one of its embedded packages.
- `deploy/observability/otel-collector-config.yaml` — otel-collector-config.yaml configures yaml settings for the Milady workspace or one of its embedded packages.
- `deploy/observability/prometheus/alerts/security.yml` — security.yml configures yaml settings for the Milady workspace or one of its embedded packages.
- `deploy/observability/prometheus/prometheus.yml` — prometheus.yml configures yaml settings for the Milady workspace or one of its embedded packages.
- `package.json` — package.json configures json settings for the Milady workspace or one of its embedded packages.
- `scripts/generated/static-asset-manifest.json` — static-asset-manifest.json configures json settings for the Milady workspace or one of its embedded packages.
- `scripts/templates/tsconfig.local-mode.json` — tsconfig.local-mode.json configures json settings for the Milady workspace or one of its embedded packages.
- `scripts/templates/tsconfig.packages-mode.json` — tsconfig.packages-mode.json configures json settings for the Milady workspace or one of its embedded packages.

### Governance Security And Reference Docs
- `.claude/launch.json` — launch.json configures json settings for the Milady workspace or one of its embedded packages.
- `.claude/plugins/electrobun-dev/.claude-plugin/plugin.json` — plugin.json configures json settings for the Milady workspace or one of its embedded packages.
- `.claude/settings.json` — settings.json configures json settings for the Milady workspace or one of its embedded packages.
- `.claude/agents/connector-dev.md` — connector-dev.md documents .claude/agents with 68 lines of reference material.
- `.claude/agents/desktop-debugger.md` — desktop-debugger.md documents .claude/agents with 81 lines of reference material.
- `.claude/agents/electrobun-native-dev.md` — electrobun-native-dev.md documents .claude/agents with 75 lines of reference material.
- `.claude/agents/eliza-plugin-dev.md` — eliza-plugin-dev.md documents .claude/agents with 64 lines of reference material.
- `.claude/agents/eliza-plugin-reviewer.md` — eliza-plugin-reviewer.md documents .claude/agents with 46 lines of reference material.
- `.claude/agents/milady-architect.md` — milady-architect.md documents .claude/agents with 62 lines of reference material.
- `.claude/agents/milady-backend-dev.md` — milady-backend-dev.md documents .claude/agents with 69 lines of reference material.
- `.claude/agents/milady-code-reviewer.md` — milady-code-reviewer.md documents .claude/agents with 89 lines of reference material.
- `.claude/agents/milady-devops.md` — milady-devops.md documents .claude/agents with 102 lines of reference material.
- `.claude/agents/milady-feature-coordinator.md` — milady-feature-coordinator.md documents .claude/agents with 85 lines of reference material.
- `.claude/agents/milady-test-runner.md` — milady-test-runner.md documents .claude/agents with 67 lines of reference material.
- `.claude/agents/milady-ui-dev.md` — milady-ui-dev.md documents .claude/agents with 101 lines of reference material.
- `.claude/agents/observability-specialist.md` — observability-specialist.md documents .claude/agents with 71 lines of reference material.
- `.claude/agents/plugin-researcher.md` — plugin-researcher.md documents .claude/agents with 53 lines of reference material.
- `.claude/agents/pre-review.md` — pre-review.md documents .claude/agents with 79 lines of reference material.
- `.claude/agents/vrm-avatar-specialist.md` — vrm-avatar-specialist.md documents .claude/agents with 60 lines of reference material.
- `.claude/commands/electrobun-agent-tool.md` — electrobun-agent-tool.md documents .claude/commands with 14 lines of reference material.

### Templates Agent Packs And Examples
- `docs/agent-packs/electrobun-agentic-desktop-2026/.claude/settings.json` — settings.json configures json settings for the Milady workspace or one of its embedded packages.
- `docs/agent-packs/electrobun-agentic-desktop-2026/.github/workflows/electrobun-agentic-ci.yml` — electrobun-agentic-ci.yml configures yaml settings for the Milady workspace or one of its embedded packages.
- `docs/agent-packs/electrobun-agentic-desktop-2026/.github/workflows/electrobun-release.yml` — electrobun-release.yml configures yaml settings for the Milady workspace or one of its embedded packages.
- `docs/agent-packs/electrobun-agentic-desktop-2026/agent-plugin.json` — agent-plugin.json configures json settings for the Milady workspace or one of its embedded packages.
- `docs/agent-packs/electrobun-agentic-desktop-2026/automations/agent-automation.yaml` — agent-automation.yaml configures yaml settings for the Milady workspace or one of its embedded packages.
- `docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands/electrobun-agent-tool.md` — electrobun-agent-tool.md documents docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands with 14 lines of reference material.
- `docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands/electrobun-build-fix.md` — electrobun-build-fix.md documents docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands with 11 lines of reference material.
- `docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands/electrobun-menu-tray.md` — electrobun-menu-tray.md documents docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands with 13 lines of reference material.
- `docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands/electrobun-plan.md` — electrobun-plan.md documents docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands with 17 lines of reference material.
- `docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands/electrobun-port-apple.md` — electrobun-port-apple.md documents docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands with 15 lines of reference material.
- `docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands/electrobun-release.md` — electrobun-release.md documents docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands with 15 lines of reference material.
- `docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands/electrobun-rpc.md` — electrobun-rpc.md documents docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands with 13 lines of reference material.
- `docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands/electrobun-security-review.md` — electrobun-security-review.md documents docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands with 15 lines of reference material.
- `docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands/electrobun-test.md` — electrobun-test.md documents docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands with 12 lines of reference material.
- `docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands/electrobun-update.md` — electrobun-update.md documents docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands with 14 lines of reference material.
- `docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands/electrobun-view.md` — electrobun-view.md documents docs/agent-packs/electrobun-agentic-desktop-2026/.claude/commands with 14 lines of reference material.
- `docs/agent-packs/electrobun-agentic-desktop-2026/.codex/AGENTS.md` — AGENTS.md documents docs/agent-packs/electrobun-agentic-desktop-2026/.codex with 3 lines of reference material.
- `docs/agent-packs/electrobun-agentic-desktop-2026/.github/copilot-instructions.md` — copilot-instructions.md documents docs/agent-packs/electrobun-agentic-desktop-2026/.github with 12 lines of reference material.
- `docs/agent-packs/electrobun-agentic-desktop-2026/AGENTS.md` — AGENTS.md documents docs/agent-packs/electrobun-agentic-desktop-2026 with 51 lines of reference material.
- `docs/agent-packs/electrobun-agentic-desktop-2026/CLAUDE.md` — CLAUDE.md documents docs/agent-packs/electrobun-agentic-desktop-2026 with 12 lines of reference material.

### Miscellaneous Source
- `.codefactor.yml` — .codefactor.yml configures yaml settings for the Milady workspace or one of its embedded packages.
- `.env.example` — .env.example configures config settings for the Milady workspace or one of its embedded packages.
- `.gitleaks.toml` — .gitleaks.toml configures toml settings for the Milady workspace or one of its embedded packages.
- `.mcp.json` — .mcp.json configures json settings for the Milady workspace or one of its embedded packages.
- `automations/agent-automation.yaml` — agent-automation.yaml configures yaml settings for the Milady workspace or one of its embedded packages.
- `biome.json` — biome.json configures json settings for the Milady workspace or one of its embedded packages.
- `knip.jsonc` — knip.jsonc configures jsonc settings for the Milady workspace or one of its embedded packages.
- `plugins.json` — plugins.json configures json settings for the Milady workspace or one of its embedded packages.
- `reports/qa/2026-05-10/desktop/stack-status.json` — stack-status.json configures json settings for the Milady workspace or one of its embedded packages.
- `skills/plan-my-day/.scan-results.json` — .scan-results.json configures json settings for the Milady workspace or one of its embedded packages.
- `skills/plan-my-day/_meta.json` — _meta.json configures json settings for the Milady workspace or one of its embedded packages.
- `tsconfig.json` — tsconfig.json configures json settings for the Milady workspace or one of its embedded packages.
- `upstreams.lock.json` — upstreams.lock.json configures json settings for the Milady workspace or one of its embedded packages.
- `.codex/AGENTS.md` — AGENTS.md documents .codex with 17 lines of reference material.
- `AUDIT.md` — AUDIT.md documents the project with 133 lines of reference material.
- `SETUP_IOS.md` — SETUP_IOS.md documents the project with 149 lines of reference material.
- `commands/README.md` — README.md documents commands with 12 lines of reference material.
- `commands/electrobun-agent-tool.md` — electrobun-agent-tool.md documents commands with 14 lines of reference material.
- `commands/electrobun-build-fix.md` — electrobun-build-fix.md documents commands with 11 lines of reference material.
- `commands/electrobun-menu-tray.md` — electrobun-menu-tray.md documents commands with 13 lines of reference material.

## Complexity Hotspots

- `.claude/plans/entity-model-analysis.md` (Governance Security And Reference Docs) — entity-model-analysis.md documents .claude/plans with 518 lines of reference material.
- `.claude/plans/system-permissions-implementation.md` (Governance Security And Reference Docs) — system-permissions-implementation.md documents .claude/plans with 865 lines of reference material.
- `.claude/plugins/electrobun-dev/commands/electrobun-align.md` (Governance Security And Reference Docs) — electrobun-align.md documents .claude/plugins/electrobun-dev/commands with 374 lines of reference material.
- `.claude/plugins/electrobun-dev/commands/electrobun-setup.md` (Governance Security And Reference Docs) — electrobun-setup.md documents .claude/plugins/electrobun-dev/commands with 1045 lines of reference material.
- `.claude/plugins/electrobun-dev/skills/electrobun-build/SKILL.md` (Governance Security And Reference Docs) — SKILL.md documents .claude/plugins/electrobun-dev/skills/electrobun-build with 330 lines of reference material.
- `.claude/plugins/electrobun-dev/skills/electrobun-platform/SKILL.md` (Governance Security And Reference Docs) — SKILL.md documents .claude/plugins/electrobun-dev/skills/electrobun-platform with 297 lines of reference material.
- `.claude/plugins/electrobun-dev/skills/electrobun-testing/SKILL.md` (Governance Security And Reference Docs) — SKILL.md documents .claude/plugins/electrobun-dev/skills/electrobun-testing with 294 lines of reference material.
- `.github/actions/setup-bun-workspace/action.yml` (Build Scripts CI And Deployment) — action.yml configures yaml settings for the Milady workspace or one of its embedded packages.
- `.github/TRUST_DESIGN.md` (Build Scripts CI And Deployment) — TRUST_DESIGN.md documents .github with 315 lines of reference material.
- `.github/trust-scoring.cjs` (Build Scripts CI And Deployment) — trust-scoring.cjs is a javascript source file in the Milady codebase. It contains 14 functions.
- `.github/trust-scoring.js` (Build Scripts CI And Deployment) — trust-scoring.js is a javascript source file in the Milady codebase. It contains 12 functions.
- `.github/workflows/agent-fix-ci.yml` (Build Scripts CI And Deployment) — agent-fix-ci.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.
- `.github/workflows/agent-implement.yml` (Build Scripts CI And Deployment) — agent-implement.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.
- `.github/workflows/agent-release.yml` (Build Scripts CI And Deployment) — agent-release.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.
- `.github/workflows/agent-review-apply-greptile-suggestions.yml` (Build Scripts CI And Deployment) — agent-review-apply-greptile-suggestions.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.
- `.github/workflows/agent-review-greptile-weighted.yml` (Build Scripts CI And Deployment) — agent-review-greptile-weighted.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.
- `.github/workflows/agent-review.yml` (Build Scripts CI And Deployment) — agent-review.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.
- `.github/workflows/android-release.yml` (Build Scripts CI And Deployment) — android-release.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.
- `.github/workflows/apple-store-release.yml` (Build Scripts CI And Deployment) — apple-store-release.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.
- `.github/workflows/build-cloud-agent.yml` (Build Scripts CI And Deployment) — build-cloud-agent.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.
- `.github/workflows/build-cloud-image.yml` (Build Scripts CI And Deployment) — build-cloud-image.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.
- `.github/workflows/build-docker.yml` (Build Scripts CI And Deployment) — build-docker.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.
- `.github/workflows/build-tails-iso.yml` (Build Scripts CI And Deployment) — build-tails-iso.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.
- `.github/workflows/ci.yml` (Build Scripts CI And Deployment) — ci.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.
- `.github/workflows/publish-packages.yml` (Build Scripts CI And Deployment) — publish-packages.yml defines infrastructure, packaging, or automation behavior used by the Milady build and deployment workflow.

## Team Note

This guide was generated from `.understand-anything/knowledge-graph.json`. Promote it to `docs/ONBOARDING.md` if you want it versioned as team-facing documentation.