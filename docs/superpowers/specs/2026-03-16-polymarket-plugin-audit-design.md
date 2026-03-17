# Polymarket Plugin — Threat-Model-Driven Audit & Remediation Spec

**Date:** 2026-03-16
**Status:** Review-corrected draft (spec review iteration 1 applied)
**Scope:** Full audit of the Polymarket elizaOS plugin (`src/plugins/polymarket/`), focusing on money paths first, then security, reliability, and test coverage.

---

## 1. Context

### What This Plugin Does
The Polymarket plugin integrates prediction market trading into an elizaOS AI agent. It enables:
- Market discovery and research via Gamma API
- Order placement, cancellation, and position management via CLOB API v3
- Portfolio tracking via Data API
- Post-trade risk assessment via an evaluator

### Why This Audit
The plugin is **live with real money** at low stakes but headed toward production scale. No stress testing has occurred. The goal is to identify every issue that could cause financial loss, incorrect behavior, or security exposure — prioritized by the money paths — before scaling up.

### Approach
**Threat-model-driven (Approach B):** Trace every flow that touches funds, audit for correctness against Polymarket's official API documentation, then expand outward. Findings are ranked CRITICAL > HIGH > MEDIUM > LOW.

### Key References
- Polymarket CLOB API docs: `docs.polymarket.com/developers/CLOB/`
- `@polymarket/clob-client` TypeScript SDK
- Polymarket Data API: `data-api.polymarket.com`
- Gamma API: `gamma-api.polymarket.com`

---

## 2. Plugin Architecture Overview

```
┌─────────────────────────────────────┐
│     elizaOS Runtime                 │
│  (Message, State, Memory)           │
└──────────────┬──────────────────────┘
               │
       ┌───────▼────────────┐
       │ polymarketPlugin   │
       ├────────────────────┤
       │ 13 Actions         │ ◄── Agent calls based on intent
       │ 1 Provider         │ ◄── Supplies cached state context
       │ 1 Evaluator        │ ◄── Post-trade risk assessment
       │ 2 Services         │ ◄── PolymarketService, ResearchStorage
       │ 1 Task Worker      │ ◄── Async research executor
       └────────┬───────────┘
                │
    ┌───────────┼───────────┬────────────┬──────────┐
    ▼           ▼           ▼            ▼          ▼
CLOB API    Gamma API   Data API   OpenAI API   Storage
(trading)  (markets)   (positions) (research)  (memory)
```

**Stats:** 35 files, ~11,870 LOC, 10 test files, 15 config keys, 4 API integrations.

---

## 3. Audit Findings

### 3.1 CRITICAL — Direct Financial Loss Risk

#### C1: Market order BUY `amount` semantics are wrong
- **File:** `actions/placeOrder.ts:729-739`
- **Issue:** For FOK/FAK market orders, the plugin passes `amount: size` where `size` is always in shares. Per Polymarket's official docs: *"FOK: A market order to buy **in dollars** or sell **in shares**."* The SDK interface confirms: `UserMarketOrder.amount: number; // BUY: dollar amount, SELL: number of shares`.
- **Impact:** A BUY market order for "20 shares" sends `amount: 20` which the API interprets as **$20 USDC to spend**. At $0.10/share, user gets 200 shares instead of 20 — a **10x over-buy** that scales inversely with price.
- **Fix:** Handle all four cases explicitly:
  - BUY + user specified dollars: `amount = dollarAmount`
  - BUY + user specified shares: `amount = price * size` (convert shares to dollar cost)
  - SELL + user specified shares: `amount = size`
  - SELL + user specified dollars: `amount = Math.floor(dollarAmount / price)` (convert to shares, then pass shares)
  Add unit tests covering all four combinations. The over-buy factor equals `1/price` — at $0.01/share, a 100x over-buy.

#### C2: `tickSize` and `negRisk` not passed to SDK `createAndPostOrder`
- **File:** `actions/placeOrder.ts:741-746`
- **Issue:** The SDK's `createAndPostOrder(userOrder, options?, orderType?)` accepts `CreateOrderOptions` with `tickSize` (required for correct rounding) and `negRisk` (required for neg-risk markets that use a different contract). The plugin passes `undefined` for options. It rounds price manually via `roundToTickSize()` but the SDK may perform internal calculations that depend on knowing the tick size.
- **Impact:** Orders on markets with tick size `0.001` or `0.0001` may be rejected or mispriced. Neg-risk markets use a different exchange contract — without `negRisk: true`, orders route to the wrong contract and fail or execute incorrectly.
- **Fix:** After fetching order book metadata via `parseOrderBookMetadata()` (which already extracts `tickSize` and `negRisk` at orderBook.ts:345-352), pass `{ tickSize: meta.tickSize as TickSize, negRisk: meta.negRisk }` as the second argument to both `createAndPostOrder` and `createAndPostMarketOrder`. The metadata is already being parsed but never passed to the SDK.

#### C3: Balance formatting heuristic misinterprets large balances
- **File:** `services/polymarket.ts:1117-1131`
- **Issue:** `formatBalance()` decides whether a value is "already formatted" or in atomic units using: `if (numValue > 0 && numValue < 1000)`. A balance of $1,000+ USDC is treated as atomic units and divided by 10^6, displaying ~$0.001 instead of $1,000.
- **Impact:** Any account with $1,000+ shows near-zero balance. Breaks risk evaluator concentration checks. Misleads users about available funds.
- **Fix:** First, verify the actual response format from `getBalanceAllowance` in a test environment by logging the raw response (the code comment at line 1114 claims atomic units but this may be wrong). Then either: (a) if values are already human-readable, remove the heuristic and parse as-is, or (b) if values are atomic units, always divide by 10^6 without the threshold heuristic. The current heuristic creates a cliff at exactly $1000 which is guaranteed to break. Add boundary tests for $999.99, $1000.00, and $1000.01.

#### C4: `closePosition` market order missing `orderType` and `tickSize`
- **File:** `actions/closePosition.ts:241-246`
- **Issue:** `createAndPostMarketOrder` is called without `orderType` or `options` parameters. SDK signature: `createAndPostMarketOrder(order, options?, orderType?)`. Missing `orderType` means the SDK may default incorrectly. Missing `tickSize` in options means the SDK can't properly construct the order.
- **Impact:** Position exit may silently fail or use wrong order mechanics, leaving user unable to close when they think they have.
- **Fix:** Pass `OrderType.FOK` explicitly and include `{ tickSize }` from order book metadata.

#### C5: LLM JSON extraction has no runtime type validation
- **File:** `utils/llmHelpers.ts:100-106`
- **Issue:** LLM responses are parsed with `text.match(/\{[\s\S]*\}/)` then `JSON.parse()` with a blind `as T` cast. No schema validation. If the LLM returns `{"price": "fifty cents"}` instead of `{"price": 0.50}`, the string propagates through the order flow, causing `price * size` to return `NaN`, which may default to 0.5 via the fallback logic, creating an order at the wrong price.
- **Impact:** LLM hallucinations become type-unsafe values in money-path code. Any field could be the wrong type with no detection.
- **Fix:** Add Zod schemas for each LLM extraction type (PlaceOrderParams, LLMCancelOrderResult, LLMClosePositionResult). Validate after JSON parse, return error if validation fails.

#### C6: Size calculation uses estimated price, then real price determined later
- **File:** `actions/placeOrder.ts:563-575, 677-688`
- **Issue:** Dollar-to-shares conversion at line 568 uses a price from market search (which may be stale Gamma data). The actual order book price is determined later at line 677-688, but only updates price if `price <= 0 || price === 0.5`. `size` is never recalculated after the real price is known. When the Gamma search price differs from the order book price and triggers an update, a $10 order computed as `size = floor(10/0.50) = 20 shares` gets placed at the new price, costing more or less than $10.
- **Impact:** User spends more than intended when market price diverges from Gamma's cached price. The risk is highest when the initial price was the default $0.50 (see H10).
- **Fix:** Recalculate `size` after the order book price is determined, before order submission. If `isDollarAmount`, recompute `size = Math.floor(dollarAmount / finalPrice)`.

### 3.2 HIGH — Serious Bug or Security Risk

#### H1: No pre-trade balance check
- **File:** `actions/placeOrder.ts` (entire handler)
- **Issue:** Never checks if user has sufficient USDC before submitting. CLOB API rejects it with an opaque error.
- **Fix:** Fetch balance from service cache or API, compare against `price * size`, return clear error if insufficient.

#### H2: Risk evaluator runs POST-action only — no pre-trade gate
- **File:** `evaluators/tradeRisk.ts:37` (`phase: "post"`)
- **Issue:** Trade size ($100 max), spread (10% max), and concentration (25% max) checks are advisory warnings written to memory *after* the order is placed.
- **Fix:** Add a pre-trade validation step in `placeOrder` handler that checks these limits before submission. Make the limits configurable and blocking by default for production.

#### H3: LLM-parsed order parameters have no bounds validation
- **File:** `actions/placeOrder.ts:415-431`
- **Issue:** No upper bound on `size`, no validation that `tokenId` format is valid, no sanity check on total order value. The only guard is `price > 1.0` gets divided by 100 and `size <= 0` is rejected.
- **Fix:** Add bounds: `size <= MAX_TRADE_SIZE`, `0 < price < 1`, `tokenId` matches expected format. Require order value confirmation above a configurable threshold.

#### H4: Race condition in cache invalidation
- **Files:** `placeOrder.ts:780-784`, `closePosition.ts:291-293`
- **Issue:** After a successful order, provider cache and account state are invalidated without locking. Concurrent orders could read stale data between invalidation and refresh.
- **Fix:** Use the existing `accountStatePromise` deduplication pattern. Ensure invalidation + refresh is atomic from the consumer's perspective.

#### H5: Private key fallback chain too permissive
- **File:** `utils/clobClient.ts:8-12`
- **Issue:** Tries 4 different setting names (`POLYMARKET_PRIVATE_KEY`, `EVM_PRIVATE_KEY`, `WALLET_PRIVATE_KEY`, `PRIVATE_KEY`). A generic `PRIVATE_KEY` from another plugin could be used accidentally.
- **Fix:** Only accept `POLYMARKET_PRIVATE_KEY`. Fall back to `EVM_PRIVATE_KEY` with a warning. Remove `WALLET_PRIVATE_KEY` and `PRIVATE_KEY` from the chain.

#### H6: `closePosition` doesn't handle partial fills
- **File:** `actions/closePosition.ts:239-271`
- **Issue:** FOK either fills or fails (correct). But limit fallback at best bid may partially fill. Response says "position closed" but shares may remain.
- **Fix:** After limit order is placed, note it's a limit (already done in text). Add follow-up: check position size after a delay, or explicitly state "limit order placed — position may not close immediately."

#### H7: `getBalance` action bypasses service's `formatBalance`
- **File:** `actions/getBalance.ts:97-102`
- **Issue:** Calls `client.getBalanceAllowance()` directly and displays raw `collateral.balance` string, bypassing the service's formatting. Two different code paths show balances in potentially different formats.
- **Fix:** Route balance display through the service's cached account state for consistency. The `getBalance` action should call `service.getAccountState()` and format from there, not call the CLOB client directly. This ensures one code path for balance formatting.

#### H8: No `min_order_size` enforcement
- **Files:** `utils/orderBook.ts:345-352`, `actions/placeOrder.ts`
- **Issue:** `parseOrderBookMetadata()` extracts `min_order_size` from the order book response but it's never checked against the order size. Orders below minimum fail at the API with a cryptic error.
- **Fix:** After extracting metadata, validate `size >= parseFloat(meta.minOrderSize)`. Return clear error if below.

#### H9: Gamma API rate limiter bypassed in placeOrder
- **File:** `actions/placeOrder.ts:98-102`
- **Issue:** `searchMarketByName()` calls `runtime.fetch(url)` directly for Gamma API, bypassing the token bucket rate limiter in `utils/gammaApi.ts`. This is the most critical Gamma call (in the money path).
- **Fix:** Route through the Gamma API utility with rate limiting, or apply rate limiting in `searchMarketByName`.

#### H10: `price <= 0` silently defaults to $0.50
- **File:** `actions/placeOrder.ts:605-609`
- **Issue:** If no price can be determined from market search or order book, price defaults to $0.50 with only a logger warning. The order then proceeds with this arbitrary price. A user who says "buy 100 shares of X" with no price context gets an order at $0.50 regardless of the actual market price.
- **Impact:** Silent mispricing. On a token trading at $0.05, this is a 10x overpay. On a token trading at $0.95, user gets a bargain that won't fill. Both outcomes are wrong.
- **Fix:** If price cannot be determined from any source (market search, order book), reject the order with a clear error: "Could not determine market price. Please specify a price." Never silently default.

#### H11: Inconsistent private key lookup order across actions
- **File:** `actions/getBalance.ts:50-53` vs `actions/placeOrder.ts:377-381`
- **Issue:** `getBalance` checks keys in order: `WALLET_PRIVATE_KEY` → `PRIVATE_KEY` → `POLYMARKET_PRIVATE_KEY`. But `placeOrder` checks: `POLYMARKET_PRIVATE_KEY` → `EVM_PRIVATE_KEY` → `WALLET_PRIVATE_KEY` → `PRIVATE_KEY`. If different keys are configured for different purposes, these actions could use different wallets — user checks balance on wallet A but trades on wallet B.
- **Impact:** Balance shown doesn't match trading wallet. User may think they have funds when the trading wallet is empty, or vice versa.
- **Fix:** Standardize key lookup order across all actions. Use the same utility function (from `clobClient.ts:getPrivateKey`) everywhere. Fix alongside H5.

### 3.3 MEDIUM — Reliability / Correctness

#### M1: Position value uses cost basis, not current price
- **File:** `evaluators/tradeRisk.ts:114`
- **Issue:** Concentration check uses `size * average_price` (cost basis). A position bought at $0.10 now worth $0.90 appears 9x smaller.
- **Fix:** Use current market price from order book for concentration calculation.

#### M2: Cancel order count from stale cache
- **File:** `actions/cancelOrder.ts:180-188`
- **Issue:** After `cancelAll()`, "cancelled count" comes from stale cached state, not the API response.
- **Fix:** Report "all orders cancelled" without specifying a count, or refresh and count.

#### M3: WebSocket receives messages but does nothing
- **File:** `services/polymarket.ts:1666-1677`
- **Issue:** `onmessage` handler parses messages and logs errors, but doesn't update state or trigger callbacks. Dead code adding complexity.
- **Fix:** Either complete the WebSocket integration or remove it entirely. Currently it consumes resources (connections, timers, reconnect logic) without benefit.

#### M4: Data API fetches positions using EOA address, not proxy wallet
- **File:** `utils/dataApi.ts:16`, `services/polymarket.ts:1021-1024`
- **Issue:** `fetchUserPositions` called with `this.walletAddress` (EOA). Proxy wallet users have positions under the proxy address.
- **Fix:** After proxy wallet detection, use the proxy address for Data API calls.

#### M5: No validation that outcomes/tokenIds/prices arrays align
- **File:** `actions/placeOrder.ts:282-287`
- **Issue:** Gamma API returns `clobTokenIds`, `outcomes`, `outcomePrices` as separate JSON arrays. Code only checks `tokenIds.length === 0`. Misaligned arrays cause wrong token/price selection.
- **Fix:** Validate all three arrays have the same length before using indices.

### 3.4 LOW — Code Quality

- **L1:** `Math.max(...prices)` in `getTokenInfo.ts:142` — while guarded by an empty-array check at line 135, a defensive `if (prices.length === 0) return null` before the Math.max/min calls would be prudent.
- **L2:** Duplicated helpers (`normalizeSetting`, `parseSignatureType`, `parseBooleanSetting`) in `clobClient.ts` and `services/polymarket.ts`. Extract to shared utility.
- **L3:** `placeOrder.ts` is 937 lines. Extract `searchMarketByName()` and related functions to a separate `utils/marketSearch.ts`.
- **L4:** Pervasive `as` type assertions (`as ClobClient`, `as OrderResponse`, `as unknown as Record<string, unknown>`) could mask runtime type mismatches.
- **L5:** `feeRateBps: 0` hardcoded in `closePosition.ts:263,280`. Should use market default.
- **L6:** Unstructured logging — string interpolation instead of structured fields. Hard to analyze in production.
- **L7:** `getOrderDetails` remaining size calculation can produce NaN if fields are undefined (line 117).
- **L8:** `getBalance` action displays balance/allowance without type validation — could show `[object Object]` or `null`.

---

## 4. Test Coverage Assessment

### Current State

| Money Path | Coverage | Status |
|---|---|---|
| Order placement (full flow) | 0% | NOT TESTED |
| Position closing (full flow) | 0% | NOT TESTED |
| Order cancellation (full flow) | 0% | NOT TESTED |
| Balance fetching/parsing | 0% | NOT TESTED |
| Position fetching/PnL calc | 0% | NOT TESTED |
| Dollar-to-shares conversion | 0% | NOT TESTED |
| `deriveBestBid`/`deriveBestAsk` | 0% | NOT TESTED |
| Tick size rounding (utility) | 100% | OK |
| Rate limiter (utility) | 100% | OK |
| Order book metadata parsing | 60% | Partial |
| Data API (happy path only) | 30% | Partial |
| Gamma API (read-only queries) | 40% | Partial |

### What Exists
- 10 test files using vitest with mocks
- Most action tests only validate metadata (name, similes, credential checks) — **not functional behavior**
- Rate limiter and tick size rounding are well-tested (but these are the lowest-risk utilities)

### What's Missing
- **Zero functional tests** for any money path
- No tests for order submission, position closing, or balance fetching
- No tests for error responses (429, 500, timeouts)
- No tests for edge cases (empty order books, NaN prices, zero amounts)
- No tests for LLM parameter extraction quality
- No tests for concurrent operations
- No tests for cache invalidation flows
- Existing mocks don't match production API response shapes

### False Positives
The existing test suite would pass even if:
- Order placement silently fails
- Wrong token selected for YES/NO
- Dollar-to-shares math completely broken
- Balance always returns $0
- Position PnL calculations wrong

---

## 5. Remediation Plan — Phased Approach

### Phase 1: Critical Fixes (Must do before scaling)

**Objective:** Fix all findings that can cause direct financial loss.

| # | Finding | Fix Summary | Files |
|---|---------|-------------|-------|
| 1 | C1 | Fix market order `amount` semantics (BUY=dollars, SELL=shares) | `placeOrder.ts` |
| 2 | C2 | Pass `tickSize` and `negRisk` to SDK order methods | `placeOrder.ts`, `closePosition.ts` |
| 3 | C3 | Remove balance formatting heuristic, parse as-is | `services/polymarket.ts` |
| 4 | C4 | Pass `orderType` and `tickSize` to close position market order | `closePosition.ts` |
| 5 | C5 | Add Zod validation for all LLM-extracted parameters | `utils/llmHelpers.ts`, action files |
| 6 | C6 | Recalculate size after real price is determined | `placeOrder.ts` |
| 7 | H1 | Add pre-trade balance check | `placeOrder.ts` |
| 8 | H3 | Add bounds validation on LLM params | `placeOrder.ts` |
| 9 | H8 | Enforce `min_order_size` from order book | `placeOrder.ts` |
| 10 | H10 | Reject orders when price undetermined (no $0.50 default) | `placeOrder.ts` |
| 11 | H11 | Standardize private key lookup order across all actions | `getBalance.ts`, `clobClient.ts`, all actions |

**Test requirements for Phase 1:**
- Unit tests for corrected market order amount logic (BUY vs SELL)
- Unit tests for dollar-to-shares conversion with real price recalculation
- Unit tests for balance parsing (various formats, boundary values at $999.99/$1000.00/$1000.01, large values)
- Unit tests for Zod LLM validation (valid, invalid, edge cases)
- Integration test for full placeOrder flow (mock CLOB client)
- Integration test for full closePosition flow (mock CLOB client)

### Phase 2: High-Priority Fixes (Should do before production scale)

| # | Finding | Fix Summary | Files |
|---|---------|-------------|-------|
| 1 | H4 | Atomic cache invalidation + refresh | `placeOrder.ts`, `closePosition.ts`, `services/polymarket.ts` |
| 2 | H5 | Restrict private key fallback chain | `utils/clobClient.ts` |
| 3 | H6 | Handle partial fills in close position | `closePosition.ts` |
| 4 | H7 | Unify balance display path through service | `actions/getBalance.ts` |
| 5 | H2 | Add pre-trade risk validation (configurable, blocking) | `placeOrder.ts` |
| 6 | H9 | Route placeOrder Gamma search through rate limiter | `placeOrder.ts` |
| 7 | M1 | Use current price for concentration check | `evaluators/tradeRisk.ts` |
| 8 | M4 | Use proxy address for Data API calls | `services/polymarket.ts`, `utils/dataApi.ts` |
| 9 | M5 | Validate array alignment in market search | `placeOrder.ts` |

**Test requirements for Phase 2:**
- Concurrent order placement tests
- Partial fill scenario tests
- Rate limiter integration tests
- Error response handling tests (429, 500, timeout)
- Edge case tests (empty order books, NaN, boundary prices)

### Phase 3: Cleanup & Hardening (Before sustained production)

| # | Finding | Fix Summary |
|---|---------|-------------|
| 1 | M2 | Fix cancel order count reporting |
| 2 | M3 | Remove or complete WebSocket implementation |
| 3 | L1 | Add defensive guard for Math.max on prices array |
| 4 | L2 | Extract shared helpers to `utils/settings.ts` |
| 5 | L3 | Extract market search to `utils/marketSearch.ts` |
| 6 | L4 | Replace `as` casts with runtime validation |
| 7 | L5 | Make feeRateBps configurable |
| 8 | L6 | Add structured logging |
| 9 | L7-L8 | Fix display NaN/null edge cases |

**Test requirements for Phase 3:**
- Full action metadata and validation tests (already partially exist)
- Display formatting tests (NaN, null, Infinity, large numbers)
- WebSocket lifecycle tests (if keeping)
- Structured logging verification

---

## 6. Implementation Priorities

### Ordering Rationale
1. **Phase 1 first** — these bugs can lose real money today
2. **Phase 2 second** — these bugs cause reliability issues at scale
3. **Phase 3 third** — code quality that prevents future bugs

### Dependencies
- C1 (amount semantics) and C6 (size recalculation) should be fixed together — they interact in the same order flow
- C2 (tickSize) and C4 (closePosition tickSize) are the same fix applied to two files
- C5 (Zod validation) enables H3 (bounds validation) — do C5 first
- H7 (balance unification) depends on C3 (balance heuristic fix) — fix the formatting first, then unify the path
- H11 (key order) should be done alongside H5 (key chain restriction) — both touch the same code
- H10 (reject on undetermined price) interacts with C6 (size recalculation) — both address the stale/default price problem

### Estimated Scope
- **Phase 1:** ~20 files modified, ~45 test cases added (increased from original estimate due to Zod schemas touching all LLM-using actions)
- **Phase 2:** ~10 files modified, ~30 test cases added
- **Phase 3:** ~12 files modified, ~20 test cases added

---

## 7. Risk Assessment Summary

### Before Remediation
- **Financial risk:** HIGH — C1 alone can cause 10x over-buys on market orders
- **Reliability risk:** HIGH — no pre-trade validation, stale price data, empty array crashes
- **Security risk:** MEDIUM — overly permissive key fallback, no LLM output validation
- **Operational risk:** HIGH — 0% test coverage on money paths, no monitoring

### After Phase 1
- **Financial risk:** LOW — all direct-loss bugs fixed, pre-trade validation in place
- **Reliability risk:** MEDIUM — race conditions and partial fills still possible
- **Security risk:** LOW — LLM outputs validated, key chain restricted
- **Operational risk:** MEDIUM — critical paths tested, but gaps remain

### After All Phases
- **Financial risk:** LOW
- **Reliability risk:** LOW
- **Security risk:** LOW
- **Operational risk:** LOW — comprehensive test suite, structured logging, clean architecture
