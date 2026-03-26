# `v2.0.0-alpha.126` Draft Release Notes

## Release status
- Release prep branch merged into local `develop`
- Fork branch pushed: `dutchiono:codex/release-alpha-126-develop`
- PR opened against upstream `develop`: [#1368](https://github.com/milady-ai/milady/pull/1368)
- Canonical release workflow dispatch is still blocked on upstream repo permissions

## Official summary since `v2.0.0-alpha.125`

### Desktop / runtime fixes
- Eliminated a broad set of silent failures across cloud, wallet, knowledge, and runtime paths.
- Re-enabled the autonomy loop so heartbeat and trigger instructions execute again.
- Stabilized desktop UI regression coverage and cleaned up related typecheck drift.
- Fixed workspace boilerplate detection to be case-insensitive during setup.

### Onboarding / cloud / provider fixes
- Improved onboarding and settings flows across the desktop shell refresh.
- Fixed onboarding preview routing and TTS helper gaps.
- Improved cloud detection and graceful handling when cloud agents are unavailable.
- Kept provider abstraction work moving forward, but it is not finalized in this release.

### Wallet / onchain fixes
- Hardened wallet conversation execution paths in chat.
- Added deterministic wallet fallback routing for balance, send, and trade intents.
- Fixed the live BSC wallet send path so conversational send can complete with a tx hash.
- Restored the wallet trade execute route on `develop` so the release branch matches the wallet server path expected by the tests.
- `/api/wallet/config` now reports wallet capability readiness fields needed by the desktop and tests.
- Live BSC testnet conversational **send** is working.
- Live **swap** is still in progress and should not be claimed as complete in this release.

### Windows / packaging / supportability
- Regenerated the Windows ICO with all standard sizes for installer/runtime icon correctness.
- Continued cleanup around supportability, CI parity, and startup warnings.

### Docs / support
- Added a release-facing wallet conversation status summary.
- Continued docs and review-follow-up cleanup around security and reliability notes.

## Yesterday's patches and fixes

### High-signal fixes
- `fix: eliminate 19 silent failures across cloud, wallet, knowledge, runtime (#1356)`
- `fix: enable autonomy loop so heartbeat/trigger instructions execute (#1354)`
- `fix: regenerate Windows ICO with all standard sizes (#1353)`
- `fix: remove dangling test file reference`

### Prompt / compaction / security follow-up
- `fix: double compaction, WeakSet guard, compactModelPrompt tests`
- `fix: word boundaries on multilingual keywords, installPromptOptimizations tests`
- `fix: remove security/social eval bypass — belongs upstream in eliza`
- `fix: review feedback — security docs, multilingual intent, test split`
- `fix: gitignore .tmp/, fix security docs, narrow issue regex, verify schema`
- `fix: remove prompt injection vector, tighten intent keywords, add tests`
- `fix: restore MILADY_CAPTURE_PROMPTS for dev prompt analysis`
- `fix: startup warnings, action map validation, review feedback`
- `fix: make security eval dynamic per message source`
- `fix: flip security eval default to disabled, document env vars in CLAUDE.md`
- `fix: restore security eval bypass + social throttling with MILADY_* naming`

### Wallet conversation milestone included for `alpha.126`
- BSC testnet conversational send now works live with tx-hash reply/log proof.
- Swap remains unfinished and should stay out of release claims.
- Steward has not replaced the other wallet backends in this release.

## Focused verification run on release prep
- `bunx vitest run --config vitest.e2e.config.ts packages/agent/test/api-server.e2e.test.ts -t "wallet mode guidance fallback"`
- `bunx vitest run packages/app-core/src/actions/check-balance.test.ts packages/app-core/src/actions/transfer-token.test.ts packages/app-core/src/actions/execute-trade.test.ts packages/agent/test/api/wallet-trade-routes.test.ts`

## Merge and release runbook
1. Merge [PR #1368](https://github.com/milady-ai/milady/pull/1368) into `develop`.
2. Open [release-electrobun workflow](https://github.com/milady-ai/milady/actions/workflows/release-electrobun.yml).
3. Click `Run workflow`.
4. Select branch `develop`.
5. Set tag to `v2.0.0-alpha.126`.
6. Keep `draft = true`.
7. Verify the workflow creates the draft release and attaches the platform artifacts.
