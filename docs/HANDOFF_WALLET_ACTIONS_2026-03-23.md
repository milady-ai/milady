# Wallet/Onchain Handoff (March 23, 2026)

## Why This Exists
- User reports severe wallet trust breakage and action reliability issues in Milady.
- Goal is to stabilize wallet provenance, balance display, and onchain action execution before additional UX polish.

## Current User-Visible Failures (Latest Repro)
1. Wallet page shows local wallet mode and copy addresses, but funded Solana wallet still shows `$0.00` / no token row after refresh.
2. Local private key panel can show Solana export while EVM export/details are missing or inconsistent in UI.
3. Agent chat can answer with BSC-only limitation text ("I can only help with transfers on bsc right now") even when Solana wallet exists locally.
4. Cloud status mismatch:
   - Settings page shows "Connected to Eliza Cloud".
   - Billing/dashboard panel can simultaneously show "Not connected to Eliza Cloud. Please log in first."
5. Trajectory exists in Advanced -> Trajectories, but end-user callback text behavior from actions is inconsistent with what trajectory shows happened.

## Confirmed/Important Facts
- This is not a "missing plugin install" issue for baseline wallet actions.
- Actions are wired in runtime; failures are in execution plumbing, response propagation, chain support parity, and UI state coherence.
- Repo is heavily dirty with pre-existing edits; do not revert broad files.

## Changes Already Landed In Working Tree

### 1) Local action fetch hardening
- Added `walletActionFetch(...)` with one controlled auth fallback retry:
  - retry only when first call is 401/403 and Authorization header was present.

Files:
- `packages/agent/src/actions/wallet-action-shared.ts`
- `packages/app-core/src/actions/wallet-action-shared.ts`

### 2) CHECK_BALANCE action improvements
- Switched to `walletActionFetch`.
- Added stronger structured outputs (`values.summary`, `values.chain`) to improve downstream reasoning and follow-through.

Files:
- `packages/agent/src/actions/check-balance.ts`
- `packages/app-core/src/actions/check-balance.ts`

### 3) TRANSFER_TOKEN chain expansion (action layer)
- Added chain param support: `bsc | base | solana` (default `bsc`).
- Chain-aware recipient validation:
  - EVM regex for bsc/base
  - base58 regex for solana
- Added chain context into success/failure outputs.

Files:
- `packages/agent/src/actions/transfer-token.ts`
- `packages/app-core/src/actions/transfer-token.ts`

### 4) Agent transfer route chain support
- Updated `POST /api/wallet/transfer/execute` to accept `chain`.
- EVM support explicitly includes BSC and Base.
- Solana path currently returns explicit user-sign payload (not full local execution).

File:
- `packages/agent/src/api/server.ts`

## Tests Previously Run (Passing)
- `bun test packages/app-core/src/actions/transfer-token.test.ts`
- `bun test packages/app-core/src/actions/check-balance.test.ts`
- `bun test packages/app-core/src/api/server.transfer-permissions.test.ts`
- `bun test packages/agent/test/api/wallet-routes.test.ts`

## Investigation In Progress (Missing Action Response)
The active thread is why CHECK_BALANCE/TRANSFER callbacks do not reliably appear in end-user chat despite trajectories showing action flow.

Current probe path:
1. `scripts/dev-ui.mjs`: remove/simplify log suppression so callback payloads are visible.
2. Chat API route in `packages/agent/src/api/server.ts`: inspect `generateChatResponse` callback plumbing.
3. Core message/action flow in `@elizaos/core` distribution (`processActions`, `DefaultMessageService.handleMessage`) to verify callback timing vs HTTP response lifecycle.
4. Confirm frontend consumes callback/SSE events after initial text response instead of dropping them.

## High-Priority Next Fixes
1. Action callback propagation:
   - instrument callback payload shape at server boundary.
   - ensure callback emissions are forwarded to chat stream/UI.
2. Solana balance visibility:
   - verify wallet address used in UI equals address queried in balance route.
   - verify chain RPC and token/native balance fetch path in wallet routes.
3. Wallet identity coherence:
   - ensure UI consistently surfaces both local EVM and Solana identities when local mode is active.
4. Cloud auth state coherence:
   - unify connected-state source between Settings and Billing dashboard views.
5. Solana transfer parity:
   - implement full local Solana send path (not only user-sign payload).

## Updates Added In This Pass (Post-Handoff Refresh)
1. Wallet source clarity in config API:
   - `/api/wallet/config` now reports:
     - `localEvmKeyPresent`
     - `localSolanaKeyPresent`
     - `managedEvmAddressPresent`
     - `managedSolanaAddressPresent`
   - This supports UI labeling local vs managed wallet mode without guessing from addresses.

2. Transfer action availability with Solana-only local wallets:
   - `TRANSFER_TOKEN` validation now accepts `SOLANA_PRIVATE_KEY` in addition to EVM/Privy checks.
   - Prevents false "BSC-only" behavior when user has only local Solana configured.

3. Solana balance RPC fallback hardening:
   - Added additional default public Solana RPC endpoints to reduce null/zero balance due single-endpoint rate limits.

4. Callback visibility fix in chat response path:
   - Updated `generateChatResponse` stream arbitration so action callbacks are no longer dropped when `onStreamChunk` text arrives first.
   - `callback` chunks now always append; `onStreamChunk` is ignored only after callback mode has started.

## Tests Run In This Pass (Passing)
- `bun test packages/agent/test/api/wallet-routes.test.ts`
- `bun test packages/app-core/src/actions/transfer-token.test.ts`
- `bun test packages/app-core/src/actions/check-balance.test.ts`
- `bun test packages/agent/test/api/wallet-routes.test.ts` (rerun after callback patch)

Known test gap:
- `bun test packages/app-core/src/__tests__/qa-chat.test.ts` fails in current environment with `vi.hoisted is not a function` (test harness/version mismatch), so callback-path validation relied on code inspection + targeted route tests.

## Manual Validation Checklist (After Next Patch)
1. Generate local wallet from UI.
2. Copy Solana address, fund on mainnet/devnet target matching app config.
3. Refresh wallet panel and verify native/token balances populate.
4. In chat, request:
   - "check my bsc balance"
   - "send half my BNB to 0x..."
   - "check my solana balance"
   - "send 0.001 SOL to <address>"
5. In Advanced -> Trajectories, confirm action + callback text matches chat output.
6. In Settings and Billing pages, confirm cloud connection banner/state is consistent.

## Notes For Claude
- Treat wallet provenance concern as a trust/safety blocker: no hidden default/test/demo wallet should be silently selected for user operations.
- Preserve user-facing clarity: if an action cannot execute on a chain, return explicit reason plus exact missing requirement.
- Avoid reverting unrelated modified files; repo contains broad parallel edits.

## Latest Update (Trajectory Debugging Blocker)

### New user-reported blocker
- Trajectory rows are visible but detail payload for recent run was synthetic-only:
  - model: `milady/synthetic-trajectory-fallback`
  - input/output text indicates placeholder insertion with no real LLM call detail.
- This blocks AI-assisted investigation because real action/callback traces are missing in detail view.

### Changes made to address this
1. Trajectories list UX fix (ID visibility):
   - Added explicit `ID` column in trajectories table.
   - Added per-row `Copy` button to copy full trajectory ID directly from UI.

   File:
   - `packages/app-core/src/components/TrajectoriesView.tsx`

2. Trajectory logger selection hardening:
   - Updated `/api/trajectories` logger selection to prefer `DatabaseTrajectoryLogger`
     when multiple route-compatible `trajectory_logger` services are present.
   - Intent: avoid selecting fallback/synthetic logger when DB logger is available.

   File:
   - `packages/agent/src/api/trajectory-routes.ts`

### Tests run for this update
- `bun test packages/agent/test/api-server.e2e.test.ts --filter "GET /api/trajectories prefers route-compatible logger when byType contains core logger"` (pass)
- `bun test packages/agent/test/api-server.e2e.test.ts` (full file pass in this run)

### Required manual verification after restart
1. Restart Milady runtime/app.
2. Trigger a new chat action request (e.g., balance + transfer intent).
3. Open newest trajectory:
   - Confirm detail shows real call/action content (not synthetic placeholder only).
4. Copy trajectory ID from the new list `ID` column and share if synthetic output still appears.

### If synthetic detail still appears
- Next patch should force detail-route fallback to DB-backed trajectory source for that ID,
  even if list/source logger differs.
