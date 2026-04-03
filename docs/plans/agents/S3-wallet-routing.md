# S3 Agent Brief - Wallet Routing + UX Parity

## Status

- Stream: `S3`
- Branch: `codex/wallet-routing`
- PR: pending
- Last updated: `2026-03-26`

## Checklist

- [x] Phase 1: routing abstraction
- [x] Phase 2: 0x integration
- [x] Phase 3: fallback + safety
- [x] Phase 4: route visibility + clearer errors
- [x] Phase 5: tests

## Delivered in this stream

- Added provider-aware trade routing in `bsc-trade` with `auto` / `pancakeswap-v2` / `0x`.
- Added explicit fallback metadata in quote responses (`routeProvider*` fields + notes).
- Added safe fallback behavior from `0x` to PancakeSwap with surfaced attempt notes.
- Added provider-aware unsigned tx handling and approval spender resolution.
- Wired `routeProvider` through trade quote/execute API handlers.
- Added regression coverage for `0x` failure fallback path.

## Validation

- `bunx vitest run packages/app-core/src/api/bsc-trade.test.ts`
- `bunx vitest run packages/agent/test/api/wallet-routes.test.ts`
- `bunx tsc -p packages/agent/tsconfig.json --noEmit`
- `bunx tsc -p packages/app-core/tsconfig.json --noEmit` (fails in current env: missing `vite/client` type definitions)
