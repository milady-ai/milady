# Plugin Polymarket Improvements — Design Spec

**Date**: 2026-03-13
**Plugin**: `@elizaos/plugin-polymarket` v2.0.0-alpha.7
**Repo**: `elizaos-plugins/plugin-polymarket` (consumed as dependency in `milady`)
**Scope**: Bug fixes, missing trading actions, trade risk evaluator, enhanced portfolio provider

---

## Context

The plugin currently ships 7 actions, 1 service, 1 provider, and 0 evaluators. It handles market discovery, token info, order placement, orderbook depth, order details, order scoring, and deep research. The agent operates on-demand (user asks, agent acts) — no real-time monitoring or automated strategies.

### Problems to Solve

1. **Orderbook parsing bug**: `getTokenInfo` and `placeOrder` trust index 0 of the bid/ask arrays, which may not be the best price when the CLOB API returns unsorted levels.
2. **No cancel order action**: Can place orders but cannot cancel them.
3. **No close position action**: No way to exit a position without manually constructing a sell order.
4. **No risk assessment**: The evaluators array is empty — no guardrails on trade size, spread, or portfolio concentration.
5. **Provider lacks P&L**: Account state provider shows positions and orders but not unrealized P&L or portfolio-level metrics.

---

## Development Setup

The plugin is consumed as a pre-built npm package (`node_modules/@elizaos/plugin-polymarket`). To modify it:

1. **Fork** `elizaos-plugins/plugin-polymarket` to `hellopleasures/plugin-polymarket`
2. **Clone** the fork and work in `typescript/` source directory
3. **Build** with `bun run build` (uses the existing `build.ts` config)
4. **Test locally** by pointing milady's dependency to the fork:
   - In milady's `package.json`: `"@elizaos/plugin-polymarket": "file:../plugin-polymarket/typescript"` or use `bun link`
5. **Publish** updated versions to npm or keep as a git dependency

All file paths in this spec reference the **forked source** at `typescript/`, not the bundled dist.

---

## Section 1: Orderbook Parsing Fix

### What Changes

In both `getTokenInfo` and `placeOrder`, replace direct index access (`bids[0]`, `asks[0]`) on bid/ask arrays with proper best-price derivation.

### Implementation

```typescript
// Best bid = highest price across all bid levels
const bestBid = bids.reduce((best, level) => {
  const price = parseFloat(level.price);
  return Number.isFinite(price) && price > best ? price : best;
}, 0);

// Best ask = lowest price across all ask levels
const bestAsk = asks.reduce((best, level) => {
  const price = parseFloat(level.price);
  return Number.isFinite(price) && price < best ? price : best;
}, Infinity);
```

### Files Affected

- `typescript/actions/getTokenInfo.ts` — `calculatePricing()` function
- `typescript/actions/placeOrder.ts` — auto-price selection logic

### Validation

- Both files use identical derivation logic with `Number.isFinite()` guard
- Fallback: if no valid levels exist, return 0 for bid and Infinity for ask (existing error paths handle this)
- Unit tests for the parsing logic (see Section 6)

---

## Section 2: Cancel Order Action

### Action: `POLYMARKET_CANCEL_ORDER`

**Purpose**: Cancel one or more open orders, or cancel all open orders.

**Trigger phrases**: "cancel order", "cancel my orders", "cancel all orders", "remove order"

**Parameters** (extracted via LLM):
- `orderIds`: string[] — specific order IDs to cancel (optional)
- `cancelAll`: boolean — if true, cancel all open orders (optional)
- `tokenId`: string — cancel all orders on a specific token/market (optional)

At least one must be provided.

**Auth required**: L1 + L2 (same as placeOrder)

**CLOB Client API Mapping**:

The `@polymarket/clob-client` exposes three cancel methods:
- `cancelOrder(payload: OrderPayload)` — cancel a single order by `orderID`
- `cancelOrders(ordersHashes: string[])` — cancel multiple orders by their **hashes** (not IDs)
- `cancelAll()` — cancel all open orders server-side
- `cancelMarketOrders(payload: OrderMarketCancelParams)` — cancel all orders for a specific `asset_id`

**Flow**:
1. Validate credentials
2. Extract parameters via LLM with regex fallback
3. Route to appropriate CLOB method:
   - If `cancelAll` is true → call `client.cancelAll()`
   - If `tokenId` provided → call `client.cancelMarketOrders({ asset_id: tokenId })`
   - If specific `orderIds` → call `client.cancelOrder({ orderID })` for each (note: uses orderID, not hash)
4. Invalidate account state cache
5. Return confirmation with count and details of cancelled orders

**Error cases**:
- No open orders to cancel → informative message, not an error
- Invalid order ID → report which IDs failed
- Missing credentials → validation rejects before handler

**LLM Template**:
```
Extract cancel order parameters from the user message.
Return JSON with:
- "orderIds": array of order ID strings (if specific orders mentioned)
- "cancelAll": true if user wants to cancel ALL orders
- "tokenId": token ID if user wants to cancel orders for a specific market/token
At least one of orderIds, cancelAll, or tokenId must be provided.
```

---

## Section 3: Close Position Action

### Action: `POLYMARKET_CLOSE_POSITION`

**Purpose**: Exit a position on a specific token by selling all held shares.

**Trigger phrases**: "close position", "exit position", "sell all", "close my position on"

**Parameters** (extracted via LLM):
- `tokenId`: string — the token to close position on (required, or derived from market name)
- `marketName`: string — natural language market name for lookup (optional, fallback)
- `cancelOpenOrders`: boolean — also cancel open orders on this token (default: true)
- `orderType`: "limit" | "market" — how to exit (default: "market" for immediate exit)

**Auth required**: L1 + L2

**Position side handling**: The user may hold YES or NO tokens. The action must:
- Detect which side the user holds from position data
- Construct the sell order for the correct token ID (YES token vs NO token)
- The `side` field on the order is always `SELL` but the `tokenId` determines which outcome is being sold

**Flow**:
1. Validate credentials
2. Extract parameters via LLM
3. Resolve token ID (direct or via market name search)
4. Fetch user's position — determine held side (YES/NO) and size
5. If no position → inform user, return early
6. If `cancelOpenOrders` (default true): call `client.cancelMarketOrders({ asset_id: tokenId })`
7. If `orderType` is "market" (default):
   - Use `client.createAndPostMarketOrder()` with FOK for immediate fill
   - If FOK fails (insufficient liquidity), fall back to GTC limit at best bid
8. If `orderType` is "limit":
   - Fetch orderbook, derive best bid price
   - Place SELL order at best bid (GTC)
9. Invalidate account state cache
10. Return confirmation: side closed, shares sold, price, estimated proceeds

**Error cases**:
- No position found → informative message
- Zero liquidity on bid side → warn user, do not place order
- Market order partial fill → report what filled and what didn't
- FOK rejection → fall back to limit order, inform user

---

## Section 4: Trade Risk Evaluator

### Evaluator: `POLYMARKET_TRADE_RISK`

**Purpose**: Runs after order placement to assess risk and log trades. Advisory only — warns but does not block.

**Triggers on**: Messages where `placeOrder` action was just executed

**ElizaOS Evaluator interface compliance**:
```typescript
{
  name: "POLYMARKET_TRADE_RISK",
  description: "Evaluates trade risk after order placement",
  similes: ["TRADE_RISK_CHECK", "ORDER_RISK_ASSESSMENT"],
  phase: "post",  // runs after action execution
  alwaysRun: false,
  examples: [
    // Example: large order triggers concentration warning
    // Example: wide spread triggers illiquidity warning
  ],
  validate: async (runtime, message) => { /* check if placeOrder was executed */ },
  handler: async (runtime, message) => { /* perform risk checks, write to memory */ }
}
```

**Checks performed**:

1. **Position concentration**: If this trade puts >25% of total balance into a single market, warn.
   - Configurable via `POLYMARKET_MAX_POSITION_PCT` (default: 25)
2. **Spread check**: If the bid-ask spread exceeds 10%, warn about illiquidity.
   - Configurable via `POLYMARKET_MAX_SPREAD_PCT` (default: 10)
3. **Size check**: If trade size exceeds a configurable dollar threshold, warn.
   - Configurable via `POLYMARKET_MAX_TRADE_SIZE_USD` (default: 100)

**Output mechanism**: The evaluator communicates results by creating a memory entry via `runtime.createMemory()` with the risk assessment. This memory is then available in the agent's context for subsequent responses. The handler returns `void` per the ElizaOS Evaluator interface.

**Implementation notes**:
- Reads account state from the cached provider data (no extra API calls)
- Risk assessment is written as a structured memory entry with fields: `riskLevel`, `warnings[]`, `tradeDetails`

---

## Section 5: Enhanced Portfolio Provider

### Changes to `polymarketProvider`

Extend the existing provider's account state output to include:

1. **Unrealized P&L per position**:
   - Fetch current best bid for each held token
   - Calculate: `(currentPrice - position.average_price) * positionSize`
   - Note: position data uses `average_price` field (not `avgEntryPrice`)
   - Note: existing position data has `realized_pnl` but `unrealized_pnl` is hard-coded to "0.000000" — this calculation replaces that
   - Display as dollar amount and percentage

2. **Portfolio summary metrics**:
   - Total portfolio value (sum of all position values at current bid)
   - Total unrealized P&L
   - Number of open positions
   - Number of active orders

3. **Risk indicators** (from evaluator thresholds):
   - Largest position as % of portfolio
   - Any positions in illiquid markets (wide spread)

### Performance consideration

- P&L calculation requires fetching current prices for each position
- Batch via `getOrderBooks()` bulk API (already used by `getOrderBookDepth`)
- Cache results with same 30-minute TTL as existing account state
- Only fetch prices for positions with non-zero size

---

## Section 6: Tests

Minimum test coverage for the critical paths:

1. **Orderbook parsing** (Section 1):
   - Unsorted bid/ask arrays → correct best price derivation
   - Empty arrays → graceful fallback
   - Invalid price values (NaN, Infinity, negative) → filtered out
   - Single-level orderbook → correct result

2. **Cancel order parameter extraction**:
   - "cancel all" → `cancelAll: true`
   - "cancel order abc123" → `orderIds: ["abc123"]`
   - "cancel orders on token xyz" → `tokenId: "xyz"`

3. **Close position side detection**:
   - User holds YES tokens → correct sell order construction
   - User holds NO tokens → correct sell order construction
   - No position → early return

Test framework: Vitest (already configured in `package.json`).

---

## Implementation Order

1. **Orderbook parsing fix** — foundation, everything else depends on correct pricing
2. **Tests for orderbook parsing** — validate the fix before building on it
3. **Cancel order action** — standalone, uses native CLOB client methods
4. **Close position action** — depends on correct orderbook parsing (#1) and cancel (#3)
5. **Enhanced portfolio provider** — depends on correct pricing (#1)
6. **Trade risk evaluator** — depends on enhanced provider (#5) for portfolio data

---

## Files to Create / Modify

### New files:
- `typescript/actions/cancelOrder.ts`
- `typescript/actions/closePosition.ts`
- `typescript/evaluators/tradeRisk.ts`
- `typescript/__tests__/orderbook.test.ts`
- `typescript/__tests__/cancelOrder.test.ts`
- `typescript/__tests__/closePosition.test.ts`

### Modified files:
- `typescript/actions/getTokenInfo.ts` — orderbook fix
- `typescript/actions/placeOrder.ts` — orderbook fix
- `typescript/providers/polymarketProvider.ts` — P&L and portfolio metrics
- `typescript/index.ts` — register new actions and evaluator
- `typescript/templates.ts` — add LLM templates for cancel/close
- `typescript/types.ts` — add types for cancel/close params and evaluator config
- `typescript/package.json` — add new config params to `agentConfig.pluginParameters`

---

## Configuration

New environment variables (all optional):

| Variable | Default | Description |
|----------|---------|-------------|
| `POLYMARKET_MAX_POSITION_PCT` | `25` | Max % of balance in a single market before warning |
| `POLYMARKET_MAX_SPREAD_PCT` | `10` | Max bid-ask spread % before warning |
| `POLYMARKET_MAX_TRADE_SIZE_USD` | `100` | Max single trade size in USD before warning |

Added to `agentConfig.pluginParameters` in the forked plugin's `package.json`.

---

## Out of Scope

- WebSocket real-time streaming (not needed for on-demand agent)
- Automated strategy execution / market making
- Stop-loss / take-profit automation
- Upstream PR to `elizaos-plugins/plugin-polymarket` (repo appears dormant)

---

## Success Criteria

- Agent can place, cancel, and close positions through natural language
- Close position correctly handles YES vs NO token sides
- Orderbook prices are accurate regardless of API response ordering
- Agent warns on risky trades without blocking execution
- Portfolio provider shows unrealized P&L so the agent can answer "how are my positions doing?"
- Core parsing logic has test coverage
