# Runtime App Core Post-Change Review: Runtime Entry Layout

Date: 2026-05-26
Branch: `codex/first-run-out-of-box-voice`

## Changed Files

- `eliza/packages/app-core/platforms/electrobun/src/native/agent.ts`
- `eliza/packages/app-core/platforms/electrobun/src/native/agent-runtime-layout.test.ts`

## Affected Layers

- Runtime App Core: packaged sidecar runtime entry resolution.

## What Changed

The launch code said packaged runtime entries may live at either `entry.js` or `runtime/entry.js`, but the resolver only checked `entry.js`. The resolver now checks both, preserving root `entry.js` preference while accepting the packaged `runtime/entry.js` layout.

## Risk

Low. This only expands accepted packaged layouts and keeps the existing preferred layout unchanged.

## Verification Run

- `bunx vitest run --config vitest.electrobun.config.ts --passWithNoTests src/native/agent-state-dir.test.ts src/native/agent-runtime-layout.test.ts`
  - 2 files passed
  - 8 tests passed
- `bun run typecheck`
  - ran in `eliza/packages/app-core/platforms/electrobun`
  - passed

## Next Cleanup Prompt

Continue `02-electrobun-launch-contract.md` for runtime dist/Bun executable path proof, then run `07-packaged-startup-verification.md`.
