# Architecture Debt Report

Generated: 2026-05-28T00:03:29.179Z

## Scope

Graph: 30304 nodes, 52420 edges, 11 layers.

This report uses the Understand Anything graph as a structural map. It does not prove runtime behavior; runtime behavior still needs packaged launch, logs, tests, and live API checks.

## Top High-Degree Hubs

| Degree | In | Out | Layer | Complexity | File |
| --- | --- | --- | --- | --- | --- |
| 556 | 556 | 0 | Agent Core And Shared Contracts | complex | `eliza/packages/core/src/index.node.ts` |
| 311 | 311 | 0 | Agent Core And Shared Contracts | complex | `eliza/packages/shared/src/index.ts` |
| 289 | 11 | 278 | Agent Core And Shared Contracts | complex | `eliza/packages/core/src/services/message.ts` |
| 276 | 276 | 0 | Agent Core And Shared Contracts | simple | `eliza/packages/core/src/types/index.ts` |
| 192 | 2 | 190 | Runtime App Core | complex | `eliza/packages/app-core/scripts/run-mobile-build.mjs` |
| 176 | 150 | 26 | Agent Core And Shared Contracts | complex | `eliza/packages/core/src/logger.ts` |
| 170 | 169 | 1 | Shared UI And First Run | moderate | `eliza/packages/ui/src/components/ui/button.tsx` |
| 135 | 0 | 135 | Agent Core And Shared Contracts | complex | `eliza/packages/agent/src/api/server.ts` |
| 134 | 134 | 0 | Shared UI And First Run | simple | `eliza/packages/ui/src/api/index.ts` |
| 132 | 11 | 121 | Plugins Local Inference And App Management | complex | `eliza/plugins/plugin-local-inference/src/services/dflash-server.ts` |
| 124 | 2 | 122 | Runtime App Core | complex | `eliza/packages/app-core/scripts/build-llama-cpp-dflash.mjs` |
| 123 | 4 | 119 | Shared UI And First Run | complex | `eliza/packages/ui/src/api/ios-local-agent-kernel.ts` |
| 117 | 116 | 1 | Shared UI And First Run | simple | `eliza/packages/ui/src/lib/utils.ts` |
| 114 | 2 | 112 | Agent Core And Shared Contracts | complex | `eliza/packages/agent/src/runtime/eliza.ts` |
| 110 | 84 | 26 | Agent Core And Shared Contracts | complex | `eliza/packages/core/src/types/runtime.ts` |
| 109 | 1 | 108 | Shared UI And First Run | complex | `eliza/packages/ui/src/App.tsx` |
| 108 | 108 | 0 | Shared UI And First Run | simple | `eliza/packages/ui/src/state/index.ts` |
| 105 | 25 | 80 | Shared UI And First Run | complex | `eliza/packages/ui/src/state/persistence.ts` |
| 102 | 6 | 96 | Agent Core And Shared Contracts | complex | `eliza/packages/core/src/features/advanced-capabilities/actions/message.ts` |
| 101 | 13 | 88 | Agent Core And Shared Contracts | complex | `eliza/packages/core/src/runtime/planner-loop.ts` |
| 100 | 0 | 100 | Runtime App Core | complex | `eliza/packages/app-core/platforms/electrobun/src/index.ts` |
| 97 | 5 | 92 | Agent Core And Shared Contracts | complex | `eliza/packages/agent/src/api/chat-routes.ts` |
| 90 | 17 | 73 | Agent Core And Shared Contracts | complex | `eliza/packages/core/src/runtime.ts` |
| 90 | 89 | 1 | Agent Core And Shared Contracts | moderate | `eliza/packages/core/src/types/primitives.ts` |
| 86 | 7 | 79 | Agent Core And Shared Contracts | complex | `eliza/packages/agent/src/services/remote-plugin-adapter.ts` |

## Cross-Layer Edges

| Count | Layer Pair |
| --- | --- |
| 282 | Plugins Local Inference And App Management -> Agent Core And Shared Contracts |
| 264 | Runtime App Core -> Agent Core And Shared Contracts |
| 103 | Shared UI And First Run -> Agent Core And Shared Contracts |
| 63 | Runtime App Core -> Shared UI And First Run |
| 7 | Plugins Local Inference And App Management -> Runtime App Core |
| 3 | Agent Core And Shared Contracts -> Plugins Local Inference And App Management |
| 3 | Product Entry And Desktop Shell -> Runtime App Core |
| 2 | Agent Core And Shared Contracts -> Runtime App Core |
| 2 | Product Entry And Desktop Shell -> Build Scripts CI And Deployment |
| 1 | Runtime App Core -> Plugins Local Inference And App Management |

### Cross-Layer Examples

#### Plugins Local Inference And App Management -> Agent Core And Shared Contracts (282)

- imports: `eliza/plugins/plugin-app-control/src/actions/app-create.ts` -> `eliza/packages/core/src/index.node.ts`
- imports: `eliza/plugins/plugin-app-control/src/actions/app-launch.ts` -> `eliza/packages/core/src/index.node.ts`
- imports: `eliza/plugins/plugin-app-control/src/actions/app-list.ts` -> `eliza/packages/core/src/index.node.ts`
- imports: `eliza/plugins/plugin-app-control/src/actions/app-load-from-directory.ts` -> `eliza/packages/core/src/index.node.ts`
- imports: `eliza/plugins/plugin-app-control/src/actions/app-load-from-directory.ts` -> `eliza/packages/shared/src/index.ts`

#### Runtime App Core -> Agent Core And Shared Contracts (264)

- imports: `eliza/packages/app-core/scripts/dev-platform.mjs` -> `eliza/packages/shared/src/index.ts`
- imports: `eliza/packages/app-core/scripts/dev-ui.mjs` -> `eliza/packages/shared/src/index.ts`
- imports: `eliza/packages/app-core/scripts/lib/orchestrator-desktop-dev-banner.mjs` -> `eliza/packages/shared/src/dev-settings-figlet-heading.ts`
- imports: `eliza/packages/app-core/scripts/lib/orchestrator-desktop-dev-banner.mjs` -> `eliza/packages/shared/src/index.ts`
- imports: `eliza/packages/app-core/scripts/local-stt-bench.ts` -> `eliza/packages/core/src/database/inMemoryAdapter.ts`

#### Shared UI And First Run -> Agent Core And Shared Contracts (103)

- imports: `eliza/packages/ui/src/api/agent-client-type-shim.ts` -> `eliza/packages/core/src/index.ts`
- imports: `eliza/packages/ui/src/api/agent-client-type-shim.ts` -> `eliza/packages/shared/src/index.ts`
- imports: `eliza/packages/ui/src/api/client-base.ts` -> `eliza/packages/shared/src/index.ts`
- imports: `eliza/packages/ui/src/api/client-chat.ts` -> `eliza/packages/shared/src/index.ts`
- imports: `eliza/packages/ui/src/api/client-skills.ts` -> `eliza/packages/shared/src/index.ts`

#### Runtime App Core -> Shared UI And First Run (63)

- imports: `eliza/packages/app-core/src/api/ios-local-agent-transport.ts` -> `eliza/packages/ui/src/api/ios-local-agent-kernel.ts`
- imports: `eliza/packages/app-core/src/api/ios-local-agent-transport.ts` -> `eliza/packages/ui/src/api/ittp-agent-transport.ts`
- imports: `eliza/packages/app-core/src/api/ios-local-agent-transport.ts` -> `eliza/packages/ui/src/api/transport.ts`
- imports: `eliza/packages/app-core/src/api/ios-local-agent-transport.ts` -> `eliza/packages/ui/src/build-variant.ts`
- imports: `eliza/packages/app-core/src/api/ios-local-agent-transport.ts` -> `eliza/packages/ui/src/first-run/mobile-runtime-mode.ts`

#### Plugins Local Inference And App Management -> Runtime App Core (7)

- imports: `eliza/plugins/plugin-local-inference/src/services/voice/voice-duet.test.ts` -> `eliza/packages/app-core/scripts/lib/duet-bridge.mjs`
- imports: `eliza/plugins/plugin-app-control/src/services/__tests__/app-verification.integration.test.ts` -> `eliza/packages/app-core/test/helpers/conditional-tests.ts`
- imports: `eliza/plugins/plugin-registry/src/api/app-plugins-routes.ts` -> `eliza/packages/app-core/src/api/auth.ts`
- imports: `eliza/plugins/plugin-registry/src/api/app-plugins-routes.ts` -> `eliza/packages/app-core/src/api/compat-route-shared.ts`
- imports: `eliza/plugins/plugin-registry/src/api/app-plugins-routes.ts` -> `eliza/packages/app-core/src/api/response.ts`

#### Agent Core And Shared Contracts -> Plugins Local Inference And App Management (3)

- imports: `eliza/packages/agent/src/api/server.ts` -> `eliza/plugins/plugin-app-manager/src/index.ts`
- imports: `eliza/packages/agent/src/runtime/eliza.ts` -> `eliza/plugins/plugin-local-inference/src/runtime/embedding-presets.ts`
- imports: `eliza/packages/agent/src/services/app-session-gate.ts` -> `eliza/plugins/plugin-app-manager/src/index.ts`

#### Product Entry And Desktop Shell -> Runtime App Core (3)

- imports: `apps/app/test/electrobun-packaged/live-api.ts` -> `eliza/packages/app-core/src/api/server.ts`
- imports: `apps/app/test/electrobun-packaged/live-api.ts` -> `eliza/packages/app-core/test/helpers/isolated-config.ts`
- imports: `apps/app/test/electrobun-packaged/live-api.ts` -> `eliza/packages/app-core/test/helpers/real-runtime.ts`

#### Agent Core And Shared Contracts -> Runtime App Core (2)

- imports: `eliza/packages/core/src/__tests__/read-attachment-action.live.test.ts` -> `eliza/packages/app-core/test/helpers/live-agent-test.ts`
- imports: `eliza/packages/agent/src/providers/media-provider.real.test.ts` -> `eliza/packages/app-core/test/helpers/conditional-tests.ts`

#### Product Entry And Desktop Shell -> Build Scripts CI And Deployment (2)

- imports: `apps/app/scripts/build.mjs` -> `scripts/run-app-web-build.mjs`
- imports: `apps/app/vite.config.ts` -> `scripts/lib/sync-eliza-env-aliases.mjs`

#### Runtime App Core -> Plugins Local Inference And App Management (1)

- imports: `eliza/packages/app-core/src/api/server.ts` -> `eliza/plugins/plugin-registry/src/index.ts`

## Complex File Hotspots

| Degree | Layer | File | Summary |
| --- | --- | --- | --- |
| 556 | Agent Core And Shared Contracts | `eliza/packages/core/src/index.node.ts` | index.node.ts is a typescript source file in the Milady codebase. |
| 311 | Agent Core And Shared Contracts | `eliza/packages/shared/src/index.ts` | index.ts is a typescript source file in the Milady codebase. |
| 289 | Agent Core And Shared Contracts | `eliza/packages/core/src/services/message.ts` | message.ts is a typescript source file in the Milady codebase. It contains 212 functions, 1 class, 65 imports. |
| 192 | Runtime App Core | `eliza/packages/app-core/scripts/run-mobile-build.mjs` | run-mobile-build.mjs is a javascript source file in the Milady codebase. It contains 185 functions, 5 imports. |
| 176 | Agent Core And Shared Contracts | `eliza/packages/core/src/logger.ts` | logger.ts is a typescript source file in the Milady codebase. It contains 25 functions, 1 imports. |
| 135 | Agent Core And Shared Contracts | `eliza/packages/agent/src/api/server.ts` | server.ts is a typescript source file in the Milady codebase. It contains 49 functions, 86 imports. |
| 132 | Plugins Local Inference And App Management | `eliza/plugins/plugin-local-inference/src/services/dflash-server.ts` | dflash-server.ts is a typescript source file in the Milady codebase. It contains 101 functions, 1 class, 18 imports. |
| 124 | Runtime App Core | `eliza/packages/app-core/scripts/build-llama-cpp-dflash.mjs` | build-llama-cpp-dflash.mjs is a javascript source file in the Milady codebase. It contains 112 functions, 10 imports. |
| 123 | Shared UI And First Run | `eliza/packages/ui/src/api/ios-local-agent-kernel.ts` | ios-local-agent-kernel.ts is a typescript source file in the Milady codebase. It contains 111 functions, 7 imports. |
| 114 | Agent Core And Shared Contracts | `eliza/packages/agent/src/runtime/eliza.ts` | eliza.ts is a typescript source file in the Milady codebase. It contains 80 functions, 32 imports. |
| 110 | Agent Core And Shared Contracts | `eliza/packages/core/src/types/runtime.ts` | runtime.ts is a typescript source file in the Milady codebase. It contains 26 imports. |
| 109 | Shared UI And First Run | `eliza/packages/ui/src/App.tsx` | App.tsx is a typescript source file in the Milady codebase. It contains 43 functions, 65 imports. |
| 105 | Shared UI And First Run | `eliza/packages/ui/src/state/persistence.ts` | persistence.ts is a typescript source file in the Milady codebase. It contains 71 functions, 9 imports. |
| 102 | Agent Core And Shared Contracts | `eliza/packages/core/src/features/advanced-capabilities/actions/message.ts` | message.ts is a typescript source file in the Milady codebase. It contains 75 functions, 21 imports. |
| 101 | Agent Core And Shared Contracts | `eliza/packages/core/src/runtime/planner-loop.ts` | planner-loop.ts is a typescript source file in the Milady codebase. It contains 66 functions, 21 imports. |
| 100 | Runtime App Core | `eliza/packages/app-core/platforms/electrobun/src/index.ts` | index.ts is a typescript source file in the Milady codebase. It contains 55 functions, 45 imports. |
| 97 | Agent Core And Shared Contracts | `eliza/packages/agent/src/api/chat-routes.ts` | chat-routes.ts is a typescript source file in the Milady codebase. It contains 76 functions, 16 imports. |
| 90 | Agent Core And Shared Contracts | `eliza/packages/core/src/runtime.ts` | runtime.ts is a typescript source file in the Milady codebase. It contains 22 functions, 2 classes, 49 imports. |
| 86 | Agent Core And Shared Contracts | `eliza/packages/agent/src/services/remote-plugin-adapter.ts` | remote-plugin-adapter.ts is a typescript source file in the Milady codebase. It contains 74 functions, 4 imports. |
| 86 | Agent Core And Shared Contracts | `eliza/packages/core/src/capabilities/index.ts` | index.ts is a typescript source file in the Milady codebase. It contains 80 functions, 3 classes, 1 imports. |
| 82 | Agent Core And Shared Contracts | `eliza/packages/core/src/utils.ts` | utils.ts is a typescript source file in the Milady codebase. It contains 34 functions, 12 imports. |
| 81 | Agent Core And Shared Contracts | `eliza/packages/agent/src/runtime/trajectory-internals.ts` | trajectory-internals.ts is a typescript source file in the Milady codebase. It contains 68 functions, 3 imports. |
| 77 | Runtime App Core | `eliza/packages/app-core/platforms/electrobun/src/native/agent.ts` | agent.ts is a typescript source file in the Milady codebase. It contains 56 functions, 1 class, 10 imports. |
| 77 | Runtime App Core | `eliza/packages/app-core/test/app/qa-checklist.real.e2e.test.ts` | qa-checklist.real.e2e.test.ts is a typescript source file in the Milady codebase. It contains 74 functions, 3 imports. |
| 71 | Agent Core And Shared Contracts | `eliza/packages/agent/src/api/inbox-routes.ts` | inbox-routes.ts is a typescript source file in the Milady codebase. It contains 68 functions, 2 imports. |
| 70 | Agent Core And Shared Contracts | `eliza/packages/agent/src/config/config.ts` | config.ts is a typescript source file in the Milady codebase. It contains 11 functions, 9 imports. |
| 70 | Runtime App Core | `eliza/packages/app-core/scripts/copy-runtime-node-modules.ts` | copy-runtime-node-modules.ts is a typescript source file in the Milady codebase. It contains 68 functions, 1 imports. |
| 70 | Agent Core And Shared Contracts | `eliza/packages/core/src/types/model.ts` | model.ts is a typescript source file in the Milady codebase. It contains 2 functions, 4 imports. |
| 69 | Agent Core And Shared Contracts | `eliza/packages/core/src/services/relationships-graph-builder.ts` | relationships-graph-builder.ts is a typescript source file in the Milady codebase. It contains 66 functions, 2 imports. |
| 69 | Shared UI And First Run | `eliza/packages/ui/src/api/client-agent.ts` | client-agent.ts is a typescript source file in the Milady codebase. It contains 41 functions, 7 imports. |

## Miscellaneous Layer Files

Files in `Miscellaneous Source` are the first candidates for reclassification, deletion, or clearer ownership.

| Degree | File | Summary |
| --- | --- | --- |
| 6 | `skills/.defaults/skill-creator/scripts/init_skill.py` | init_skill.py is a python source file in the Milady codebase. It contains 6 functions. |
| 3 | `skills/.defaults/skill-creator/scripts/package_skill.py` | package_skill.py is a python source file in the Milady codebase. It contains 2 functions, 1 imports. |
| 2 | `skills/.defaults/nano-banana-pro/scripts/generate_image.py` | generate_image.py is a python source file in the Milady codebase. It contains 2 functions. |
| 2 | `skills/.defaults/skill-creator/scripts/quick_validate.py` | quick_validate.py is a python source file in the Milady codebase. It contains 1 function. |
| 2 | `skills/.defaults/tmux/scripts/find-sessions.sh` | find-sessions.sh automates a Milady workspace, build, verification, or runtime task. |
| 1 | `skills/.defaults/tmux/scripts/wait-for-text.sh` | wait-for-text.sh automates a Milady workspace, build, verification, or runtime task. |
| 0 | `.agent/hooks/post-bash-summary.sh` | post-bash-summary.sh automates a Milady workspace, build, verification, or runtime task. |
| 0 | `.agent/hooks/post-edit-validate.sh` | post-edit-validate.sh automates a Milady workspace, build, verification, or runtime task. |
| 0 | `.agent/hooks/pre-bash-guard.sh` | pre-bash-guard.sh automates a Milady workspace, build, verification, or runtime task. |
| 0 | `.agent/hooks/pre-edit-guard.sh` | pre-edit-guard.sh automates a Milady workspace, build, verification, or runtime task. |
| 0 | `.agent/hooks/stop-checklist.sh` | stop-checklist.sh automates a Milady workspace, build, verification, or runtime task. |
| 0 | `.biomeignore` | .biomeignore is a unknown source file in the Milady codebase. |
| 0 | `.codefactor.yml` | .codefactor.yml configures yaml settings for the Milady workspace or one of its embedded packages. |
| 0 | `.codeflowignore` | .codeflowignore is a unknown source file in the Milady codebase. |
| 0 | `.codex/AGENTS.md` | AGENTS.md documents .codex with 17 lines of reference material. |
| 0 | `.cursor/rules/electrobun-agentic-desktop-2026.mdc` | electrobun-agentic-desktop-2026.mdc is a mdc source file in the Milady codebase. |
| 0 | `.env.example` | .env.example configures config settings for the Milady workspace or one of its embedded packages. |
| 0 | `.gitattributes` | .gitattributes is a unknown source file in the Milady codebase. |
| 0 | `.gitleaks.toml` | .gitleaks.toml configures toml settings for the Milady workspace or one of its embedded packages. |
| 0 | `.mcp.json` | .mcp.json configures json settings for the Milady workspace or one of its embedded packages. |
| 0 | `.npmignore` | .npmignore is a unknown source file in the Milady codebase. |
| 0 | `.nvmrc` | .nvmrc is a unknown source file in the Milady codebase. |
| 0 | `.understand-anything/.understandignore` | .understandignore is a unknown source file in the Milady codebase. |
| 0 | `.windsurfrules` | .windsurfrules is a unknown source file in the Milady codebase. |
| 0 | `AUDIT.md` | AUDIT.md documents the project with 133 lines of reference material. |
| 0 | `automations/agent-automation.yaml` | agent-automation.yaml configures yaml settings for the Milady workspace or one of its embedded packages. |
| 0 | `biome.json` | biome.json configures json settings for the Milady workspace or one of its embedded packages. |
| 0 | `commands/electrobun-agent-tool.md` | electrobun-agent-tool.md documents commands with 14 lines of reference material. |
| 0 | `commands/electrobun-build-fix.md` | electrobun-build-fix.md documents commands with 11 lines of reference material. |
| 0 | `commands/electrobun-menu-tray.md` | electrobun-menu-tray.md documents commands with 13 lines of reference material. |
| 0 | `commands/electrobun-plan.md` | electrobun-plan.md documents commands with 17 lines of reference material. |
| 0 | `commands/electrobun-port-apple.md` | electrobun-port-apple.md documents commands with 15 lines of reference material. |
| 0 | `commands/electrobun-release.md` | electrobun-release.md documents commands with 15 lines of reference material. |
| 0 | `commands/electrobun-rpc.md` | electrobun-rpc.md documents commands with 13 lines of reference material. |
| 0 | `commands/electrobun-security-review.md` | electrobun-security-review.md documents commands with 15 lines of reference material. |
| 0 | `commands/electrobun-test.md` | electrobun-test.md documents commands with 12 lines of reference material. |
| 0 | `commands/electrobun-update.md` | electrobun-update.md documents commands with 14 lines of reference material. |
| 0 | `commands/electrobun-view.md` | electrobun-view.md documents commands with 14 lines of reference material. |
| 0 | `commands/README.md` | README.md documents commands with 12 lines of reference material. |
| 0 | `hooks/README.md` | README.md documents hooks with 18 lines of reference material. |

## First-Run / Runtime / Voice Focus

Matched 1957 file-level nodes across the graph.

| Count | Layer |
| --- | --- |
| 646 | Plugins Local Inference And App Management |
| 493 | Runtime App Core |
| 295 | Agent Core And Shared Contracts |
| 209 | Shared UI And First Run |
| 158 | Templates Agent Packs And Examples |
| 69 | Governance Security And Reference Docs |
| 38 | Build Scripts CI And Deployment |
| 24 | Miscellaneous Source |
| 17 | Product Entry And Desktop Shell |
| 5 | Homepage And Docs Site |
| 3 | Mobile Native And Platform Packaging |

### Top Matched Nodes

| Degree | Layer | Complexity | File |
| --- | --- | --- | --- |
| 132 | Plugins Local Inference And App Management | complex | `eliza/plugins/plugin-local-inference/src/services/dflash-server.ts` |
| 114 | Agent Core And Shared Contracts | complex | `eliza/packages/agent/src/runtime/eliza.ts` |
| 110 | Agent Core And Shared Contracts | complex | `eliza/packages/core/src/types/runtime.ts` |
| 101 | Agent Core And Shared Contracts | complex | `eliza/packages/core/src/runtime/planner-loop.ts` |
| 100 | Runtime App Core | complex | `eliza/packages/app-core/platforms/electrobun/src/index.ts` |
| 90 | Agent Core And Shared Contracts | complex | `eliza/packages/core/src/runtime.ts` |
| 81 | Agent Core And Shared Contracts | complex | `eliza/packages/agent/src/runtime/trajectory-internals.ts` |
| 77 | Runtime App Core | complex | `eliza/packages/app-core/platforms/electrobun/src/native/agent.ts` |
| 70 | Runtime App Core | complex | `eliza/packages/app-core/scripts/copy-runtime-node-modules.ts` |
| 69 | Shared UI And First Run | complex | `eliza/packages/ui/src/api/client-agent.ts` |
| 65 | Plugins Local Inference And App Management | complex | `eliza/plugins/plugin-local-inference/native/verify/kokoro_e2e_loop_bench.mjs` |
| 61 | Runtime App Core | complex | `eliza/packages/app-core/platforms/electrobun/src/rpc-handlers.ts` |
| 59 | Plugins Local Inference And App Management | complex | `eliza/plugins/plugin-local-inference/src/local-inference-routes.ts` |
| 58 | Product Entry And Desktop Shell | complex | `apps/app/src/main.tsx` |
| 57 | Agent Core And Shared Contracts | complex | `eliza/packages/core/src/runtime/evaluator.ts` |
| 56 | Runtime App Core | complex | `eliza/packages/app-core/platforms/electrobun/remotes/runtime/src/bun/worker.ts` |
| 54 | Runtime App Core | complex | `eliza/packages/app-core/src/runtime/mobile-safe-runtime.ts` |
| 54 | Agent Core And Shared Contracts | complex | `eliza/packages/core/src/runtime/response-grammar.ts` |
| 54 | Plugins Local Inference And App Management | complex | `eliza/plugins/plugin-local-inference/src/runtime/ensure-local-inference-handler.ts` |
| 53 | Agent Core And Shared Contracts | complex | `eliza/packages/agent/src/runtime/plugin-resolver.ts` |
| 52 | Shared UI And First Run | complex | `eliza/packages/ui/src/bridge/electrobun-rpc.ts` |
| 52 | Plugins Local Inference And App Management | complex | `eliza/plugins/plugin-local-inference/src/services/engine.ts` |
| 52 | Plugins Local Inference And App Management | complex | `eliza/plugins/plugin-local-inference/src/services/voice/engine-bridge.ts` |
| 52 | Plugins Local Inference And App Management | complex | `eliza/plugins/plugin-local-inference/src/services/voice/types.ts` |
| 48 | Runtime App Core | complex | `eliza/packages/app-core/src/runtime/eliza.ts` |
| 47 | Agent Core And Shared Contracts | complex | `eliza/packages/agent/src/runtime/prompt-optimization.ts` |
| 47 | Agent Core And Shared Contracts | complex | `eliza/packages/core/src/contracts/first-run-options.ts` |
| 47 | Agent Core And Shared Contracts | complex | `eliza/packages/shared/src/contracts/first-run-options.ts` |
| 46 | Plugins Local Inference And App Management | complex | `eliza/plugins/plugin-local-inference/native/verify/dflash_drafter_runtime_smoke.mjs` |
| 46 | Plugins Local Inference And App Management | complex | `eliza/plugins/plugin-local-inference/native/verify/voice_profile_emotion_status.mjs` |
| 45 | Agent Core And Shared Contracts | complex | `eliza/packages/agent/src/runtime/conversation-compactor.ts` |
| 45 | Agent Core And Shared Contracts | complex | `eliza/packages/core/src/runtime/trajectory-recorder.ts` |
| 44 | Plugins Local Inference And App Management | complex | `eliza/plugins/plugin-local-inference/src/provider.ts` |
| 43 | Runtime App Core | complex | `eliza/packages/app-core/platforms/electrobun/src/voice/voice-live-validation.ts` |
| 43 | Plugins Local Inference And App Management | complex | `eliza/plugins/plugin-local-inference/native/verify/e2e_loop_bench.mjs` |

## Cleanup Strategy

1. Pick one product flow at a time: fresh desktop launch, first-run setup, voice/local inference, app/plugin action surface, or build/QA.
2. For that flow, declare the owning layer and move behavior there instead of preserving bridge paths.
3. Delete stale compatibility paths when no live caller exists in the graph and no runtime check proves the caller.
4. Use `understand-diff` after each cleanup to confirm the changed nodes and affected nodes stay inside the intended ownership boundary.
5. Verify each cleanup with the narrowest runtime proof: unit tests for pure contracts, packaged startup for desktop bootstrap, and live logs/API checks for backend/UI connection.
