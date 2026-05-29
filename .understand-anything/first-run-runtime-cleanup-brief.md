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
