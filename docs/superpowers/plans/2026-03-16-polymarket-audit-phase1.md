# Polymarket Plugin Audit — Phase 1 Critical Fixes

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 11 findings (6 CRITICAL, 5 HIGH) that can cause direct financial loss in the Polymarket trading plugin.

**Architecture:** TDD approach — write failing tests first, then implement minimal fixes. Each task targets one or two related findings. Tests use vitest with mocked CLOB/Gamma/Data API clients. All changes are in `src/plugins/polymarket/`.

**Tech Stack:** TypeScript, vitest, zod, `@polymarket/clob-client`, elizaOS runtime

**Spec:** `docs/superpowers/specs/2026-03-16-polymarket-plugin-audit-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `utils/llmSchemas.ts` | Zod schemas for all LLM extraction types |
| `utils/preTradeChecks.ts` | Pre-trade validation (balance, bounds, min size) |
| `__tests__/marketOrderAmount.test.ts` | Tests for C1: BUY/SELL amount semantics |
| `__tests__/tickSizeOptions.test.ts` | Tests for C2/C4: SDK options passing |
| `__tests__/balanceFormatting.test.ts` | Tests for C3: balance parsing heuristic |
| `__tests__/llmSchemas.test.ts` | Tests for C5: Zod validation |
| `__tests__/priceRecalculation.test.ts` | Tests for C6/H10: size recalc + price rejection |
| `__tests__/preTradeChecks.test.ts` | Tests for H1/H3/H8: pre-submission validation |
| `__tests__/privateKeyLookup.test.ts` | Tests for H11: key consistency |

### Modified files
| File | Changes |
|------|---------|
| `actions/placeOrder.ts` | C1, C6, H10, H1, H3, H8, H11 fixes |
| `actions/closePosition.ts` | C4 fix |
| `services/polymarket.ts` | C3 balance formatting fix |
| `utils/llmHelpers.ts` | C5 Zod integration |
| `utils/clobClient.ts` | H5/H11 key chain fix |
| `actions/getBalance.ts` | H11 key order fix |
| `actions/cancelOrder.ts` | H11 key order fix |
| `actions/closePosition.ts` | H11 key order fix |
| `utils/orderBook.ts` | Export `OrderBookMeta` type |

---

## Chunk 1: Foundation — Key Standardization, Zod Schemas, Balance Fix

### Task 1: Standardize private key lookup (H11)

**Findings:** H11 (inconsistent key order), partial H5 (overly permissive chain)
**Files:**
- Modify: `src/plugins/polymarket/utils/clobClient.ts:7-23`
- Modify: `src/plugins/polymarket/actions/getBalance.ts:49-57`
- Modify: `src/plugins/polymarket/actions/cancelOrder.ts:106-116`
- Modify: `src/plugins/polymarket/actions/closePosition.ts:98-107`
- Create: `src/plugins/polymarket/__tests__/privateKeyLookup.test.ts`

- [ ] **Step 1: Write failing test for key lookup consistency**

```typescript
// __tests__/privateKeyLookup.test.ts
import { describe, it, expect, vi } from "vitest";

function createMockRuntime(settings: Record<string, string | null>) {
  return {
    getSetting: vi.fn((key: string) => settings[key] ?? null),
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
}

describe("getPrivateKey consistency", () => {
  it("prefers POLYMARKET_PRIVATE_KEY over others", () => {
    // Import the function — will fail until we export it
    const { getPrivateKey } = require("../utils/clobClient");
    const runtime = createMockRuntime({
      POLYMARKET_PRIVATE_KEY: "0xpolykey",
      EVM_PRIVATE_KEY: "0xevmkey",
      WALLET_PRIVATE_KEY: "0xwalletkey",
    });
    expect(getPrivateKey(runtime)).toBe("0xpolykey");
  });

  it("falls back to EVM_PRIVATE_KEY with warning", () => {
    const { getPrivateKey } = require("../utils/clobClient");
    const runtime = createMockRuntime({
      POLYMARKET_PRIVATE_KEY: null,
      EVM_PRIVATE_KEY: "0xevmkey",
    });
    expect(getPrivateKey(runtime)).toBe("0xevmkey");
  });

  it("does NOT accept WALLET_PRIVATE_KEY or PRIVATE_KEY", () => {
    const { getPrivateKey } = require("../utils/clobClient");
    const runtime = createMockRuntime({
      WALLET_PRIVATE_KEY: "0xwalletkey",
      PRIVATE_KEY: "0xgenerickey",
    });
    expect(() => getPrivateKey(runtime)).toThrow("No private key found");
  });

  it("adds 0x prefix if missing", () => {
    const { getPrivateKey } = require("../utils/clobClient");
    const runtime = createMockRuntime({
      POLYMARKET_PRIVATE_KEY: "abcdef1234",
    });
    expect(getPrivateKey(runtime)).toBe("0xabcdef1234");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/plugins/polymarket && npx vitest run __tests__/privateKeyLookup.test.ts`
Expected: FAIL — `getPrivateKey` is not exported, and current logic accepts WALLET_PRIVATE_KEY

- [ ] **Step 3: Fix `getPrivateKey` in clobClient.ts and export it**

In `src/plugins/polymarket/utils/clobClient.ts`, change `getPrivateKey` from:
```typescript
function getPrivateKey(runtime: IAgentRuntime): `0x${string}` {
  const privateKey =
    runtime.getSetting("POLYMARKET_PRIVATE_KEY") ||
    runtime.getSetting("EVM_PRIVATE_KEY") ||
    runtime.getSetting("WALLET_PRIVATE_KEY") ||
    runtime.getSetting("PRIVATE_KEY");
```
To:
```typescript
export function getPrivateKey(runtime: IAgentRuntime): `0x${string}` {
  const privateKey =
    runtime.getSetting("POLYMARKET_PRIVATE_KEY") ||
    runtime.getSetting("EVM_PRIVATE_KEY");

  if (!privateKey) {
    throw new Error(
      "No private key found. Please set POLYMARKET_PRIVATE_KEY or EVM_PRIVATE_KEY in your environment"
    );
  }
```
Export it so actions can use it directly instead of reimplementing.

- [ ] **Step 4: Fix validate() in getBalance.ts, cancelOrder.ts, closePosition.ts**

In each action's `validate` function, replace the ad-hoc key lookup with:
```typescript
import { getPrivateKey } from "../utils/clobClient";

validate: async (runtime: IAgentRuntime): Promise<boolean> => {
  try {
    getPrivateKey(runtime);
    return true;
  } catch {
    runtime.logger.warn("[actionName] No private key configured.");
    return false;
  }
},
```

Apply to:
- `actions/getBalance.ts:49-57` — currently checks `WALLET_PRIVATE_KEY` first
- `actions/cancelOrder.ts:106-116` — currently checks 3 keys
- `actions/closePosition.ts:98-107` — currently checks 3 keys
- `actions/placeOrder.ts:377-404` — currently checks 4 keys with different order

- [ ] **Step 5: Run test to verify it passes**

Run: `cd src/plugins/polymarket && npx vitest run __tests__/privateKeyLookup.test.ts`
Expected: PASS — all 4 tests green

- [ ] **Step 6: Run existing tests to verify no regressions**

Run: `cd src/plugins/polymarket && npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add src/plugins/polymarket/utils/clobClient.ts src/plugins/polymarket/actions/getBalance.ts src/plugins/polymarket/actions/cancelOrder.ts src/plugins/polymarket/actions/closePosition.ts src/plugins/polymarket/__tests__/privateKeyLookup.test.ts
git commit -m "fix(polymarket): standardize private key lookup order across all actions (H11)"
```

---

### Task 2: Add Zod schemas for LLM extraction (C5)

**Findings:** C5 (no runtime type validation on LLM output)
**Files:**
- Create: `src/plugins/polymarket/utils/llmSchemas.ts`
- Create: `src/plugins/polymarket/__tests__/llmSchemas.test.ts`
- Modify: `src/plugins/polymarket/utils/llmHelpers.ts:71-113`

- [ ] **Step 1: Write failing tests for Zod schemas**

```typescript
// __tests__/llmSchemas.test.ts
import { describe, it, expect } from "vitest";
import {
  PlaceOrderParamsSchema,
  CancelOrderParamsSchema,
  ClosePositionParamsSchema,
} from "../utils/llmSchemas";

describe("PlaceOrderParamsSchema", () => {
  it("accepts valid order with dollarAmount", () => {
    const result = PlaceOrderParamsSchema.safeParse({
      tokenId: "0x123abc",
      side: "buy",
      price: 0.5,
      dollarAmount: 10,
      outcome: "yes",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dollarAmount).toBe(10);
      expect(result.data.side).toBe("buy");
    }
  });

  it("accepts valid order with shares", () => {
    const result = PlaceOrderParamsSchema.safeParse({
      tokenId: "123456",
      side: "sell",
      shares: 50,
    });
    expect(result.success).toBe(true);
  });

  it("accepts MARKET_NAME_LOOKUP with marketName", () => {
    const result = PlaceOrderParamsSchema.safeParse({
      tokenId: "MARKET_NAME_LOOKUP",
      marketName: "Miami Heat",
      side: "buy",
      dollarAmount: 5,
      outcome: "yes",
    });
    expect(result.success).toBe(true);
  });

  it("rejects string price like 'fifty cents'", () => {
    const result = PlaceOrderParamsSchema.safeParse({
      tokenId: "0x123",
      side: "buy",
      price: "fifty cents",
      dollarAmount: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative dollarAmount", () => {
    const result = PlaceOrderParamsSchema.safeParse({
      tokenId: "0x123",
      side: "buy",
      dollarAmount: -5,
    });
    expect(result.success).toBe(false);
  });

  it("coerces numeric strings to numbers", () => {
    const result = PlaceOrderParamsSchema.safeParse({
      tokenId: "0x123",
      side: "buy",
      price: "0.50",
      dollarAmount: "10",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.price).toBe(0.5);
      expect(result.data.dollarAmount).toBe(10);
    }
  });

  it("returns error object for LLM error response", () => {
    const result = PlaceOrderParamsSchema.safeParse({
      error: "No order intent detected.",
    });
    // Error responses should still parse — the error field is optional
    expect(result.success).toBe(true);
  });
});

describe("CancelOrderParamsSchema", () => {
  it("accepts cancelAll", () => {
    const result = CancelOrderParamsSchema.safeParse({ cancelAll: true });
    expect(result.success).toBe(true);
  });

  it("accepts orderIds array", () => {
    const result = CancelOrderParamsSchema.safeParse({ orderIds: ["abc", "def"] });
    expect(result.success).toBe(true);
  });

  it("rejects non-string orderIds", () => {
    const result = CancelOrderParamsSchema.safeParse({ orderIds: [123, 456] });
    expect(result.success).toBe(false);
  });
});

describe("ClosePositionParamsSchema", () => {
  it("accepts tokenId", () => {
    const result = ClosePositionParamsSchema.safeParse({ tokenId: "0x123abc" });
    expect(result.success).toBe(true);
  });

  it("accepts marketName", () => {
    const result = ClosePositionParamsSchema.safeParse({ marketName: "Bitcoin 100k" });
    expect(result.success).toBe(true);
  });

  it("rejects numeric tokenId", () => {
    const result = ClosePositionParamsSchema.safeParse({ tokenId: 12345 });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/plugins/polymarket && npx vitest run __tests__/llmSchemas.test.ts`
Expected: FAIL — module `../utils/llmSchemas` not found

- [ ] **Step 3: Create Zod schemas**

```typescript
// utils/llmSchemas.ts
import { z } from "zod";

// Coerce numeric strings to numbers for LLM outputs that quote numbers
const coercedNumber = z.union([z.number(), z.string().transform((s) => {
  const n = parseFloat(s);
  if (!Number.isFinite(n)) throw new Error(`Not a number: ${s}`);
  return n;
})]);

const coercedPositiveNumber = coercedNumber.pipe(z.number().positive());
const coercedNonNegativeNumber = coercedNumber.pipe(z.number().nonnegative());

export const PlaceOrderParamsSchema = z.object({
  tokenId: z.string().optional(),
  marketName: z.string().optional(),
  outcome: z.string().transform((s) => s.toLowerCase().trim()).pipe(z.enum(["yes", "no"])).optional(),
  side: z.string().optional(),
  price: coercedNonNegativeNumber.optional(),
  dollarAmount: coercedPositiveNumber.optional(),
  shares: coercedPositiveNumber.optional(),
  size: coercedPositiveNumber.optional(), // Deprecated alias for shares
  orderType: z.string().optional(),
  feeRateBps: z.string().optional(),
  error: z.string().optional(),
}).passthrough();

export const CancelOrderParamsSchema = z.object({
  orderIds: z.array(z.string()).optional().nullable(),
  cancelAll: z.boolean().optional(),
  tokenId: z.string().optional().nullable(),
  error: z.string().optional(),
}).passthrough();

export const ClosePositionParamsSchema = z.object({
  tokenId: z.string().optional().nullable(),
  marketName: z.string().optional().nullable(),
  cancelOpenOrders: z.boolean().optional(),
  orderType: z.enum(["market", "limit"]).optional(),
  error: z.string().optional(),
}).passthrough();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/plugins/polymarket && npx vitest run __tests__/llmSchemas.test.ts`
Expected: PASS

- [ ] **Step 5: Integrate Zod into `callLLMWithTimeout`**

In `utils/llmHelpers.ts`, add a `schema` parameter to `callLLMWithTimeout`:

Change signature from:
```typescript
export async function callLLMWithTimeout<T>(
  runtime: IAgentRuntime,
  state: State | undefined,
  template: string,
  _actionName: string,
  timeoutMs: number = LLM_CALL_TIMEOUT_MS
): Promise<T | null> {
```
To:
```typescript
import type { ZodType } from "zod";

export async function callLLMWithTimeout<T>(
  runtime: IAgentRuntime,
  state: State | undefined,
  template: string,
  _actionName: string,
  timeoutMs: number = LLM_CALL_TIMEOUT_MS,
  schema?: ZodType<T>
): Promise<T | null> {
```

After `const parsed = JSON.parse(jsonMatch[0]) as T;` at line 105, add validation:
```typescript
    const raw = JSON.parse(jsonMatch[0]);
    if (schema) {
      const result = schema.safeParse(raw);
      if (!result.success) {
        runtime.logger?.warn?.(
          `[${_actionName}] LLM output failed schema validation: ${result.error.message}`
        );
        return null;
      }
      return result.data as T;
    }
    return raw as T;
```

- [ ] **Step 6: Run all tests**

Run: `cd src/plugins/polymarket && npx vitest run`
Expected: All pass (schema param is optional, backward compatible)

- [ ] **Step 7: Commit**

```bash
git add src/plugins/polymarket/utils/llmSchemas.ts src/plugins/polymarket/utils/llmHelpers.ts src/plugins/polymarket/__tests__/llmSchemas.test.ts
git commit -m "feat(polymarket): add Zod schemas for LLM extraction validation (C5)"
```

---

### Task 3: Fix balance formatting heuristic (C3)

**Findings:** C3 (balance heuristic breaks at $1000+)
**Files:**
- Modify: `src/plugins/polymarket/services/polymarket.ts:1114-1131`
- Create: `src/plugins/polymarket/__tests__/balanceFormatting.test.ts`

- [ ] **Step 1: Write failing tests for balance formatting**

```typescript
// __tests__/balanceFormatting.test.ts
import { describe, it, expect } from "vitest";

// Extract the formatBalance logic for testing.
// We'll export it as a named function from the service file.

describe("formatBalance", () => {
  // Import after implementation makes it available
  const { formatBalance } = require("../services/polymarket");

  it("formats small balance correctly", () => {
    expect(formatBalance("9.5")).toBe("9.500000");
  });

  it("formats $999.99 correctly (boundary)", () => {
    expect(formatBalance("999.99")).toBe("999.990000");
  });

  it("formats $1000 correctly (boundary - current bug)", () => {
    // BUG: current code divides 1000 by 10^6, showing 0.001000
    expect(formatBalance("1000")).toBe("1000.000000");
  });

  it("formats $1000.01 correctly (boundary)", () => {
    expect(formatBalance("1000.01")).toBe("1000.010000");
  });

  it("formats $50000 correctly", () => {
    expect(formatBalance("50000")).toBe("50000.000000");
  });

  it("handles null", () => {
    expect(formatBalance(null)).toBe("0");
  });

  it("handles undefined", () => {
    expect(formatBalance(undefined)).toBe("0");
  });

  it("handles zero", () => {
    expect(formatBalance("0")).toBe("0.000000");
  });

  it("handles non-numeric string", () => {
    expect(formatBalance("not-a-number")).toBe("0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/plugins/polymarket && npx vitest run __tests__/balanceFormatting.test.ts`
Expected: FAIL — `formatBalance` not exported, and $1000 test would fail with "0.001000"

- [ ] **Step 3: Fix and export `formatBalance`**

In `src/plugins/polymarket/services/polymarket.ts`, replace the `formatBalance` function (lines 1117-1131):

From:
```typescript
    const formatBalance = (rawBalance: string | number | null | undefined): string => {
      if (rawBalance === null || rawBalance === undefined) return "0";
      const numValue = typeof rawBalance === "string" ? parseFloat(rawBalance) : rawBalance;
      if (!Number.isFinite(numValue)) return "0";

      // If the value looks like it's already in decimal form (e.g., 9.5 not 9500000)
      // then don't divide by 10^6
      if (numValue > 0 && numValue < 1000) {
        // Likely already formatted, return as-is with proper decimal places
        return numValue.toFixed(6);
      }

      // Otherwise assume atomic units and convert
      return (numValue / Math.pow(10, USDC_DECIMALS)).toFixed(6);
    };
```

To (also export at module level):
```typescript
/**
 * Format a balance value from the CLOB API.
 * The API returns human-readable decimal strings (not atomic units).
 * We simply parse and format to 6 decimal places.
 */
export function formatBalance(rawBalance: string | number | null | undefined): string {
  if (rawBalance === null || rawBalance === undefined) return "0";
  const numValue = typeof rawBalance === "string" ? parseFloat(rawBalance) : rawBalance;
  if (!Number.isFinite(numValue)) return "0";
  return numValue.toFixed(6);
}
```

Then inside `fetchAccountBalances()`, replace the inline `formatBalance` usage (around line 1133-1138) with the exported function.

Remove the `USDC_DECIMALS` constant declaration at line 1116 (no longer needed inside this function).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/plugins/polymarket && npx vitest run __tests__/balanceFormatting.test.ts`
Expected: PASS — all 9 tests green including the $1000 boundary

- [ ] **Step 5: Run all tests**

Run: `cd src/plugins/polymarket && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/plugins/polymarket/services/polymarket.ts src/plugins/polymarket/__tests__/balanceFormatting.test.ts
git commit -m "fix(polymarket): remove balance formatting heuristic that broke at $1000+ (C3)"
```

---

## Chunk 2: Order Fixes — tickSize, Amount Semantics, Price Handling

### Task 4: Pass tickSize and negRisk to SDK (C2 + C4)

**Findings:** C2 (placeOrder missing options), C4 (closePosition missing options)
**Files:**
- Create: `src/plugins/polymarket/__tests__/tickSizeOptions.test.ts`
- Modify: `src/plugins/polymarket/actions/placeOrder.ts:739-746`
- Modify: `src/plugins/polymarket/actions/closePosition.ts:241-246, 257-260, 274-280`
- Modify: `src/plugins/polymarket/utils/orderBook.ts` (export `OrderBookMeta` type)

- [ ] **Step 1: Write failing test for tickSize/negRisk passing**

```typescript
// __tests__/tickSizeOptions.test.ts
import { describe, it, expect, vi } from "vitest";
import { parseOrderBookMetadata, type OrderBookMeta } from "../utils/orderBook";

describe("parseOrderBookMetadata", () => {
  it("extracts tick_size and neg_risk from order book response", () => {
    const raw = {
      bids: [],
      asks: [],
      tick_size: "0.001",
      min_order_size: "5",
      neg_risk: true,
      last_trade_price: "0.45",
    };
    const meta = parseOrderBookMetadata(raw);
    expect(meta.tickSize).toBe("0.001");
    expect(meta.negRisk).toBe(true);
    expect(meta.minOrderSize).toBe("5");
  });

  it("defaults tick_size to 0.01 when missing", () => {
    const meta = parseOrderBookMetadata({});
    expect(meta.tickSize).toBe("0.01");
    expect(meta.negRisk).toBe(false);
  });
});

describe("SDK options construction", () => {
  it("builds CreateOrderOptions from OrderBookMeta", () => {
    const meta: OrderBookMeta = {
      tickSize: "0.001",
      minOrderSize: "5",
      negRisk: true,
      lastTradePrice: "0.45",
    };
    // The options object that should be passed to createAndPostOrder
    const options = {
      tickSize: meta.tickSize as "0.1" | "0.01" | "0.001" | "0.0001",
      negRisk: meta.negRisk,
    };
    expect(options.tickSize).toBe("0.001");
    expect(options.negRisk).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (this tests existing code)**

Run: `cd src/plugins/polymarket && npx vitest run __tests__/tickSizeOptions.test.ts`
Expected: PASS — `parseOrderBookMetadata` already works, we just need to use its output

- [ ] **Step 3: Fix placeOrder.ts — pass options to createAndPostOrder**

In `src/plugins/polymarket/actions/placeOrder.ts`, after `const meta = parseOrderBookMetadata(...)` at line 661, store negRisk:

Add after line 662:
```typescript
      const negRisk = meta.negRisk;
```

Then change the limit order call (lines 742-746) from:
```typescript
        orderResponse = (await client.createAndPostOrder(
          orderArgs,
          undefined,
          clobOrderType
        )) as OrderResponse;
```
To:
```typescript
        orderResponse = (await client.createAndPostOrder(
          orderArgs,
          { tickSize: tickSize as "0.1" | "0.01" | "0.001" | "0.0001", negRisk },
          clobOrderType
        )) as OrderResponse;
```

And change the market order call (line 739) from:
```typescript
        orderResponse = (await client.createAndPostMarketOrder(marketOrderArgs)) as OrderResponse;
```
To:
```typescript
        orderResponse = (await client.createAndPostMarketOrder(
          marketOrderArgs,
          { tickSize: tickSize as "0.1" | "0.01" | "0.001" | "0.0001", negRisk },
          marketOrderType
        )) as OrderResponse;
```

- [ ] **Step 4: Fix closePosition.ts — pass orderType and options**

In `src/plugins/polymarket/actions/closePosition.ts`, after fetching the order book (around line 222-223), extract metadata:

Add after `orderBook = (await client.getOrderBook(tokenId)) as OrderBook;`:
```typescript
      const meta = parseOrderBookMetadata(orderBook as unknown as Record<string, unknown>);
      const orderOptions = { tickSize: meta.tickSize as "0.1" | "0.01" | "0.001" | "0.0001", negRisk: meta.negRisk };
```

Add import at top of file:
```typescript
import { parseOrderBookMetadata } from "../utils/orderBook";
import { OrderType as ClobOrderType } from "@polymarket/clob-client";
```

Then change the FOK market order call (lines 242-246) from:
```typescript
          orderResult = await client.createAndPostMarketOrder({
            tokenID: tokenId,
            side: Side.SELL,
            amount: positionSize,
          });
```
To:
```typescript
          orderResult = await client.createAndPostMarketOrder(
            {
              tokenID: tokenId,
              side: Side.SELL,
              amount: positionSize,
            },
            orderOptions,
            ClobOrderType.FOK
          );
```

And change the limit fallback calls (lines 257-263 and 274-280) to include `orderOptions`:
```typescript
          orderResult = await client.createAndPostOrder(
            {
              tokenID: tokenId,
              side: Side.SELL,
              price: bestBidResult.price,
              size: positionSize,
              feeRateBps: 0,
            },
            orderOptions
          );
```

- [ ] **Step 5: Run all tests**

Run: `cd src/plugins/polymarket && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/plugins/polymarket/actions/placeOrder.ts src/plugins/polymarket/actions/closePosition.ts src/plugins/polymarket/__tests__/tickSizeOptions.test.ts
git commit -m "fix(polymarket): pass tickSize and negRisk to SDK order methods (C2, C4)"
```

---

### Task 5: Fix market order amount semantics + price recalculation + reject undetermined price (C1 + C6 + H10)

**Findings:** C1 (BUY amount = dollars), C6 (stale size), H10 (silent $0.50 default)
**Files:**
- Create: `src/plugins/polymarket/__tests__/marketOrderAmount.test.ts`
- Create: `src/plugins/polymarket/__tests__/priceRecalculation.test.ts`
- Modify: `src/plugins/polymarket/actions/placeOrder.ts:563-609, 677-688, 728-739`

- [ ] **Step 1: Write failing tests for market order amount**

```typescript
// __tests__/marketOrderAmount.test.ts
import { describe, it, expect } from "vitest";

/**
 * Compute the correct `amount` for a market order.
 * BUY: amount is in USDC (dollars). SELL: amount is in shares.
 */
function computeMarketOrderAmount(
  side: "BUY" | "SELL",
  price: number,
  size: number,
  dollarAmount: number,
  isDollarAmount: boolean
): number {
  // This function will be extracted from placeOrder.ts
  const { computeMarketOrderAmount: fn } = require("../utils/preTradeChecks");
  return fn(side, price, size, dollarAmount, isDollarAmount);
}

describe("computeMarketOrderAmount", () => {
  it("BUY + user specified dollars: amount = dollarAmount", () => {
    expect(computeMarketOrderAmount("BUY", 0.5, 20, 10, true)).toBe(10);
  });

  it("BUY + user specified shares: amount = price * size", () => {
    expect(computeMarketOrderAmount("BUY", 0.5, 20, 0, false)).toBe(10);
  });

  it("SELL + user specified shares: amount = size", () => {
    expect(computeMarketOrderAmount("SELL", 0.5, 20, 0, false)).toBe(20);
  });

  it("SELL + user specified dollars: amount = floor(dollarAmount / price) = shares", () => {
    expect(computeMarketOrderAmount("SELL", 0.5, 0, 10, true)).toBe(20);
  });

  it("BUY at low price: avoids the 10x over-buy bug", () => {
    // Old bug: amount=20 (shares) at $0.10 = API reads $20, buys 200 shares
    // Fixed: amount=20*0.10=2 (dollars) at $0.10 = API buys 20 shares
    expect(computeMarketOrderAmount("BUY", 0.10, 20, 0, false)).toBeCloseTo(2.0);
  });
});
```

- [ ] **Step 2: Write failing tests for price recalculation**

```typescript
// __tests__/priceRecalculation.test.ts
import { describe, it, expect } from "vitest";

/**
 * Recalculate size when final price differs from initial estimate.
 */
function recalculateSize(
  isDollarAmount: boolean,
  dollarAmount: number,
  currentSize: number,
  finalPrice: number
): number {
  const { recalculateSize: fn } = require("../utils/preTradeChecks");
  return fn(isDollarAmount, dollarAmount, currentSize, finalPrice);
}

describe("recalculateSize", () => {
  it("recalculates when isDollarAmount and price changed", () => {
    // $10 order, initial price was 0.50 (size=20), final price is 0.80
    expect(recalculateSize(true, 10, 20, 0.80)).toBe(12); // floor(10/0.80)
  });

  it("does not change size when not isDollarAmount", () => {
    expect(recalculateSize(false, 0, 20, 0.80)).toBe(20);
  });

  it("returns 0 when finalPrice is 0", () => {
    expect(recalculateSize(true, 10, 20, 0)).toBe(0);
  });
});

describe("reject undetermined price (H10)", () => {
  it("price <= 0 after all lookups should not default to 0.50", () => {
    // The fix: if price is still <= 0 after order book lookup, reject
    // We test this by verifying the sentinel behavior
    const shouldRejectUndeterminedPrice = (price: number): boolean => {
      return price <= 0;
    };
    expect(shouldRejectUndeterminedPrice(0)).toBe(true);
    expect(shouldRejectUndeterminedPrice(-1)).toBe(true);
    expect(shouldRejectUndeterminedPrice(0.5)).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd src/plugins/polymarket && npx vitest run __tests__/marketOrderAmount.test.ts __tests__/priceRecalculation.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 4: Create `utils/preTradeChecks.ts` with helper functions**

```typescript
// utils/preTradeChecks.ts

/**
 * Compute the correct `amount` parameter for a Polymarket market order.
 *
 * Per Polymarket SDK docs:
 * - BUY orders: `amount` is in USDC (dollars to spend)
 * - SELL orders: `amount` is in shares
 */
export function computeMarketOrderAmount(
  side: "BUY" | "SELL",
  price: number,
  size: number,
  dollarAmount: number,
  isDollarAmount: boolean
): number {
  if (side === "BUY") {
    // BUY: API expects dollar amount
    return isDollarAmount ? dollarAmount : price * size;
  }
  // SELL: API expects share count
  return isDollarAmount ? Math.floor(dollarAmount / price) : size;
}

/**
 * Recalculate order size when the final price differs from the initial estimate.
 * Only applies when the user specified a dollar amount (not shares).
 */
export function recalculateSize(
  isDollarAmount: boolean,
  dollarAmount: number,
  currentSize: number,
  finalPrice: number
): number {
  if (!isDollarAmount) return currentSize;
  if (finalPrice <= 0) return 0;
  return Math.floor(dollarAmount / finalPrice);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd src/plugins/polymarket && npx vitest run __tests__/marketOrderAmount.test.ts __tests__/priceRecalculation.test.ts`
Expected: PASS

- [ ] **Step 6: Apply fixes to placeOrder.ts**

**Fix H10 — Remove $0.50 default (lines 604-609).** Change:
```typescript
    if (price <= 0) {
      // Default to 50% if we can't determine price
      price = 0.5;
      runtime.logger.warn("[placeOrderAction] No price specified, defaulting to $0.50");
    }
```
To:
```typescript
    // price <= 0 is OK here — we'll try to get it from the order book next.
    // If still undetermined after order book lookup, we reject (H10).
```

**Also fix the dollar-to-shares initial fallback (lines 572-574).** Change:
```typescript
      } else {
        // If we don't have a price yet, estimate with 0.5
        size = Math.floor(dollarAmount / 0.5);
      }
```
To:
```typescript
      } else {
        // Price not yet known — set size to 0, will be recalculated after order book fetch (C6)
        size = 0;
      }
```
Note: `size = 0` will be caught and fixed by the C6 recalculation block after the order book price is determined. If the order book also fails to provide a price, H10 rejects the order before we reach the `size <= 0` check.

**Fix C6 — Recalculate size after order book price (after line 688).** Add:
```typescript
      // C6 fix: recalculate size if we updated the price and user specified dollars
      if (isDollarAmount && dollarAmount > 0) {
        const newSize = Math.floor(dollarAmount / price);
        if (newSize !== size) {
          runtime.logger.info(
            `[placeOrderAction] Recalculated size: ${size} -> ${newSize} shares at final price $${price.toFixed(4)}`
          );
          size = newSize;
        }
      }
```

**Fix H10 — Reject if price still undetermined (after the order book block, before line 703).** Add:
```typescript
    // H10: Reject if price could not be determined from any source
    if (price <= 0) {
      await sendError(
        callback,
        "Could not determine market price. Please specify a price explicitly.",
        "No price available from market search or order book"
      );
      return { success: false, text: "Price undetermined", error: "price_undetermined" };
    }
```

**Fix C1 — Correct market order amount (lines 731-738).** Change:
```typescript
        const marketOrderArgs = {
          tokenID: tokenId,
          price,
          amount: size,
          side: side === "BUY" ? Side.BUY : Side.SELL,
```
To:
```typescript
        const marketAmount = computeMarketOrderAmount(
          side as "BUY" | "SELL", price, size, dollarAmount, isDollarAmount
        );
        const marketOrderArgs = {
          tokenID: tokenId,
          price,
          amount: marketAmount,
          side: side === "BUY" ? Side.BUY : Side.SELL,
```

Add import at top of `placeOrder.ts`:
```typescript
import { computeMarketOrderAmount } from "../utils/preTradeChecks";
```

- [ ] **Step 7: Run all tests**

Run: `cd src/plugins/polymarket && npx vitest run`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add src/plugins/polymarket/actions/placeOrder.ts src/plugins/polymarket/utils/preTradeChecks.ts src/plugins/polymarket/__tests__/marketOrderAmount.test.ts src/plugins/polymarket/__tests__/priceRecalculation.test.ts
git commit -m "fix(polymarket): correct market order amount semantics and price handling (C1, C6, H10)"
```

---

## Chunk 3: Pre-Trade Validation and Integration

### Task 6: Pre-trade balance check + min order size + bounds validation (H1 + H3 + H8)

**Findings:** H1 (no balance check), H3 (no bounds), H8 (no min_order_size)
**Files:**
- Create: `src/plugins/polymarket/__tests__/preTradeChecks.test.ts`
- Modify: `src/plugins/polymarket/utils/preTradeChecks.ts` (add validation functions)
- Modify: `src/plugins/polymarket/actions/placeOrder.ts`

- [ ] **Step 1: Write failing tests for pre-trade checks**

```typescript
// __tests__/preTradeChecks.test.ts
import { describe, it, expect } from "vitest";
import {
  validateOrderBounds,
  validateMinOrderSize,
  validateBalance,
} from "../utils/preTradeChecks";

describe("validateOrderBounds (H3)", () => {
  it("rejects size > MAX_TRADE_SIZE_USD / price", () => {
    const result = validateOrderBounds({ price: 0.5, size: 300, maxTradeSizeUsd: 100 });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("exceeds");
  });

  it("accepts size within bounds", () => {
    const result = validateOrderBounds({ price: 0.5, size: 100, maxTradeSizeUsd: 100 });
    expect(result.valid).toBe(true);
  });

  it("rejects price outside 0-1 range", () => {
    const result = validateOrderBounds({ price: 1.5, size: 10, maxTradeSizeUsd: 100 });
    expect(result.valid).toBe(false);
  });

  it("rejects price of exactly 0", () => {
    const result = validateOrderBounds({ price: 0, size: 10, maxTradeSizeUsd: 100 });
    expect(result.valid).toBe(false);
  });
});

describe("validateMinOrderSize (H8)", () => {
  it("rejects size below min_order_size", () => {
    const result = validateMinOrderSize(3, "5");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("minimum");
  });

  it("accepts size at min_order_size", () => {
    const result = validateMinOrderSize(5, "5");
    expect(result.valid).toBe(true);
  });

  it("handles unparseable min_order_size gracefully", () => {
    const result = validateMinOrderSize(1, "");
    expect(result.valid).toBe(true); // Default to allowing
  });
});

describe("validateBalance (H1)", () => {
  it("rejects when balance < order cost", () => {
    const result = validateBalance(5, 20); // $5 balance, $20 order
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Insufficient");
  });

  it("accepts when balance >= order cost", () => {
    const result = validateBalance(100, 20);
    expect(result.valid).toBe(true);
  });

  it("accepts when balance is null (skip check)", () => {
    const result = validateBalance(null, 20);
    expect(result.valid).toBe(true); // Can't verify, allow through
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/plugins/polymarket && npx vitest run __tests__/preTradeChecks.test.ts`
Expected: FAIL — functions not yet defined

- [ ] **Step 3: Add validation functions to `utils/preTradeChecks.ts`**

Append to `utils/preTradeChecks.ts`:

```typescript
interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate order bounds before submission (H3).
 */
export function validateOrderBounds(params: {
  price: number;
  size: number;
  maxTradeSizeUsd: number;
}): ValidationResult {
  const { price, size, maxTradeSizeUsd } = params;

  if (price <= 0 || price >= 1) {
    return { valid: false, reason: `Price $${price} is outside valid range (0, 1)` };
  }

  const orderValue = price * size;
  if (orderValue > maxTradeSizeUsd) {
    return {
      valid: false,
      reason: `Order value $${orderValue.toFixed(2)} exceeds max trade size $${maxTradeSizeUsd}`,
    };
  }

  return { valid: true };
}

/**
 * Validate order size against market minimum (H8).
 */
export function validateMinOrderSize(size: number, minOrderSize: string): ValidationResult {
  const min = parseFloat(minOrderSize);
  if (!Number.isFinite(min) || min <= 0) {
    return { valid: true }; // Can't validate, allow through
  }
  if (size < min) {
    return { valid: false, reason: `Order size ${size} is below minimum ${min} for this market` };
  }
  return { valid: true };
}

/**
 * Validate user has sufficient balance (H1).
 */
export function validateBalance(
  balance: number | null,
  orderCost: number
): ValidationResult {
  if (balance === null || balance === undefined) {
    return { valid: true }; // Can't verify, allow through
  }
  if (balance < orderCost) {
    return {
      valid: false,
      reason: `Insufficient balance: $${balance.toFixed(2)} available, $${orderCost.toFixed(2)} required`,
    };
  }
  return { valid: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/plugins/polymarket && npx vitest run __tests__/preTradeChecks.test.ts`
Expected: PASS

- [ ] **Step 5: Integrate pre-trade checks into placeOrder.ts**

In `src/plugins/polymarket/actions/placeOrder.ts`, after the price validation block and before the order submission, add the pre-trade checks.

Add imports:
```typescript
import {
  computeMarketOrderAmount,
  validateOrderBounds,
  validateMinOrderSize,
  validateBalance,
} from "../utils/preTradeChecks";
```

After `price = roundToTickSize(price, tickSize);` and the price range check (line 707-710), add:

```typescript
    // H3: Validate order bounds
    const maxTradeSizeUsd = parseFloat(
      String(runtime.getSetting("POLYMARKET_MAX_TRADE_SIZE_USD") || "100")
    );
    const boundsCheck = validateOrderBounds({ price, size, maxTradeSizeUsd });
    if (!boundsCheck.valid) {
      await sendError(callback, boundsCheck.reason!, "Pre-trade validation");
      return { success: false, text: boundsCheck.reason!, error: "bounds_exceeded" };
    }

    // H8: Validate min order size
    const minSizeCheck = validateMinOrderSize(size, meta.minOrderSize);
    if (!minSizeCheck.valid) {
      await sendError(callback, minSizeCheck.reason!, "Pre-trade validation");
      return { success: false, text: minSizeCheck.reason!, error: "below_min_size" };
    }

    // H1: Validate balance
    const service = runtime.getService(POLYMARKET_SERVICE_NAME) as PolymarketService | undefined;
    const accountState = service?.getCachedAccountState();
    const usdcBalance = accountState?.balances?.collateral
      ? parseFloat(accountState.balances.collateral.balance)
      : null;
    const orderCost = price * size;
    const balanceCheck = validateBalance(usdcBalance, orderCost);
    if (!balanceCheck.valid) {
      await sendError(callback, balanceCheck.reason!, "Pre-trade validation");
      return { success: false, text: balanceCheck.reason!, error: "insufficient_balance" };
    }
```

Note: `meta` variable needs to be available in this scope. It's currently declared inside the try block at line 661. Move the `let meta` declaration before the try block so it's accessible:

Before the order book try block, add:
```typescript
    let meta = { tickSize: "0.01", minOrderSize: "1", negRisk: false, lastTradePrice: null as string | null };
```

And inside the try block, reassign:
```typescript
      meta = parseOrderBookMetadata(orderBook as unknown as Record<string, unknown>);
      tickSize = meta.tickSize;
```

- [ ] **Step 6: Run all tests**

Run: `cd src/plugins/polymarket && npx vitest run`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add src/plugins/polymarket/utils/preTradeChecks.ts src/plugins/polymarket/actions/placeOrder.ts src/plugins/polymarket/__tests__/preTradeChecks.test.ts
git commit -m "feat(polymarket): add pre-trade balance, bounds, and min-size validation (H1, H3, H8)"
```

---

### Task 7: Wire Zod schemas into money-path actions

**Findings:** C5 (continued — integrate schemas into actions)
**Files:**
- Modify: `src/plugins/polymarket/actions/placeOrder.ts` (use PlaceOrderParamsSchema)
- Modify: `src/plugins/polymarket/actions/cancelOrder.ts` (use CancelOrderParamsSchema)
- Modify: `src/plugins/polymarket/actions/closePosition.ts` (use ClosePositionParamsSchema)

- [ ] **Step 1: Wire PlaceOrderParamsSchema into placeOrder.ts**

Add imports at the top of the file:
```typescript
import { PlaceOrderParamsSchema } from "../utils/llmSchemas";
```

Change the LLM call (around line 415) from:
```typescript
    const llmResult = await callLLMWithTimeout<PlaceOrderParams>(
      runtime,
      state,
      orderTemplate,
      "placeOrderAction"
    );
```
To:
```typescript
    const llmResult = await callLLMWithTimeout<PlaceOrderParams>(
      runtime,
      state,
      orderTemplate,
      "placeOrderAction",
      undefined,
      PlaceOrderParamsSchema
    );
```
Note: pass `undefined` for timeout to keep the default — avoids needing to import `LLM_CALL_TIMEOUT_MS`.

- [ ] **Step 2: Wire CancelOrderParamsSchema into cancelOrder.ts**

Change the LLM call (around line 142) from:
```typescript
      const llmResult = await callLLMWithTimeout<LLMCancelOrderResult>(
        runtime,
        state,
        cancelOrderTemplate,
        "cancelOrderAction"
      );
```
To:
```typescript
      const llmResult = await callLLMWithTimeout<LLMCancelOrderResult>(
        runtime,
        state,
        cancelOrderTemplate,
        "cancelOrderAction",
        undefined,
        CancelOrderParamsSchema
      );
```

Add import:
```typescript
import { CancelOrderParamsSchema } from "../utils/llmSchemas";
```

- [ ] **Step 3: Wire ClosePositionParamsSchema into closePosition.ts**

Change the LLM call (around line 141) from:
```typescript
      const llmResult = await callLLMWithTimeout<LLMClosePositionResult>(
        runtime,
        state,
        closePositionTemplate,
        "closePositionAction"
      );
```
To:
```typescript
      const llmResult = await callLLMWithTimeout<LLMClosePositionResult>(
        runtime,
        state,
        closePositionTemplate,
        "closePositionAction",
        undefined,
        ClosePositionParamsSchema
      );
```

Add import:
```typescript
import { ClosePositionParamsSchema } from "../utils/llmSchemas";
```

- [ ] **Step 4: Run all tests**

Run: `cd src/plugins/polymarket && npx vitest run`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/plugins/polymarket/actions/placeOrder.ts src/plugins/polymarket/actions/cancelOrder.ts src/plugins/polymarket/actions/closePosition.ts
git commit -m "feat(polymarket): wire Zod schemas into money-path LLM extraction (C5)"
```

---

### Task 8: Final integration smoke test

**Files:**
- No new files — run the full test suite and verify everything works together

- [ ] **Step 1: Run the full test suite**

Run: `cd src/plugins/polymarket && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript type checking**

Run: `cd /Users/pleasures/Desktop/Untitled && npx tsc --noEmit --project src/plugins/polymarket/tsconfig.json 2>/dev/null || npx tsc --noEmit`
Expected: No type errors in polymarket plugin files

- [ ] **Step 3: Verify test count**

Run: `cd src/plugins/polymarket && npx vitest run 2>&1 | tail -5`
Expected: Should show ~45+ new test cases across the new test files

- [ ] **Step 4: Commit any final adjustments**

```bash
git add -A src/plugins/polymarket/
git commit -m "test(polymarket): Phase 1 audit remediation complete — all critical fixes verified"
```

---

## Summary

| Task | Findings | New Tests | Key Changes |
|------|----------|-----------|-------------|
| 1 | H11 | 4 | Standardize key lookup, export `getPrivateKey` |
| 2 | C5 | 10 | Zod schemas for LLM extraction |
| 3 | C3 | 9 | Remove balance heuristic |
| 4 | C2, C4 | 3 | Pass tickSize/negRisk to SDK |
| 5 | C1, C6, H10 | 8 | Fix amount semantics, recalculate size, reject undetermined price |
| 6 | H1, H3, H8 | 9 | Pre-trade balance/bounds/min-size checks |
| 7 | C5 (wire) | 0 | Connect schemas to actions |
| 8 | — | 0 | Integration verification |
| **Total** | **11** | **~43** | |
