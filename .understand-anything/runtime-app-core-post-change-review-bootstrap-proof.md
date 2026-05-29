# Runtime App Core Post-Change Review: Packaged Bootstrap Proof

Date: 2026-05-26
Branch: `codex/first-run-out-of-box-voice`

## Changed Files

- `apps/app/test/electrobun-packaged/windows-bootstrap.ts`
- `apps/app/test/electrobun-packaged/windows-bootstrap.test.ts`

## Affected Layers

- Product Entry And Desktop Shell: packaged desktop test contract.
- Runtime App Core: no product runtime source changed in this slice.

## What Changed

The packaged bootstrap helper now treats only renderer-owned API requests as bootstrap proof:

- `/api/status`
- `/api/first-run/status`
- `/api/config`

It no longer accepts:

- `/api/triggers`
- `/api/stream/settings`
- `/api/drop/status`

The removed paths could be unrelated to the fresh first-run renderer reaching the live API base. `/api/triggers` in particular can come from main-process heartbeat/menu refresh behavior.

## Risk

Low product risk. This tightens test proof only. The main risk is exposing a real packaged startup race that was previously masked by loose request matching.

## Verification Run

- `bunx vitest run --passWithNoTests apps/app/test/electrobun-packaged/windows-bootstrap.test.ts`
  - 1 file passed
  - 3 tests passed
- `node .understand-anything/tmp/build-architecture-debt-report.mjs`
  - highDegreeHubs: 40
  - crossLayerPairs: 10
  - complexFiles: 60
  - miscFiles: 80
  - firstRunRuntimeVoiceNodes: 1957

## Next Cleanup Prompt

Run `02-electrobun-launch-contract.md`.
