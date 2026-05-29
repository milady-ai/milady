# Local Inference And Voice Contract Cleanup

You are working in `/Users/home/Documents/milady` on the current branch and current dirty worktree.

## Non-Negotiables

- Do not switch branches, stash, reset, clean, or discard uncommitted work.
- Do not push, open PRs, touch CI/CD, signing, notarization, or shared infrastructure.
- Stage by filename only if explicitly asked to commit.
- Use `rg` first for search.
- Use `apply_patch` for manual edits.
- No silent fallbacks, no broad swallowed errors, no `any`/unsafe casts to dodge types.
- elizaOS spelling in prose/docs.
- For server/runtime logging, use structured logger patterns already in the codebase, not `console.*`.
- Runtime truth beats static theory. If a prompt asks you to prove startup, use a fresh state dir, logs, health/API checks, and packaged desktop startup where feasible.

## Shared Product Goal

Milady must start the same way every time out of the box. Fresh install first-run setup must reach the live local API base, use `~/.local/state/milady` state semantics, keep UI as a client of runtime readiness, and support voice or text without relying on browser `SpeechRecognition` in packaged desktop.

## Selected Layer

`Runtime App Core`: Embedded app-core runtime, API server, CLI entry, startup state, Electrobun platform integration, and runtime services.

This layer owns runtime process launch, API readiness, state-dir/config resolution, Electrobun native bridge, app-core API server behavior, and packaged runtime policy. It must not push platform/runtime boot decisions into the renderer.

## Graph Evidence To Read First

- `.understand-anything/master-prompts/runtime-app-core/00-cross-reference-checklist.md`
- `.understand-anything/architecture-debt-report.md`
- `.understand-anything/architecture-debt-report.json`
- `.understand-anything/first-run-runtime-cleanup-brief.md`
- `.understand-anything/domain-graph.json`
- `.understand-anything/diff-overlay.json` after changes

## Cross-Reference Guardrails

Before editing product source:

- Read `00-cross-reference-checklist.md` and follow it as the preflight/postflight contract.
- Read the latest generated slice output if it exists: `.understand-anything/runtime-app-core-boundary-inventory.md`, any slice note produced by the current prompt, and the latest post-change review.
- Use `git diff --name-only` to identify the current dirty file set before edits, then keep the slice scoped to the prompt unless a dependency is proven by `rg` or the graph.
- Compare intended files against the selected layer and adjacent layers in `.understand-anything/architecture-debt-report.json`; name any cross-layer edit before making it.
- Run the stale contract sweep relevant to the prompt: `RuntimeGate`, `runtime=picker`, `DesktopOnboardingRuntime`, `~/.milady`, duplicate API base selectors, browser `SpeechRecognition` packaged-desktop assumptions.
- Do not create a new bridge, selector, fallback, or compatibility path unless you can name the old path it replaces and the verification that proves the new path.

Do not proceed if:

- There is no current-file/current-caller proof for the path being changed.
- The change moves runtime launch/readiness policy into UI or renderer code.
- The change adds a fallback that can make broken startup look successful.
- The change increases cross-layer coupling without an explicit reduction elsewhere in the same slice.
- The verification plan cannot prove the user-visible claim.

After editing:

- Run the narrowest relevant tests and the prompt's `## Verification` steps.
- Run or schedule `09-post-change-diff-review.md`; do not call the slice clean until the review explains changed files, affected layers, risk, and proof.

## Top Runtime App Core Hotspots

| Degree | In | Out | Complexity | File |
| --- | --- | --- | --- | --- |
| 192 | 2 | 190 | complex | `eliza/packages/app-core/scripts/run-mobile-build.mjs` |
| 124 | 2 | 122 | complex | `eliza/packages/app-core/scripts/build-llama-cpp-dflash.mjs` |
| 100 | 0 | 100 | complex | `eliza/packages/app-core/platforms/electrobun/src/index.ts` |
| 77 | 10 | 67 | complex | `eliza/packages/app-core/platforms/electrobun/src/native/agent.ts` |
| 77 | 0 | 77 | complex | `eliza/packages/app-core/test/app/qa-checklist.real.e2e.test.ts` |
| 70 | 1 | 69 | complex | `eliza/packages/app-core/scripts/copy-runtime-node-modules.ts` |
| 61 | 1 | 60 | complex | `eliza/packages/app-core/platforms/electrobun/src/rpc-handlers.ts` |
| 56 | 0 | 56 | complex | `eliza/packages/app-core/platforms/electrobun/remotes/runtime/src/bun/worker.ts` |
| 54 | 30 | 24 | complex | `eliza/packages/app-core/src/api/compat-route-shared.ts` |
| 54 | 2 | 52 | complex | `eliza/packages/app-core/src/runtime/mobile-safe-runtime.ts` |
| 53 | 0 | 53 | complex | `eliza/packages/app-core/platforms/android/app/src/main/java/ai/milady/milady/ElizaAgentService.java` |
| 53 | 1 | 52 | complex | `eliza/packages/app-core/src/api/ios-local-agent-transport.ts` |
| 53 | 5 | 48 | complex | `eliza/packages/app-core/src/api/server.ts` |
| 53 | 0 | 53 | complex | `eliza/packages/app-core/src/benchmark/server.ts` |
| 50 | 0 | 50 | complex | `eliza/packages/app-core/scripts/desktop-build.mjs` |
| 49 | 0 | 49 | complex | `eliza/packages/app-core/scripts/install-android-sms-gateway.mjs` |
| 49 | 0 | 49 | complex | `eliza/packages/app-core/scripts/ios-xcframework/run-physical-device-smoke.mjs` |
| 49 | 0 | 49 | complex | `eliza/packages/app-core/scripts/release-check.ts` |
| 48 | 2 | 46 | complex | `eliza/packages/app-core/src/runtime/eliza.ts` |
| 47 | 2 | 45 | complex | `eliza/packages/app-core/src/benchmark/server-utils.ts` |

## Runtime Cross-Layer Edges

| Count | Layer Pair |
| --- | --- |
| 264 | Runtime App Core -> Agent Core And Shared Contracts |
| 63 | Runtime App Core -> Shared UI And First Run |
| 7 | Plugins Local Inference And App Management -> Runtime App Core |
| 3 | Product Entry And Desktop Shell -> Runtime App Core |
| 2 | Agent Core And Shared Contracts -> Runtime App Core |
| 1 | Runtime App Core -> Plugins Local Inference And App Management |

## Current Cleanup Brief

# First-Run / Voice / Runtime Cleanup Brief

## Desired Ownership

- `Product Entry And Desktop Shell`: app entry, branded renderer selection, desktop packaged tests.
- `Runtime App Core`: runtime process launch, API readiness, state-dir/config resolution, Electrobun native bridge.
- `Shared UI And First Run`: render-only setup shell, controller state, text/voice interaction state, input validation.
- `Plugins Local Inference And App Management`: ASR/TTS/model availability, local inference warmup policy, app/plugin/skill actions.
- `Agent Core And Shared Contracts`: runtime types and contracts only; avoid Milady-specific startup policy here unless it is truly shared.

## Immediate Deslopification Pass

1. **Lock the first-run contract**
   - One state dir: `~/.local/state/milady` via `MILADY_STATE_DIR` / `ELIZA_STATE_DIR` aliasing.
   - One first-run shell: `FirstRunShell`.
   - No stale `RuntimeGate`, `runtime=picker`, `DesktopOnboardingRuntime`, or `~/.milady` paths.

2. **Untangle UI from runtime launch**
   - UI may ask for status and render setup.
   - UI must not decide packaged sidecar process policy.
   - Electrobun/app-core owns launch, readiness, sidecar env, and local embedding warmup policy.

3. **Make voice explicit and local-first**
   - Browser `SpeechRecognition` is not a packaged desktop contract.
   - UI can expose listening/not-listening and text fallback.
   - Local inference owns ASR/TTS readiness and failure messages.

4. **Collapse duplicate provider/runtime paths**
   - Search for multiple runtime base URL selection paths.
   - Keep the path that packaged desktop and dev both prove.
   - Delete compatibility branches with no graph caller and no runtime proof.

5. **Make verification match the claim**
   - Contract-only change: focused unit tests.
   - Startup change: staged desktop build plus fresh state-dir launch.
   - UI/backend connection change: live health/API check plus renderer screenshot/log check.

## Files To Start With

- `eliza/plugins/plugin-local-inference/src/services/dflash-server.ts` (Plugins Local Inference And App Management, degree 132, complex)
- `eliza/packages/agent/src/runtime/eliza.ts` (Agent Core And Shared Contracts, degree 114, complex)
- `eliza/packages/core/src/types/runtime.ts` (Agent Core And Shared Contracts, degree 110, complex)
- `eliza/packages/core/src/runtime/planner-loop.ts` (Agent Core And Shared Contracts, degree 101, complex)
- `eliza/packages/app-core/platforms/electrobun/src/index.ts` (Runtime App Core, degree 100, complex)
- `eliza/packages/core/src/runtime.ts` (Agent Core And Shared Contracts, degree 90, complex)
- `eliza/packages/agent/src/runtime/trajectory-internals.ts` (Agent Core And Shared Contracts, degree 81, complex)
- `eliza/packages/app-core/platforms/electrobun/src/native/agent.ts` (Runtime App Core, degree 77, complex)
- `eliza/packages/app-core/scripts/copy-runtime-node-modules.ts` (Runtime App Core, degree 70, complex)
- `eliza/packages/ui/src/api/client-agent.ts` (Shared UI And First Run, degree 69, complex)
- `eliza/plugins/plugin-local-inference/native/verify/kokoro_e2e_loop_bench.mjs` (Plugins Local Inference And App Management, degree 65, complex)
- `eliza/packages/app-core/platforms/electrobun/src/rpc-handlers.ts` (Runtime App Core, degree 61, complex)
- `eliza/plugins/plugin-local-inference/src/local-inference-routes.ts` (Plugins Local Inference And App Management, degree 59, complex)
- `apps/app/src/main.tsx` (Product Entry And Desktop Shell, degree 58, complex)
- `eliza/packages/core/src/runtime/evaluator.ts` (Agent Core And Shared Contracts, degree 57, complex)
- `eliza/packages/app-core/platforms/electrobun/remotes/runtime/src/bun/worker.ts` (Runtime App Core, degree 56, complex)
- `eliza/packages/app-core/src/runtime/mobile-safe-runtime.ts` (Runtime App Core, degree 54, complex)
- `eliza/packages/core/src/runtime/response-grammar.ts` (Agent Core And Shared Contracts, degree 54, complex)
- `eliza/plugins/plugin-local-inference/src/runtime/ensure-local-inference-handler.ts` (Plugins Local Inference And App Management, degree 54, complex)
- `eliza/packages/agent/src/runtime/plugin-resolver.ts` (Agent Core And Shared Contracts, degree 53, complex)
- `eliza/packages/ui/src/bridge/electrobun-rpc.ts` (Shared UI And First Run, degree 52, complex)
- `eliza/plugins/plugin-local-inference/src/services/engine.ts` (Plugins Local Inference And App Management, degree 52, complex)
- `eliza/plugins/plugin-local-inference/src/services/voice/engine-bridge.ts` (Plugins Local Inference And App Management, degree 52, complex)
- `eliza/plugins/plugin-local-inference/src/services/voice/types.ts` (Plugins Local Inference And App Management, degree 52, complex)
- `eliza/packages/app-core/src/runtime/eliza.ts` (Runtime App Core, degree 48, complex)

## Cut Criteria

- Remove a path if it is old naming, has no graph caller, and no runtime proof depends on it.
- Move behavior if it lives in an outer layer but owns platform/runtime policy.
- Split a file only when the split creates an enforceable ownership boundary, not just smaller files.
- Keep generated reports out of product source unless intentionally promoted to docs.



## Task

Clarify the boundary between Runtime App Core and `plugin-local-inference` for ASR/TTS/model readiness.

## Desired Contract

- app-core may ask local inference for status and expose API routes.
- plugin-local-inference owns local ASR/TTS/model details and readiness/failure messages.
- UI exposes listening/not-listening and text fallback, but does not rely on browser SpeechRecognition as packaged desktop truth.
- Expensive local model warmup is opt-in for packaged startup.

## Search First

- `rg -n "ASR|TTS|SpeechRecognition|transcription|voice|kokoro|whisper|local-inference|embedding warmup|ELIZA_SKIP_LOCAL_EMBEDDING_WARMUP|TRANSCRIPTION" eliza/packages/app-core eliza/packages/ui eliza/plugins/plugin-local-inference apps/app`

## Verification

- plugin-local-inference targeted tests for readiness/warmup behavior.
- UI tests for voice status and text fallback.
- Fresh launch log if startup readiness or local inference routes change.
