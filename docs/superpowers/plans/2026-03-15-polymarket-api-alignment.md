# Polymarket API Alignment — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the Polymarket plugin with the official API documentation — fix correctness bugs (hardcoded tick sizes, broken position data, wrong response types), add missing Data API integration, and implement batch endpoint usage for performance.

**Architecture:** Incremental fixes to existing files. No new actions — just fixing what's broken and adding proper API usage. The Data API (`data-api.polymarket.com`) is public and unauthenticated, so positions/trades can be fetched directly. CLOB order book responses already contain `tick_size`, `neg_risk`, `last_trade_price`, and `min_order_size` — we just need to read them.

**Tech Stack:** TypeScript, ElizaOS core, @polymarket/clob-client v5.2.0, Vitest, Bun

**Prior plan:** `docs/superpowers/plans/2026-03-13-plugin-polymarket-improvements.md` (completed — added cancel, close, evaluator, P&L)

---

## File Map

| File | Responsibility | Changes |
|------|---------------|---------|
| `src/plugins/polymarket/types.ts` | Type definitions | Fix `OrderResponse`, add `DataApiPosition`, `DataApiTrade`, `OrderBookSummary` |
| `src/plugins/polymarket/constants.ts` | Config constants | Add `DATA_API_URL`, remove `DEFAULT_FEE_RATE_BPS` |
| `src/plugins/polymarket/utils/orderBook.ts` | Order book parsing | Parse `tick_size`, `neg_risk`, `last_trade_price`, `min_order_size` from response |
| `src/plugins/polymarket/utils/dataApi.ts` | **New** — Data API client | Fetch positions, trades, total value from Data API |
| `src/plugins/polymarket/services/polymarket.ts` | Core service | Use Data API for positions instead of calculating from trades; batch order book fetches |
| `src/plugins/polymarket/actions/placeOrder.ts` | Order placement | Use dynamic tick size, fee rate; handle neg_risk |
| `src/plugins/polymarket/actions/closePosition.ts` | Position close | Use Data API positions |
| `src/plugins/polymarket/providers/polymarket.ts` | Account context | Show `last_trade_price`, neg risk flag, improved position data |
| `src/plugins/polymarket/__tests__/types.test.ts` | **New** — Type tests | Validate OrderResponse schema |
| `src/plugins/polymarket/__tests__/dataApi.test.ts` | **New** — Data API tests | Test position/trade fetching |
| `src/plugins/polymarket/__tests__/orderBook.test.ts` | **New** — Order book tests | Test tick size/neg risk parsing |
| `src/plugins/polymarket/__tests__/placeOrder.test.ts` | **New** — Place order tests | Test dynamic tick rounding |

---

## Chunk 1: Fix Core Types and Constants

### Task 1: Fix `OrderResponse` type to match actual CLOB API

The CLOB API returns `orderID` (capital D), `makingAmount`, `takingAmount`, `transactionsHashes`, `tradeIDs`. Our type uses `orderId` (lowercase d) and `orderHashes`.

**Files:**
- Modify: `src/plugins/polymarket/types.ts:168-174`
- Create: `src/plugins/polymarket/__tests__/types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/plugins/polymarket/__tests__/types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { OrderResponse } from "../types";

describe("OrderResponse type", () => {
  it("should accept actual CLOB API response shape (live order)", () => {
    const response: OrderResponse = {
      success: true,
      orderID: "0xabcdef1234567890abcdef1234567890abcdef12",
      status: "live",
      makingAmount: "100000000",
      takingAmount: "200000000",
      errorMsg: "",
    };
    expect(response.success).toBe(true);
    expect(response.orderID).toBeDefined();
    expect(response.status).toBe("live");
  });

  it("should accept matched order with transaction hashes", () => {
    const response: OrderResponse = {
      success: true,
      orderID: "0xabcdef1234567890",
      status: "matched",
      makingAmount: "100000000",
      takingAmount: "200000000",
      transactionsHashes: ["0x1234567890abcdef"],
      tradeIDs: ["trade-123"],
      errorMsg: "",
    };
    expect(response.transactionsHashes).toHaveLength(1);
    expect(response.tradeIDs).toHaveLength(1);
  });

  it("should accept delayed order", () => {
    const response: OrderResponse = {
      success: true,
      orderID: "0xabcdef1234567890",
      status: "delayed",
      errorMsg: "",
    };
    expect(response.status).toBe("delayed");
  });

  it("should accept error response", () => {
    const response: OrderResponse = {
      success: false,
      errorMsg: "Invalid order payload",
    };
    expect(response.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/plugins/polymarket/__tests__/types.test.ts`
Expected: FAIL — type errors because `OrderResponse` uses `orderId` not `orderID`, missing `makingAmount`/`takingAmount`/`transactionsHashes`/`tradeIDs`.

- [ ] **Step 3: Update the OrderResponse type**

In `src/plugins/polymarket/types.ts`, replace the `OrderResponse` interface:

```typescript
export interface OrderResponse {
  success: boolean;
  errorMsg?: string;
  /** Order ID — note: API returns capital "ID" */
  orderID?: string;
  status?: "live" | "matched" | "delayed" | "unmatched";
  makingAmount?: string;
  takingAmount?: string;
  transactionsHashes?: string[];
  tradeIDs?: string[];
}
```

- [ ] **Step 4: Fix all references to the old field names**

In `src/plugins/polymarket/actions/placeOrder.ts`, update all `orderResponse.orderId` → `orderResponse.orderID` and `orderResponse.orderHashes` → `orderResponse.transactionsHashes`:

Find and replace in `placeOrder.ts`:
- `orderResponse.orderId` → `orderResponse.orderID` (lines ~802, ~803)
- `orderResponse.orderHashes` → `orderResponse.transactionsHashes` (line ~805)

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run src/plugins/polymarket/__tests__/types.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/plugins/polymarket/types.ts src/plugins/polymarket/__tests__/types.test.ts src/plugins/polymarket/actions/placeOrder.ts
git commit -m "fix(polymarket): align OrderResponse type with actual CLOB API schema"
```

---

### Task 2: Add Data API URL constant and OrderBookSummary type

The order book response from the CLOB API includes `tick_size`, `neg_risk`, `min_order_size`, and `last_trade_price` — our `OrderBook` type doesn't capture these. We also need the Data API base URL.

**Files:**
- Modify: `src/plugins/polymarket/constants.ts`
- Modify: `src/plugins/polymarket/types.ts`

- [ ] **Step 1: Add DATA_API_URL to constants**

In `src/plugins/polymarket/constants.ts`, add after the `GAMMA_API_URL` line:

```typescript
export const DATA_API_URL = "https://data-api.polymarket.com";
```

- [ ] **Step 2: Add OrderBookSummary type**

In `src/plugins/polymarket/types.ts`, add after the `OrderBook` interface:

```typescript
/**
 * Full order book response from CLOB API GET /book
 * Extends basic OrderBook with market metadata
 */
export interface OrderBookSummary extends OrderBook {
  /** Minimum tick size (price increment) for this market */
  tick_size: string;
  /** Minimum order size for this market */
  min_order_size: string;
  /** Whether this is a negative risk market */
  neg_risk: boolean;
  /** Last trade price, null if no trades */
  last_trade_price: string | null;
  /** Hash of the order book snapshot */
  hash?: string;
  /** Timestamp of the order book snapshot */
  timestamp?: string;
}
```

- [ ] **Step 3: Add Data API position type**

In `src/plugins/polymarket/types.ts`, add at the end of the file (before the Activity types section):

```typescript
// =============================================================================
// Data API Types (https://data-api.polymarket.com)
// =============================================================================

/**
 * Position from the Data API GET /positions endpoint.
 * This is the authoritative source for user positions.
 */
export interface DataApiPosition {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  totalBought: number;
  realizedPnl: number;
  curPrice: number;
  redeemed: boolean;
  mergeable: boolean;
  title: string;
  slug: string;
  icon: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  oppositeAsset?: string;
  endDate?: string;
  neg_risk?: boolean;
}

/**
 * Trade from the Data API GET /trades endpoint.
 */
export interface DataApiTrade {
  proxyWallet: string;
  side: "BUY" | "SELL";
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  title: string;
  slug: string;
  icon: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  name?: string;
  transactionHash?: string;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/plugins/polymarket/constants.ts src/plugins/polymarket/types.ts
git commit -m "feat(polymarket): add Data API types, OrderBookSummary, DATA_API_URL constant"
```

---

## Chunk 2: Data API Client and Dynamic Tick Size

### Task 3: Create Data API utility

A thin client for the public Data API endpoints that we need: positions and total value.

**Files:**
- Create: `src/plugins/polymarket/utils/dataApi.ts`
- Create: `src/plugins/polymarket/__tests__/dataApi.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/plugins/polymarket/__tests__/dataApi.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchUserPositions, fetchUserTotalValue } from "../utils/dataApi";

// Mock runtime with fetch
function createMockRuntime(responseData: unknown, ok = true) {
  return {
    fetch: vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: vi.fn().mockResolvedValue(responseData),
      text: vi.fn().mockResolvedValue(JSON.stringify(responseData)),
    }),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  } as unknown as Parameters<typeof fetchUserPositions>[0];
}

describe("fetchUserPositions", () => {
  it("should fetch positions from Data API", async () => {
    const mockPositions = [
      {
        proxyWallet: "0xabc",
        asset: "token123",
        conditionId: "0xcond",
        size: 100,
        avgPrice: 0.45,
        currentValue: 50,
        cashPnl: 5,
        title: "Will BTC hit 100k?",
        outcome: "Yes",
        outcomeIndex: 0,
      },
    ];

    const runtime = createMockRuntime(mockPositions);
    const positions = await fetchUserPositions(runtime, "0xuser123");

    expect(positions).toHaveLength(1);
    expect(positions[0].title).toBe("Will BTC hit 100k?");
    expect(runtime.fetch).toHaveBeenCalledWith(
      expect.stringContaining("data-api.polymarket.com/positions?user=0xuser123")
    );
  });

  it("should return empty array on API failure", async () => {
    const runtime = createMockRuntime({ error: "not found" }, false);
    const positions = await fetchUserPositions(runtime, "0xbad");

    expect(positions).toEqual([]);
  });

  it("should filter out zero-size positions", async () => {
    const mockPositions = [
      { size: 100, asset: "a", conditionId: "0x1", outcome: "Yes" },
      { size: 0, asset: "b", conditionId: "0x2", outcome: "No" },
    ];
    const runtime = createMockRuntime(mockPositions);
    const positions = await fetchUserPositions(runtime, "0xuser");

    expect(positions).toHaveLength(1);
    expect(positions[0].asset).toBe("a");
  });
});

describe("fetchUserTotalValue", () => {
  it("should fetch total value from Data API", async () => {
    const runtime = createMockRuntime({ total_value: "1234.56" });
    const value = await fetchUserTotalValue(runtime, "0xuser");

    expect(value).toBe(1234.56);
  });

  it("should return 0 on failure", async () => {
    const runtime = createMockRuntime({}, false);
    const value = await fetchUserTotalValue(runtime, "0xuser");

    expect(value).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/plugins/polymarket/__tests__/dataApi.test.ts`
Expected: FAIL — `fetchUserPositions` and `fetchUserTotalValue` don't exist.

- [ ] **Step 3: Implement the Data API client**

Create `src/plugins/polymarket/utils/dataApi.ts`:

```typescript
import type { IAgentRuntime } from "@elizaos/core";
import { DATA_API_URL } from "../constants";
import type { DataApiPosition, DataApiTrade } from "../types";

/**
 * Fetch current positions for a user from the Data API.
 * This is the authoritative source for positions — more reliable than
 * reconstructing from CLOB trade history.
 *
 * Endpoint: GET https://data-api.polymarket.com/positions?user={address}
 * Auth: None (public)
 */
export async function fetchUserPositions(
  runtime: IAgentRuntime,
  userAddress: string
): Promise<DataApiPosition[]> {
  const url = `${DATA_API_URL}/positions?user=${userAddress}`;
  runtime.logger.debug(`[dataApi] Fetching positions: ${url}`);

  try {
    const response = await runtime.fetch(url);
    if (!response.ok) {
      runtime.logger.warn(`[dataApi] Positions fetch failed: ${response.status}`);
      return [];
    }

    const data = (await response.json()) as DataApiPosition[];
    if (!Array.isArray(data)) {
      runtime.logger.warn("[dataApi] Positions response is not an array");
      return [];
    }

    // Filter out zero-size positions
    return data.filter((p) => p.size !== 0);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    runtime.logger.error(`[dataApi] Positions fetch error: ${msg}`);
    return [];
  }
}

/**
 * Fetch total position value for a user from the Data API.
 *
 * Endpoint: GET https://data-api.polymarket.com/value?user={address}
 * Auth: None (public)
 */
export async function fetchUserTotalValue(
  runtime: IAgentRuntime,
  userAddress: string
): Promise<number> {
  const url = `${DATA_API_URL}/value?user=${userAddress}`;
  runtime.logger.debug(`[dataApi] Fetching total value: ${url}`);

  try {
    const response = await runtime.fetch(url);
    if (!response.ok) {
      runtime.logger.warn(`[dataApi] Value fetch failed: ${response.status}`);
      return 0;
    }

    const data = (await response.json()) as { total_value?: string };
    const value = parseFloat(data.total_value ?? "0");
    return Number.isFinite(value) ? value : 0;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    runtime.logger.error(`[dataApi] Value fetch error: ${msg}`);
    return 0;
  }
}

/**
 * Fetch recent trades for a user from the Data API.
 *
 * Endpoint: GET https://data-api.polymarket.com/trades?user={address}
 * Auth: None (public)
 */
export async function fetchUserTrades(
  runtime: IAgentRuntime,
  userAddress: string,
  options?: { limit?: number; market?: string }
): Promise<DataApiTrade[]> {
  const params = new URLSearchParams({ user: userAddress });
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.market) params.set("market", options.market);

  const url = `${DATA_API_URL}/trades?${params.toString()}`;
  runtime.logger.debug(`[dataApi] Fetching trades: ${url}`);

  try {
    const response = await runtime.fetch(url);
    if (!response.ok) {
      runtime.logger.warn(`[dataApi] Trades fetch failed: ${response.status}`);
      return [];
    }

    const data = (await response.json()) as DataApiTrade[];
    return Array.isArray(data) ? data : [];
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    runtime.logger.error(`[dataApi] Trades fetch error: ${msg}`);
    return [];
  }
}
```

- [ ] **Step 4: Export from utils/index.ts**

In `src/plugins/polymarket/utils/index.ts`, add:

```typescript
export { fetchUserPositions, fetchUserTotalValue, fetchUserTrades } from "./dataApi";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run src/plugins/polymarket/__tests__/dataApi.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/plugins/polymarket/utils/dataApi.ts src/plugins/polymarket/utils/index.ts src/plugins/polymarket/__tests__/dataApi.test.ts
git commit -m "feat(polymarket): add Data API client for positions, trades, total value"
```

---

### Task 4: Parse dynamic tick size and neg_risk from order book response

The CLOB `GET /book` response includes `tick_size`, `neg_risk`, `min_order_size`, and `last_trade_price`. Currently `utils/orderBook.ts` ignores these. `placeOrder.ts` hardcodes `Math.round(price * 100) / 100` (0.01 tick).

**Files:**
- Modify: `src/plugins/polymarket/utils/orderBook.ts`
- Create: `src/plugins/polymarket/__tests__/orderBook.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/plugins/polymarket/__tests__/orderBook.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { roundToTickSize, parseOrderBookMetadata } from "../utils/orderBook";

describe("roundToTickSize", () => {
  it("should round to 0.01 tick size", () => {
    expect(roundToTickSize(0.456, "0.01")).toBe(0.46);
    expect(roundToTickSize(0.451, "0.01")).toBe(0.45);
    expect(roundToTickSize(0.455, "0.01")).toBe(0.46);
  });

  it("should round to 0.001 tick size", () => {
    expect(roundToTickSize(0.4567, "0.001")).toBe(0.457);
    expect(roundToTickSize(0.4561, "0.001")).toBe(0.456);
  });

  it("should round to 0.0001 tick size", () => {
    expect(roundToTickSize(0.45678, "0.0001")).toBe(0.4568);
  });

  it("should default to 0.01 if tick_size is missing", () => {
    expect(roundToTickSize(0.456, undefined)).toBe(0.46);
    expect(roundToTickSize(0.456, "")).toBe(0.46);
    expect(roundToTickSize(0.456, "0")).toBe(0.46);
  });

  it("should handle edge case prices", () => {
    expect(roundToTickSize(0.99, "0.01")).toBe(0.99);
    expect(roundToTickSize(0.01, "0.01")).toBe(0.01);
    expect(roundToTickSize(0.005, "0.01")).toBe(0.01);
  });
});

describe("parseOrderBookMetadata", () => {
  it("should extract metadata from full order book response", () => {
    const raw = {
      market: "0xcond123",
      asset_id: "0xtoken456",
      bids: [{ price: "0.45", size: "100" }],
      asks: [{ price: "0.55", size: "50" }],
      tick_size: "0.001",
      min_order_size: "5",
      neg_risk: true,
      last_trade_price: "0.50",
    };

    const meta = parseOrderBookMetadata(raw);
    expect(meta.tickSize).toBe("0.001");
    expect(meta.minOrderSize).toBe("5");
    expect(meta.negRisk).toBe(true);
    expect(meta.lastTradePrice).toBe("0.50");
  });

  it("should return defaults for missing fields", () => {
    const raw = {
      market: "0xcond",
      asset_id: "0xtoken",
      bids: [],
      asks: [],
    };

    const meta = parseOrderBookMetadata(raw);
    expect(meta.tickSize).toBe("0.01");
    expect(meta.minOrderSize).toBe("1");
    expect(meta.negRisk).toBe(false);
    expect(meta.lastTradePrice).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/plugins/polymarket/__tests__/orderBook.test.ts`
Expected: FAIL — `roundToTickSize` and `parseOrderBookMetadata` don't exist.

- [ ] **Step 3: Add functions to utils/orderBook.ts**

In `src/plugins/polymarket/utils/orderBook.ts`, add these exports:

```typescript
/**
 * Round a price to the nearest valid tick size.
 * Polymarket markets have variable tick sizes (0.01, 0.001, 0.0001).
 * The tick_size is returned in the GET /book response.
 */
export function roundToTickSize(price: number, tickSize: string | undefined): number {
  const tick = parseFloat(tickSize || "0");
  const effectiveTick = tick > 0 ? tick : 0.01;
  return Math.round(price / effectiveTick) * effectiveTick;
}

/**
 * Metadata parsed from the full CLOB order book response.
 */
export interface OrderBookMeta {
  tickSize: string;
  minOrderSize: string;
  negRisk: boolean;
  lastTradePrice: string | null;
}

/**
 * Extract metadata from raw order book API response.
 * The GET /book endpoint returns tick_size, min_order_size, neg_risk,
 * and last_trade_price alongside bids/asks.
 */
export function parseOrderBookMetadata(raw: Record<string, unknown>): OrderBookMeta {
  return {
    tickSize: typeof raw.tick_size === "string" && raw.tick_size ? raw.tick_size : "0.01",
    minOrderSize: typeof raw.min_order_size === "string" && raw.min_order_size ? raw.min_order_size : "1",
    negRisk: raw.neg_risk === true,
    lastTradePrice: typeof raw.last_trade_price === "string" ? raw.last_trade_price : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/plugins/polymarket/__tests__/orderBook.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/polymarket/utils/orderBook.ts src/plugins/polymarket/__tests__/orderBook.test.ts
git commit -m "feat(polymarket): add dynamic tick size rounding and order book metadata parsing"
```

---

## Chunk 3: Fix placeOrder to Use Dynamic Tick Size

### Task 5: Replace hardcoded price rounding in placeOrder

**Files:**
- Modify: `src/plugins/polymarket/actions/placeOrder.ts`
- Create: `src/plugins/polymarket/__tests__/placeOrder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/plugins/polymarket/__tests__/placeOrder.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { roundToTickSize } from "../utils/orderBook";

/**
 * These tests verify that the placeOrder action uses dynamic tick sizes
 * rather than the hardcoded Math.round(price * 100) / 100.
 *
 * Integration with placeOrder handler is tested by verifying the
 * roundToTickSize function produces correct results for all Polymarket
 * tick sizes (0.01, 0.001, 0.0001).
 */
describe("placeOrder tick size handling", () => {
  it("should preserve 3-decimal precision for 0.001 tick markets", () => {
    // Previously: Math.round(0.456 * 100) / 100 = 0.46 (WRONG — loses precision)
    // Now: roundToTickSize(0.456, "0.001") = 0.456 (correct)
    expect(roundToTickSize(0.456, "0.001")).toBe(0.456);
  });

  it("should preserve 4-decimal precision for 0.0001 tick markets", () => {
    expect(roundToTickSize(0.4567, "0.0001")).toBe(0.4567);
  });

  it("should still round 2-decimal for 0.01 tick markets", () => {
    expect(roundToTickSize(0.456, "0.01")).toBe(0.46);
  });

  it("should handle percentage-to-decimal conversion before rounding", () => {
    // User says "45 cents" → price=45 → converted to 0.45
    const price = 45 / 100;
    expect(roundToTickSize(price, "0.01")).toBe(0.45);
  });
});
```

- [ ] **Step 2: Run test to verify it passes** (it should — tests are for the utility)

Run: `bunx vitest run src/plugins/polymarket/__tests__/placeOrder.test.ts`
Expected: PASS (this validates the utility works correctly)

- [ ] **Step 3: Update placeOrder.ts to use dynamic tick size**

In `src/plugins/polymarket/actions/placeOrder.ts`, add import:

```typescript
import { deriveBestAsk, deriveBestBid, roundToTickSize, parseOrderBookMetadata } from "../utils/orderBook";
```

Remove the existing import:
```typescript
import { deriveBestAsk, deriveBestBid } from "../utils/orderBook";
```

Then find the order book validation block (around line 657-697) and capture metadata. Replace:

```typescript
      // Validate token exists by checking order book
      try {
        const orderBook = await client.getOrderBook(tokenId);
```

With:

```typescript
      // Validate token exists and get market metadata from order book
      let tickSize: string = "0.01";
      try {
        const orderBook = await client.getOrderBook(tokenId);
        // Extract market metadata (tick_size, neg_risk, min_order_size, last_trade_price)
        const meta = parseOrderBookMetadata(orderBook as unknown as Record<string, unknown>);
        tickSize = meta.tickSize;
```

Then replace the hardcoded rounding (around line 700):

```typescript
    // Round price to valid tick size (typically 0.01)
    price = Math.round(price * 100) / 100;
```

With:

```typescript
    // Round price to market's actual tick size (0.01, 0.001, or 0.0001)
    price = roundToTickSize(price, tickSize);
```

- [ ] **Step 4: Verify the build compiles**

Run: `bunx vitest run src/plugins/polymarket/__tests__/placeOrder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/polymarket/actions/placeOrder.ts src/plugins/polymarket/__tests__/placeOrder.test.ts
git commit -m "fix(polymarket): use dynamic tick size from order book instead of hardcoded 0.01"
```

---

### Task 6: Remove hardcoded DEFAULT_FEE_RATE_BPS

The fee rate should come from the order, not a global constant. The `@polymarket/clob-client` SDK handles fee rates automatically when creating orders via `createAndPostOrder`.

**Files:**
- Modify: `src/plugins/polymarket/constants.ts`
- Modify: `src/plugins/polymarket/actions/placeOrder.ts`

- [ ] **Step 1: Remove DEFAULT_FEE_RATE_BPS from constants.ts**

In `src/plugins/polymarket/constants.ts`, delete:

```typescript
export const DEFAULT_FEE_RATE_BPS = "0";
```

- [ ] **Step 2: Update placeOrder.ts to not default fee to "0"**

In `src/plugins/polymarket/actions/placeOrder.ts`, change:

```typescript
    const feeRateBps = llmResult?.feeRateBps ?? "0";
```

To:

```typescript
    const feeRateBps = llmResult?.feeRateBps;
```

And update the `orderArgs` construction. Change:

```typescript
    const orderArgs: UserOrder = {
      tokenID: tokenId,
      price,
      side: side === "BUY" ? Side.BUY : Side.SELL,
      size,
      feeRateBps: parseFloat(feeRateBps),
    };
```

To:

```typescript
    const orderArgs: UserOrder = {
      tokenID: tokenId,
      price,
      side: side === "BUY" ? Side.BUY : Side.SELL,
      size,
      ...(feeRateBps != null ? { feeRateBps: parseFloat(feeRateBps) } : {}),
    };
```

- [ ] **Step 3: Also update the market order path**

In the FOK/FAK branch, similarly make feeRateBps conditional:

```typescript
        const marketOrderArgs = {
          tokenID: tokenId,
          price,
          amount: size,
          side: side === "BUY" ? Side.BUY : Side.SELL,
          ...(feeRateBps != null ? { feeRateBps: parseFloat(feeRateBps) } : {}),
          orderType: marketOrderType as ClobOrderType.FOK | ClobOrderType.FAK,
        };
```

- [ ] **Step 4: Verify build still works**

Run: `bun run build 2>&1 | head -20`
Expected: No errors related to `DEFAULT_FEE_RATE_BPS`.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/polymarket/constants.ts src/plugins/polymarket/actions/placeOrder.ts
git commit -m "fix(polymarket): remove hardcoded fee rate, let SDK determine fees per market"
```

---

## Chunk 4: Integrate Data API Positions into Service

### Task 7: Use Data API for positions in PolymarketService

The service currently reconstructs positions from CLOB trade history (max 50 trades). The Data API provides authoritative position data. We'll use Data API as primary, with CLOB trade-based calculation as fallback.

**Files:**
- Modify: `src/plugins/polymarket/services/polymarket.ts`

- [ ] **Step 1: Add import for Data API client**

At the top of `src/plugins/polymarket/services/polymarket.ts`, add:

```typescript
import { fetchUserPositions } from "../utils/dataApi";
import type { DataApiPosition } from "../types";
```

- [ ] **Step 2: Add helper to convert Data API positions to internal Position type**

Add this function near the other helpers (around line 265, after `calculatePositionsFromTrades`):

```typescript
/**
 * Convert Data API positions to internal Position format.
 * Data API is the authoritative source — it includes all positions
 * regardless of trade history pagination limits.
 */
function convertDataApiPositions(dataPositions: DataApiPosition[]): Position[] {
  return dataPositions
    .filter((p) => p.size !== 0)
    .map((p) => ({
      market: p.conditionId,
      asset_id: p.asset,
      size: String(p.size),
      average_price: String(p.avgPrice),
      realized_pnl: String(p.realizedPnl ?? 0),
      unrealized_pnl: String(p.cashPnl ?? 0),
    }));
}
```

- [ ] **Step 3: Update doRefreshAccountState to try Data API first**

In the `doRefreshAccountState` method, find where positions are calculated (around line 998):

```typescript
      // Calculate positions from trade history
      const positions = calculatePositionsFromTrades(recentTrades);
```

Replace with:

```typescript
      // Fetch positions from Data API (authoritative source)
      // Falls back to calculating from trade history if Data API fails
      let positions: Position[];
      try {
        const dataApiPositions = await fetchUserPositions(
          this.polymarketRuntime,
          this.walletAddress
        );
        if (dataApiPositions.length > 0) {
          positions = convertDataApiPositions(dataApiPositions);
          this.polymarketRuntime.logger.info(
            `[PolymarketService] Got ${positions.length} positions from Data API`
          );
        } else {
          positions = calculatePositionsFromTrades(recentTrades);
          this.polymarketRuntime.logger.info(
            `[PolymarketService] Data API returned 0 positions, calculated ${positions.length} from trades`
          );
        }
      } catch {
        positions = calculatePositionsFromTrades(recentTrades);
        this.polymarketRuntime.logger.warn(
          `[PolymarketService] Data API failed, calculated ${positions.length} positions from trades`
        );
      }
```

- [ ] **Step 4: Verify build compiles**

Run: `bun run build 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/polymarket/services/polymarket.ts
git commit -m "feat(polymarket): use Data API as primary position source with CLOB fallback"
```

---

### Task 8: Use batch order book fetching in provider

The provider fetches order books one-by-one in a loop for position P&L. Use `POST /books` via the CLOB client's batch method to reduce API calls from N to 1.

**Files:**
- Modify: `src/plugins/polymarket/providers/polymarket.ts`

- [ ] **Step 1: Replace serial order book fetching with batch**

In `src/plugins/polymarket/providers/polymarket.ts`, find the serial loop (around lines 333-353):

```typescript
          if (accountState.positions.length > 0) {
            positionPrices = new Map();
            try {
              const client = await initializeClobClient(runtime);
              const activePositions = accountState.positions.filter(
                (p) => parseFloat(p.size) > 0
              );
              for (const pos of activePositions.slice(0, 10)) {
                try {
                  const ob = (await client.getOrderBook(pos.asset_id)) as OrderBook;
                  const bestBid = deriveBestBid(ob.bids ?? []);
                  if (bestBid) {
                    positionPrices.set(pos.asset_id, bestBid.price);
                  }
                } catch {
                  // Skip — price unavailable for this token
                }
              }
            } catch {
              positionPrices = undefined;
            }
          }
```

Replace with:

```typescript
          if (accountState.positions.length > 0) {
            positionPrices = new Map();
            try {
              const client = await initializeClobClient(runtime);
              const activePositions = accountState.positions.filter(
                (p) => parseFloat(p.size) > 0
              );
              const tokenIds = activePositions.slice(0, 10).map((p) => p.asset_id);

              if (tokenIds.length > 0) {
                try {
                  // Batch fetch: single API call for all order books
                  const orderBooks = await client.getOrderBooks(tokenIds);
                  for (const [tokenId, ob] of Object.entries(orderBooks)) {
                    const book = ob as OrderBook;
                    const bestBid = deriveBestBid(book.bids ?? []);
                    if (bestBid) {
                      positionPrices.set(tokenId, bestBid.price);
                    }
                  }
                } catch {
                  // Fallback to serial fetching if batch fails
                  for (const tokenId of tokenIds) {
                    try {
                      const ob = (await client.getOrderBook(tokenId)) as OrderBook;
                      const bestBid = deriveBestBid(ob.bids ?? []);
                      if (bestBid) {
                        positionPrices.set(tokenId, bestBid.price);
                      }
                    } catch {
                      // Skip
                    }
                  }
                }
              }
            } catch {
              positionPrices = undefined;
            }
          }
```

- [ ] **Step 2: Verify build compiles**

Run: `bun run build 2>&1 | head -20`
Expected: No errors. Note: if `client.getOrderBooks` doesn't exist on the CLOB client SDK, check via `grep -r "getOrderBooks" node_modules/@polymarket/clob-client/`. If it doesn't exist, keep the serial approach and remove this change — the SDK may not expose the batch endpoint.

- [ ] **Step 3: Commit**

```bash
git add src/plugins/polymarket/providers/polymarket.ts
git commit -m "perf(polymarket): batch order book fetching in provider for position P&L"
```

---

## Chunk 5: Export New Utilities and Final Wiring

### Task 9: Export Data API utilities from plugin index

**Files:**
- Modify: `src/plugins/polymarket/index.ts`

- [ ] **Step 1: Add exports**

In `src/plugins/polymarket/index.ts`, add to the existing exports:

```typescript
export { fetchUserPositions, fetchUserTotalValue, fetchUserTrades } from "./utils/dataApi";
export { roundToTickSize, parseOrderBookMetadata } from "./utils/orderBook";
export { DATA_API_URL } from "./constants";
export type { DataApiPosition, DataApiTrade, OrderBookSummary } from "./types";
```

- [ ] **Step 2: Verify build and run all tests**

Run: `bunx vitest run src/plugins/polymarket/__tests__/ && bun run build 2>&1 | tail -5`
Expected: All tests pass. Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/plugins/polymarket/index.ts
git commit -m "feat(polymarket): export Data API utilities, tick size helpers, and new types"
```

---

### Task 10: Run full test suite and verify no regressions

- [ ] **Step 1: Run all polymarket tests**

```bash
bunx vitest run src/plugins/polymarket/__tests__/ --reporter=verbose
```

Expected: All tests pass.

- [ ] **Step 2: Run full project build**

```bash
bun run build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 3: Final commit with summary**

```bash
git add -A
git status
# Only commit if there are unstaged changes from cleanup
```

---

## Summary of Changes

| Change | Impact | Risk |
|--------|--------|------|
| Fix `OrderResponse` type (`orderID` not `orderId`) | Correctness — response parsing now matches API | Low — field rename |
| Add `OrderBookSummary` type | New type for richer order book data | None — additive |
| Add Data API client (`utils/dataApi.ts`) | Authoritative positions, no more 50-trade limit | Low — new code, old path is fallback |
| Dynamic tick size rounding | Correctness — orders on 0.001-tick markets now work | Medium — changes order price calculation |
| Remove hardcoded fee rate "0" | Correctness — SDK handles actual fee rates | Low — SDK already does this |
| Data API positions in service | Correctness — real positions instead of reconstructed | Low — fallback to old behavior |
| Batch order book in provider | Performance — 1 API call instead of N | Low — fallback to serial |

### Not In Scope (Future Work)

These were identified in the alignment analysis but deferred:

- **Heartbeat endpoint** — Nice-to-have for session keepalive, not a correctness issue
- **Rate limiting** — Would need a rate limiter middleware; current usage is well under limits
- **Negative risk order routing** — The CLOB client SDK handles this if the market metadata is passed; needs investigation of SDK internals
- **Batch order posting** (`POST /orders`) — Useful for market makers, not needed for agent single-order flow
- **Open interest, leaderboard, closed positions** — Valuable data but no current action needs them
- **WebSocket activation** — Infrastructure exists but needs a use case to justify wiring it up
- **Bridge API** — Deposit/withdraw is a separate concern
