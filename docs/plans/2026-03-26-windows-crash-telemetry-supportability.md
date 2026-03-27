# Stream S2 - Windows Crash Telemetry + Supportability

## Goal

Turn low-signal “it crashes immediately” reports into actionable diagnostics for Windows installer + desktop launch path.

## Branch / PR

- Branch: `codex/win-reporting`
- PR: `#1358` (https://github.com/milady-ai/milady/pull/1358)

## Scope

- Startup crash/recovery report standardization.
- Bug report bundle enrichment.
- Browser Surface sandbox crash fix.
- Bug report default repo routing to `milady-ai/milady`.
- Windows packaged startup survivability check hardening.

## Out of Scope

- Wallet router migration.
- General docs/tutorial expansion.
- Broad UX audit backlog.

## Implemented Items

- [x] Standardized startup crash report payload and copy guidance.
- [x] Added report file write fallback path.
- [x] Added startup diagnostics + log tail into bug report JSON bundle.
- [x] Fixed Browser Surface `sandbox` getter-only crash path.
- [x] Switched bug report default repo to `milady-ai/milady` + env override.
- [x] Hardened packaged Windows startup e2e dwell check.
- [x] Added/updated targeted tests.

## Remaining

- [x] Commit local changes.
- [x] Push branch.
- [x] Open PR with focused scope statement.
- [ ] Run full CI and address any non-target regressions.

## Acceptance

- No more Browser Surface crash on getter-only sandbox property runtime.
- Startup failures produce copyable support report with diagnostics/log tail.
- Bug-report fallback URL points to `milady-ai/milady`.
- Targeted test suite passes.
