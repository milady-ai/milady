# Master Delivery Board - 2026-03-26

This is the top-level tracker for the parallel projects discussed.

## Streams

1. `S1` Issue `#1170` conflict-audit execution
2. `S2` Windows crash telemetry + supportability hardening
3. `S3` Wallet execution track (0x routing + fallback + UX parity)
4. `S4` zh-CN companion input-lock regression
5. `S5` Tutorials + onboarding guidance + support docs (Chinese-first)

## Current Snapshot

- `S1` in progress (`PR #1343`)
- `S2` in progress on `PR #1358` (branch pushed, CI/review pending)
- `S3` in progress on `PR #1363` (Provider abstraction, 0x fallback path, route visibility fields, and tests landed.)
- `S4` issue opened (`#1359`), fix not started
- `S5` in progress on `codex/docs-onboarding-support` (docs + onboarding/support copy implemented; PR pending)

## S3 Notes

- Added routing preference support in trade quote requests.
- Added route provider transparency fields in shared wallet contracts.
- Added safe provider fallback behavior and clearer provider-attempt error notes.
- API handlers now pass routing preference through quote and execute paths.
- Local validation complete except one ambient app-core type dependency gap (`vite/client`) in this environment.
## Branch/PR Discipline

- One stream = one branch = one PR.
- No mixed commits across streams.
- Use branch prefix `codex/`.
- Keep checklist updates in each stream plan file.
