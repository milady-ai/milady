# Onboarding QA Campaign — Summary

**Date:** 2026-05-10
**Driver:** Claude Opus 4.7 (1M context)
**Scope:** Desktop (Electrobun), Web (Vite), Mobile (Capacitor — iOS + Android), Cloud (Eliza Cloud pairing)

## Net verdict

| Surface | Verdict | Coverage shift |
|---|---|---|
| Web | **PASS** | 0 → 9 e2e cases (W1, W2, W3-absent, W4+W5 gated, W6+W7 absent, W8, W9, W10, W11) + 96 fuzz cases on `flow.ts` |
| Desktop | **DEGRADED (expected)** | Probe wired (opt-in via `MILADY_DESKTOP_QA=1`); operator must launch `bun run dev:desktop` to lift |
| Mobile | **DEGRADED (improving)** | 33 new hardening unit tests; sim/emu smoke scripts in place; build blocker removed |
| Cloud pairing | **PASS** | 0 → 12 mocked C1–C7 scenarios pinning timeouts and failure modes |

Net: **153 new tests pass, 30 expected-fail divergence trackers in place, 2 P0 build blockers resolved, 2 dead components deleted.**

## What shipped

### Docs
- `docs/QA-onboarding.md` — master walkthrough matrix for all four surfaces, including evidence requirements and DEGRADED-marking guidance.
- `docs/QA-onboarding-coverage.md` — live coverage matrix tracking which automated tests cover which steps.
- `docs/onboarding-contracts.md` — wire contracts pinned from source (state keys, HTTP routes, cloud state machine, completion markers, mobile runtime mode).
- `docs/QA-onboarding-followups.md` — ledger of findings NOT fixed in this campaign (now 0 P0, 13 P1/P2, plus the deferred knip pass).
- `AGENTS.md` — new "QA & Testing Protocol" section codifying required tests per change type, lanes, dev observability endpoints, and the evidence-or-it-didn't-happen rule.
- `CLAUDE.md` — new "QA & Testing Quick Reference" section pointing at the docs and commands above.

### Tests (eliza/ subrepo, committed in `9667e5bb1f qa changes`)
- `eliza/packages/app/test/ui-smoke/onboarding-full-flow.spec.ts` — Playwright spec (was 9 cases, 8 after Stage 5a removed the dead-code negative-assertion test).
- `eliza/packages/ui/src/onboarding/__tests__/flow.test.ts` — 96 unit tests exhaustively fuzzing `flow.ts` (forward/back/jump/restart/resume + 200 random walks with fixed seed).
- `eliza/plugins/plugin-elizacloud/__tests__/onboarding-failures.test.ts` — 12 tests covering C1–C7 with mocked timeouts (fake timers) and surfaced 6 production-source smells.
- `eliza/packages/app-core/test/dev-stack/dev-stack-probe.test.ts` — 5 opt-in tests gated by `MILADY_DESKTOP_QA=1`; cleanly skips otherwise.
- `eliza/packages/app/test/ui-smoke/lib/visual-snapshot.ts` — screenshot capture utility wrapping `/api/dev/cursor-screenshot`; graceful fallback when endpoint reports 503/404.
- `eliza/plugins/__tests__/setup-routes-contract.test.ts` — 12 baseline + 30 expected-fail cases pinning the connector setup-routes contract divergence (29% compliance today; normalization is a follow-up).
- `eliza/packages/ui/src/onboarding/__tests__/mobile-runtime-mode-hardening.test.ts` — 33 unit tests covering persistence, Capacitor platform detection, event dispatch, idempotence.

### Local-dev scripts
- `scripts/qa/ios-sim-smoke.sh` — boots iOS sim, runs build:ios + cap sync, captures screenshot. Skip-gracefully on any missing tool.
- `scripts/qa/android-emu-smoke.sh` — same for Android via gradle + adb.
- `scripts/qa/mobile-screenshot-walkthrough.mjs` — init/finalize manifest scaffolder for computer-use-driven walkthroughs.

### Cleanup (committed in `2c01fd60cf chore: preserve current worktree state`)
- Deleted `eliza/packages/ui/src/desktop-runtime/DesktopOnboardingRuntime.tsx` (10-line `return null` stub whose own comment said it was superseded by `installDesktopPermissionsClientPatch`).
- Deleted `eliza/packages/ui/src/components/onboarding/PasswordSetupStep.tsx` (zero production importers).
- Removed mount sites in 3 main.tsx files + 2 type-stub .d.ts files + 1 barrel export.
- Removed obsolete W3 negative-assertion test (asserted absence of dead code; with the code gone, the test is redundant).
- Removed dead `MILADY_DEFAULT_THEME` import + assignment from `apps/app/src/main.tsx` — unblocked `bun run --cwd apps/app build:web` (was failing with `ERR_MODULE_NOT_FOUND`), which transitively unblocked both mobile smoke scripts.

## Verification (Stage 5b)

| Check | Result |
|---|---|
| `bun run verify` | Typecheck PASS; lint failures all in unrelated `apps/app/test/design-review/run-full-crawl.ts` (sibling untracked feature) |
| `bun run build` | PASS in 2m44s; dist artifacts emitted |
| `bun run --cwd apps/app build:web` | PASS in 30s (was failing pre-campaign) |
| `bun run --cwd eliza/packages/shared build` | PASS in 12s |
| `onboarding-failures.test.ts` | 12/12 PASS |
| `flow.test.ts` | 96/96 PASS |
| `mobile-runtime-mode-hardening.test.ts` | 33/33 PASS |
| `setup-routes-contract.test.ts` | 12 PASS + 30 expected-fail (correct) |

## Findings flagged for follow-up

See `docs/QA-onboarding-followups.md` for the full ledger. Highlights:

- **6 production smells in `plugins/plugin-elizacloud/src/onboarding.ts`** — pinned by `onboarding-failures.test.ts` but not fixed. Most notable: C6 provisioning timeout silently returns `{agentId}`, bypassing the fallback prompt; `getAgent` errors are swallowed at debug log level (AGENTS.md §6 violation).
- **Connector setup-routes normalization** — 6 connectors with 6 different path prefixes (`/api/discord-local/`, `/api/telegram-setup/`, `/api/signal/`, `/api/imessage/`, `/api/bluebubbles/`, `/api/documents/`). Contract test currently uses `test.fails()` to track the divergence. Per "no back-compat" policy, normalize to `/api/setup/<connector>/` with shared status/start/cancel endpoints.
- **Knip dead-code pass on onboarding state hooks** — Deferred when the agent hit usage limit. Likely candidates: the `compat`-suffixed route files (`server-onboarding-compat.ts`, `onboarding-compat-routes.ts`, `auth-pairing-compat-routes.ts`) if they're truly back-compat shims rather than live code.
- **Doc-vs-reality mismatch corrections applied** — the original `docs/QA-onboarding.md` was written from an outdated wizard model. Stage 4.1 realigned it to the single-chooser `RuntimeGate` shipping reality.

## Operator handoff to lift remaining DEGRADED

1. **Desktop** — boot `bun run dev:desktop`, then `MILADY_DESKTOP_QA=1 bun run --cwd eliza/packages/app-core test -- dev-stack-probe` should exercise the live screenshot/log endpoints.
2. **Mobile iOS** — resolve the host's CocoaPods Ruby `Encoding::CompatibilityError` (typically `chruby`/`rbenv` with `LANG=en_US.UTF-8`), then `bash scripts/qa/ios-sim-smoke.sh`.
3. **Mobile Android** — install Android SDK platform-tools + at least one AVD, then `bash scripts/qa/android-emu-smoke.sh`.
4. **Mobile computer-use walkthrough** — `node scripts/qa/mobile-screenshot-walkthrough.mjs --init --surface ios`, then drive the simulator manually with the computer-use MCP, capturing M1–M5 PNGs, then `--finalize`.

## Architecture compliance

Stage 4.2 audited the new test files against AGENTS.md commandments. 17 must-fix violations were resolved in place (mostly `as unknown as` casts and one real type-check escape in flow.test.ts that was silently turning a string comparison into a passing assertion). 5 should-fix items are documented in the followup ledger; none are blocking.

## Campaign telemetry

- Stages executed: 7 (0, 1, 2, 3, 4, 5a, 5b, 6)
- Parallel sub-agents dispatched: 24
- Tool calls: ~1000+
- Wall clock: ~2.5 hours
- Cache hits via /loop / chapter system: 8 chapters

