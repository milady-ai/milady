# Runtime App Core Post-Change Review: Electrobun Launch Env

Date: 2026-05-26
Branch: `codex/first-run-out-of-box-voice`

## Changed Files

- `eliza/packages/app-core/platforms/electrobun/src/native/agent.ts`
- `eliza/packages/app-core/platforms/electrobun/src/native/agent-state-dir.test.ts`

## Affected Layers

- Runtime App Core: Electrobun native sidecar launch environment.

## What Changed

Packaged startup no longer assumes `ELIZA_NAMESPACE` and `PATH` are present in the parent process environment before spawning the runtime child.

- `resolveDesktopChildNamespace` resolves a non-empty namespace from `ELIZA_NAMESPACE`, brand config, or `eliza`.
- `prependDesktopChildPathDirectory` prepends the bundled Bun directory even when `PATH` is missing.

This keeps sidecar startup deterministic in a fresh packaged environment instead of relying on shell-style env shape.

## Risk

Low runtime risk. The change preserves existing explicit namespace and PATH behavior, but removes crashes for missing env keys.

## Verification Run

- `bunx vitest run --config vitest.electrobun.config.ts --passWithNoTests src/native/agent-state-dir.test.ts`
  - 1 file passed
  - 6 tests passed
- `bun run typecheck`
  - ran in `eliza/packages/app-core/platforms/electrobun`
  - passed
- `node .understand-anything/tmp/build-architecture-debt-report.mjs`
  - highDegreeHubs: 40
  - crossLayerPairs: 10
  - complexFiles: 60
  - miscFiles: 80
  - firstRunRuntimeVoiceNodes: 1957

## Next Cleanup Prompt

Continue `02-electrobun-launch-contract.md`, then run `07-packaged-startup-verification.md` once the staged desktop launch path is ready to prove end-to-end.
