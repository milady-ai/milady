# Runtime App Core Boundary Inventory

Date: 2026-05-27
Branch: `develop`
Commit: `0331c6ed3`

## Current Ownership

| Concern | Current owner files | Notes |
| --- | --- | --- |
| Packaged runtime process launch | `eliza/packages/app-core/platforms/electrobun/src/native/agent.ts`, `eliza/packages/app-core/platforms/electrobun/src/index.ts` | Electrobun/app-core owns local sidecar launch, health polling, child env, auth token seeding, and readiness push to renderer. |
| API base selection | `eliza/packages/app-core/platforms/electrobun/src/api-base.ts`, `eliza/packages/app-core/platforms/electrobun/src/lifecycle/api-base-owner.ts`, packaged tests under `apps/app/test/electrobun-packaged/` | External API env wins only when explicit. Local desktop resolves loopback port and pushes renderer-facing API base. |
| First-run API | `eliza/packages/app-core/src/api/first-run-routes.ts`, `eliza/packages/app-core/src/api/server-first-run-helpers.ts`, `apps/app/test/electrobun-packaged/live-api.ts` | Live packaged tests seed first-run through the real API server helper, not the mock API path. |
| State-dir/config | `eliza/packages/app-core/platforms/electrobun/src/native/agent.ts`, `eliza/packages/app-core/src/first-run/first-run-config.ts`, shared env alias helpers from `@elizaos/shared` | Desktop child env now sets both `ELIZA_STATE_DIR` and `MILADY_STATE_DIR` to the same resolved state root. |
| Electrobun native RPC/bridge | `eliza/packages/app-core/platforms/electrobun/src/rpc-handlers.ts`, `eliza/packages/app-core/platforms/electrobun/src/rpc-schema.ts`, `eliza/packages/ui/src/bridge/electrobun-rpc.ts` | RPC schemas live in app-core; UI consumes the bridge. Keep process policy out of UI. |
| Renderer entry | `apps/app/src/main.tsx` | Product shell consumes app-core boot config and renderer patches. It must not choose packaged launch policy. |
| Local voice / inference readiness | `eliza/packages/app-core/platforms/electrobun/src/voice/*`, `eliza/plugins/plugin-local-inference/src/*`, `eliza/packages/ui/src/hooks/useVoiceChat.ts`, `eliza/packages/ui/src/voice/*` | app-core may expose status and desktop voice service, but model/ASR/TTS availability belongs to local inference. Browser `SpeechRecognition` is not packaged desktop proof. |

## Suspect Layer Leaks

- `eliza/packages/app-core/src/browser.ts` intentionally re-exports UI surface APIs. Treat as public browser bundle compatibility, not runtime launch policy.
- `eliza/packages/app-core/src/services/app-updates/update-policy.ts` imports UI build/platform helpers. This is a likely contract-placement issue for the UI leakage prompt.
- `eliza/packages/app-core/src/api/ios-local-agent-transport.ts` imports UI transport/runtime-mode helpers. This should be checked before mobile/runtime cleanup.
- `eliza/packages/app-core/src/runtime/desktop/*` imports many UI components because it renders detached desktop surfaces. Do not touch in Runtime App Core launch work unless the goal is explicitly renderer composition.
- `apps/app/src/main.tsx` still contains local stubs and product patches for unpublished UI/app-core exports. Keep those isolated; do not move runtime ownership there.

## Files Safe To Edit First

- `apps/app/test/electrobun-packaged/windows-bootstrap.ts`
- `apps/app/test/electrobun-packaged/windows-bootstrap.test.ts`
- `apps/app/test/electrobun-packaged/electrobun-windows-startup.e2e.spec.ts`
- `eliza/packages/app-core/platforms/electrobun/src/api-base.ts`
- `eliza/packages/app-core/platforms/electrobun/src/native/agent-state-dir.test.ts`
- `eliza/packages/app-core/platforms/electrobun/src/native/agent.ts`, only for state-dir/env or launch-contract changes with focused tests

## Files Requiring Runtime Proof Before Edits

- `eliza/packages/app-core/platforms/electrobun/src/index.ts`
- `eliza/packages/app-core/platforms/electrobun/src/native/agent.ts` launch/spawn paths
- `eliza/packages/app-core/platforms/electrobun/src/rpc-handlers.ts`
- `eliza/packages/app-core/platforms/electrobun/remotes/runtime/src/bun/worker.ts`
- `eliza/packages/app-core/src/api/server.ts`
- `apps/app/src/main.tsx`
- `eliza/packages/ui/src/hooks/useVoiceChat.ts`
- `eliza/packages/ui/src/voice/voice-capture-factory.ts`

## Current Prompt Pass

This pass refreshed the inventory after the root CI pin update. No product source was changed during the prompt sweep.

Required commands run:

- `rg -n "stateDir|STATE_DIR|MILADY_STATE_DIR|ELIZA_STATE_DIR|first-run|FirstRun|runtime|sidecar|health|ready|electrobun|api" eliza/packages/app-core apps/app/test/electrobun-packaged`
- `rg -n "from ['\"]@elizaos/ui|from ['\"].*packages/ui|from ['\"]@elizaos/core|from ['\"]@elizaos/shared" eliza/packages/app-core`
- `node .understand-anything/tmp/build-architecture-debt-report.mjs`

Prompt sweeps run:

- `02-electrobun-launch-contract.md`: matching launch/env/error-formatting files are concentrated in `eliza/packages/app-core/platforms/electrobun/src/index.ts`, `src/native/agent.ts`, `src/launch/*`, `src/rpc-*`, the runtime remote worker, and packaged tests.
- `03-state-dir-config-contract.md`: stale `~/.milady` references remain primarily in docs, examples, and deploy env examples; runtime state-dir aliases remain active through `MILADY_STATE_DIR` / `ELIZA_STATE_DIR`.
- `04-api-readiness-connection.md`: API base/readiness code is split across Electrobun `api-base`, lifecycle ownership, packaged test harnesses, app-core server routes, and UI startup state.
- `05-ui-import-leakage.md`: the main current leaks remain app-core imports from `@elizaos/ui` in iOS transport, app update policy, runtime desktop renderers, browser compatibility exports, and tests.
- `06-local-inference-voice-contract.md`: browser `SpeechRecognition` remains in UI fallback paths; packaged/local ASR/TTS readiness is otherwise concentrated in app-core Electrobun voice and `plugin-local-inference`.
- `07-packaged-startup-verification.md`: desktop staging was attempted with `desktop-build.mjs stage --variant=base`. It first exposed missing local tool shims (`tsc`, then `tsx`), which were restored by frozen installs, but both installs failed on optional `@discordjs/opus` native compilation under Node 25/Python 3.14. The final staging attempt progressed to runtime dependency bundling and then failed with `ENOSPC` while copying into ignored `dist/node_modules`.
- `08-stale-path-deletion-sweep.md`: stale terms remain in historical audit/QA docs, homepage docs, `.env.example`, and a few current UI startup comments. Deletion requires a docs/state-dir cleanup slice, not a drive-by edit.

## Verification

- `node .understand-anything/tmp/build-architecture-debt-report.mjs`
- Root GitHub Actions for `0331c6ed3` are green: `gitleaks`, `CodeQL`, `CI`, `soc2-verify`, and `Build Agent Image`.
- `desktop-build.mjs stage --variant=base` did not complete locally: disk space exhausted at 116 MiB free while copying runtime dependencies into ignored `dist/node_modules`.

## Next Prompt

Run `03-state-dir-config-contract.md` as the next implementation slice if the goal is to enforce `~/.local/state/milady` across docs/examples/tests. Run `05-ui-import-leakage.md` first if the goal is to reduce the `Runtime App Core -> Shared UI And First Run` graph count.
