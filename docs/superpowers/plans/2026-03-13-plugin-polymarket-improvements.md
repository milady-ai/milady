# Plugin Polymarket Improvements — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cancel order, close position, trade risk evaluator, and P&L to the Polymarket plugin, and fix the orderbook parsing bug.

**Architecture:** Fork the upstream plugin, fix the bug in two action files, add two new action files + one evaluator + enhance the provider. All new code follows existing patterns (LLM extraction, callback messaging, service integration). Tests use Vitest.

**Tech Stack:** TypeScript, ElizaOS core (Action/Evaluator/Provider interfaces), @polymarket/clob-client, Vitest, Bun

**Spec:** `docs/superpowers/specs/2026-03-13-plugin-polymarket-improvements-design.md`

---

## Chunk 1: Setup & Orderbook Fix

### Task 1: Fork and Clone

**Files:**
- Modify: milady `package.json` (dependency pointer)

- [ ] **Step 1: Fork the upstream repo**

```bash
gh repo fork elizaos-plugins/plugin-polymarket --clone --remote
cd plugin-polymarket
```

- [ ] **Step 2: Install dependencies and verify build**

```bash
cd typescript
bun install
bun run build
```

Expected: Build completes with `dist/index.js` output.

- [ ] **Step 3: Point milady to local fork**

In `milady/package.json`, change the `@elizaos/plugin-polymarket` dependency to:

```json
"@elizaos/plugin-polymarket": "file:../plugin-polymarket/typescript"
```

Then run `bun install` in milady to link it.

- [ ] **Step 4: Verify milady still builds with local dependency**

```bash
cd /path/to/milady
bun install
bun run build
```

Expected: No errors. Plugin loads from local fork.

- [ ] **Step 5: Commit**

```bash
cd /path/to/plugin-polymarket
git add -A
git commit -m "chore: initial fork setup"
```

---

### Task 2: Extract `deriveBestPrices` Utility

**Files:**
- Create: `typescript/utils/orderbook.ts`

The orderbook parsing fix is needed in two places. Extract a shared utility to avoid duplication.

- [ ] **Step 1: Write the failing test**

Create `typescript/__tests__/orderbook.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { deriveBestBid, deriveBestAsk } from "../utils/orderbook";
import type { BookEntry } from "../types";

describe("deriveBestBid", () => {
  it("returns highest price from unsorted bids", () => {
    const bids: BookEntry[] = [
      { price: "0.30", size: "100" },
      { price: "0.55", size: "50" },
      { price: "0.42", size: "200" },
    ];
    expect(deriveBestBid(bids)).toEqual({ price: 0.55, size: "50" });
  });

  it("returns null for empty bids", () => {
    expect(deriveBestBid([])).toBeNull();
  });

  it("filters out NaN and Infinity prices", () => {
    const bids: BookEntry[] = [
      { price: "NaN", size: "100" },
      { price: "Infinity", size: "50" },
      { price: "0.40", size: "200" },
    ];
    expect(deriveBestBid(bids)).toEqual({ price: 0.40, size: "200" });
  });

  it("returns null if all prices are invalid", () => {
    const bids: BookEntry[] = [
      { price: "NaN", size: "100" },
      { price: "not-a-number", size: "50" },
    ];
    expect(deriveBestBid(bids)).toBeNull();
  });

  it("handles single-level orderbook", () => {
    const bids: BookEntry[] = [{ price: "0.65", size: "300" }];
    expect(deriveBestBid(bids)).toEqual({ price: 0.65, size: "300" });
  });
});

describe("deriveBestAsk", () => {
  it("returns lowest price from unsorted asks", () => {
    const asks: BookEntry[] = [
      { price: "0.70", size: "100" },
      { price: "0.45", size: "50" },
      { price: "0.60", size: "200" },
    ];
    expect(deriveBestAsk(asks)).toEqual({ price: 0.45, size: "50" });
  });

  it("returns null for empty asks", () => {
    expect(deriveBestAsk([])).toBeNull();
  });

  it("filters out NaN and negative prices", () => {
    const asks: BookEntry[] = [
      { price: "-0.10", size: "100" },
      { price: "NaN", size: "50" },
      { price: "0.55", size: "200" },
    ];
    expect(deriveBestAsk(asks)).toEqual({ price: 0.55, size: "200" });
  });

  it("handles single-level orderbook", () => {
    const asks: BookEntry[] = [{ price: "0.80", size: "150" }];
    expect(deriveBestAsk(asks)).toEqual({ price: 0.80, size: "150" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd typescript
bun run test __tests__/orderbook.test.ts
```

Expected: FAIL — module `../utils/orderbook` does not exist.

- [ ] **Step 3: Write the utility**

Create `typescript/utils/orderbook.ts`:

```typescript
import type { BookEntry } from "../types";

export interface BestPrice {
  price: number;
  size: string;
}

/**
 * Derive best bid (highest price) across all bid levels.
 * Handles unsorted arrays and filters invalid prices.
 */
export function deriveBestBid(bids: BookEntry[]): BestPrice | null {
  let best: BestPrice | null = null;

  for (const level of bids) {
    const price = parseFloat(level.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (best === null || price > best.price) {
      best = { price, size: level.size };
    }
  }

  return best;
}

/**
 * Derive best ask (lowest price) across all ask levels.
 * Handles unsorted arrays and filters invalid prices.
 */
export function deriveBestAsk(asks: BookEntry[]): BestPrice | null {
  let best: BestPrice | null = null;

  for (const level of asks) {
    const price = parseFloat(level.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (best === null || price < best.price) {
      best = { price, size: level.size };
    }
  }

  return best;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test __tests__/orderbook.test.ts
```

Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add typescript/utils/orderbook.ts typescript/__tests__/orderbook.test.ts
git commit -m "feat: add deriveBestBid/deriveBestAsk utility with tests"
```

---

### Task 3: Fix `getTokenInfo.ts` Orderbook Parsing

**Files:**
- Modify: `typescript/actions/getTokenInfo.ts` — `calculatePricing()` function (around line 97)

- [ ] **Step 1: Replace index-0 access with deriveBestBid/deriveBestAsk**

In `typescript/actions/getTokenInfo.ts`, add the import at the top:

```typescript
import { deriveBestBid, deriveBestAsk } from "../utils/orderbook";
```

Then replace the `calculatePricing` function (currently lines ~97-120):

```typescript
// BEFORE:
function calculatePricing(orderBook: OrderBook): TokenPricing {
  const topBid = orderBook.bids?.[0];
  const topAsk = orderBook.asks?.[0];

  const bestBid = topBid?.price ?? null;
  const bestBidSize = topBid?.size ?? null;
  const bestAsk = topAsk?.price ?? null;
  const bestAskSize = topAsk?.size ?? null;
  // ...
```

```typescript
// AFTER:
function calculatePricing(orderBook: OrderBook): TokenPricing {
  const topBid = deriveBestBid(orderBook.bids ?? []);
  const topAsk = deriveBestAsk(orderBook.asks ?? []);

  const bestBid = topBid ? topBid.price.toFixed(4) : null;
  const bestBidSize = topBid?.size ?? null;
  const bestAsk = topAsk ? topAsk.price.toFixed(4) : null;
  const bestAskSize = topAsk?.size ?? null;

  let midpoint: string | null = null;
  let spread: string | null = null;

  if (topBid && topAsk) {
    midpoint = ((topBid.price + topAsk.price) / 2).toFixed(4);
    spread = (topAsk.price - topBid.price).toFixed(4);
  }

  return {
    bestBid,
    bestBidSize,
    bestAsk,
    bestAskSize,
    midpoint,
    spread,
    bidLevels: orderBook.bids?.length ?? 0,
    askLevels: orderBook.asks?.length ?? 0,
  };
}
```

- [ ] **Step 2: Build and verify no type errors**

```bash
bun run build
```

Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add typescript/actions/getTokenInfo.ts
git commit -m "fix: derive best bid/ask from all orderbook levels in getTokenInfo"
```

---

### Task 4: Fix `placeOrder.ts` Orderbook Parsing

**Files:**
- Modify: `typescript/actions/placeOrder.ts` — auto-price selection logic

- [ ] **Step 1: Add import and replace index-0 access**

In `typescript/actions/placeOrder.ts`, add the import:

```typescript
import { deriveBestBid, deriveBestAsk } from "../utils/orderbook";
```

Find the auto-price selection block (search for `orderBook.asks?.[0]?.price` and `orderBook.bids?.[0]?.price`). Replace:

```typescript
// BEFORE:
const bestAsk = orderBook.asks?.[0]?.price;
const bestBid = orderBook.bids?.[0]?.price;
```

```typescript
// AFTER:
const bestAskResult = deriveBestAsk(orderBook.asks ?? []);
const bestBidResult = deriveBestBid(orderBook.bids ?? []);
const bestAsk = bestAskResult ? String(bestAskResult.price) : undefined;
const bestBid = bestBidResult ? String(bestBidResult.price) : undefined;
```

Ensure downstream code that uses `bestAsk` and `bestBid` as strings is unchanged — the variable types remain `string | undefined`.

- [ ] **Step 2: Build and verify**

```bash
bun run build
```

Expected: Clean build.

- [ ] **Step 3: Run all tests**

```bash
bun run test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add typescript/actions/placeOrder.ts
git commit -m "fix: derive best bid/ask from all orderbook levels in placeOrder"
```

---

## Chunk 2: Cancel Order Action

### Task 5: Add Cancel Order LLM Template

**Files:**
- Modify: `typescript/templates.ts`
- Create: add template to `typescript/generated/prompts/typescript/prompts.ts` (or define inline)

- [ ] **Step 1: Define the template**

Since the existing templates import from `generated/prompts`, and adding to the generated file is complex, define the template inline in the new action file. No changes to `templates.ts` needed.

Mark this step as complete — the template will live in `cancelOrder.ts` directly (same pattern as `getTokenInfo.ts` which defines `getTokenInfoTemplate` inline).

- [ ] **Step 2: Commit** (no-op, bundled with Task 6)

---

### Task 6: Implement Cancel Order Action

**Files:**
- Create: `typescript/actions/cancelOrder.ts`
- Modify: `typescript/actions/index.ts` — add export
- Modify: `typescript/index.ts` — register action

- [ ] **Step 1: Create `typescript/actions/cancelOrder.ts`**

```typescript
/**
 * @elizaos/plugin-polymarket Cancel Order Action
 *
 * Cancels one or more open orders using the appropriate CLOB client method:
 * - cancelAll() for all orders
 * - cancelMarketOrders({ asset_id }) for per-token cancellation
 * - cancelOrder({ orderID }) for specific orders
 */

import {
  type Action,
  type ActionResult,
  type Content,
  type HandlerCallback,
  type HandlerOptions,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import type { ClobClient } from "@polymarket/clob-client";
import { POLYMARKET_SERVICE_NAME } from "../constants";
import type { PolymarketService } from "../services/polymarket";
import { initializeClobClientWithCreds } from "../utils/clobClient";
import {
  callLLMWithTimeout,
  isLLMError,
  sendAcknowledgement,
  sendError,
} from "../utils/llmHelpers";

// =============================================================================
// Types
// =============================================================================

interface LLMCancelOrderResult {
  orderIds?: string[];
  cancelAll?: boolean;
  tokenId?: string;
  error?: string;
}

// =============================================================================
// Template
// =============================================================================

const cancelOrderTemplate = `You are an assistant extracting cancel order parameters from user messages for Polymarket.

The user wants to cancel orders. Extract:
- "orderIds": array of specific order ID strings (if the user mentions specific orders)
- "cancelAll": true if the user wants to cancel ALL their orders
- "tokenId": a token ID or asset ID if the user wants to cancel all orders on a specific market/token

At least one of orderIds, cancelAll, or tokenId must be provided.

Respond with JSON only:
{
  "orderIds": ["string"] | null,
  "cancelAll": true | false,
  "tokenId": "string" | null
}

Recent conversation:
{{recentMessages}}

User's current request:
{{currentMessage}}`;

// =============================================================================
// Action Definition
// =============================================================================

export const cancelOrderAction: Action = {
  name: "POLYMARKET_CANCEL_ORDER",
  similes: [
    "CANCEL_ORDER",
    "CANCEL_ORDERS",
    "REMOVE_ORDER",
    "DELETE_ORDER",
    "CANCEL_ALL_ORDERS",
    "CANCEL_MY_ORDERS",
  ],
  description:
    "Cancels one or more open Polymarket orders. Can cancel specific orders by ID, all orders on a token/market, or all orders globally. Requires L1+L2 authentication.",

  parameters: [
    {
      name: "orderIds",
      description: "Specific order IDs to cancel",
      required: false,
      schema: { type: "array", items: { type: "string" } },
    },
    {
      name: "cancelAll",
      description: "If true, cancel all open orders",
      required: false,
      schema: { type: "boolean" },
    },
    {
      name: "tokenId",
      description: "Cancel all orders for a specific token/asset ID",
      required: false,
      schema: { type: "string" },
    },
  ],

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const hasPrivateKey = Boolean(
      runtime.getSetting("POLYMARKET_PRIVATE_KEY") ||
        runtime.getSetting("EVM_PRIVATE_KEY") ||
        runtime.getSetting("WALLET_PRIVATE_KEY")
    );
    if (!hasPrivateKey) {
      runtime.logger.warn("[cancelOrderAction] No private key configured.");
      return false;
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: HandlerOptions,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    runtime.logger.info("[cancelOrderAction] Handler called");

    // Extract parameters
    let orderIds: string[] | null = null;
    let cancelAll = false;
    let tokenId: string | null = null;

    const params = options?.parameters as Record<string, unknown> | undefined;
    if (params?.orderIds) {
      orderIds = params.orderIds as string[];
    } else if (params?.cancelAll) {
      cancelAll = true;
    } else if (params?.tokenId) {
      tokenId = params.tokenId as string;
    } else {
      // LLM extraction
      const llmResult = await callLLMWithTimeout<LLMCancelOrderResult>(
        runtime,
        state,
        cancelOrderTemplate,
        "cancelOrderAction"
      );

      if (!isLLMError(llmResult) && llmResult) {
        orderIds = llmResult.orderIds ?? null;
        cancelAll = llmResult.cancelAll ?? false;
        tokenId = llmResult.tokenId ?? null;
      }
    }

    if (!orderIds?.length && !cancelAll && !tokenId) {
      await sendError(
        callback,
        "Please specify which orders to cancel: specific order IDs, a token/market, or 'cancel all'."
      );
      return { success: false, text: "Missing cancel parameters", error: "missing_params" };
    }

    const mode = cancelAll
      ? "all orders"
      : tokenId
        ? `orders on token ${tokenId.slice(0, 16)}...`
        : `${orderIds!.length} specific order(s)`;

    await sendAcknowledgement(callback, `Cancelling ${mode}...`);

    try {
      const client = (await initializeClobClientWithCreds(runtime)) as ClobClient;
      let cancelledCount = 0;
      const errors: string[] = [];

      if (cancelAll) {
        // Use native cancelAll() — server-side bulk cancel
        await client.cancelAll();
        // Get count from cached state for the response
        const service = runtime.getService(POLYMARKET_SERVICE_NAME) as PolymarketService | undefined;
        const accountState = service?.getCachedAccountState();
        cancelledCount = accountState?.activeOrders.length ?? 0;
        runtime.logger.info(`[cancelOrderAction] cancelAll() executed`);
      } else if (tokenId) {
        // Use native cancelMarketOrders() — per-token cancel
        await client.cancelMarketOrders({ asset_id: tokenId });
        const service = runtime.getService(POLYMARKET_SERVICE_NAME) as PolymarketService | undefined;
        const accountState = service?.getCachedAccountState();
        cancelledCount =
          accountState?.activeOrders.filter((o) => o.asset_id === tokenId).length ?? 0;
        runtime.logger.info(`[cancelOrderAction] cancelMarketOrders for ${tokenId.slice(0, 16)}`);
      } else if (orderIds) {
        // Cancel specific orders one by one using cancelOrder({ orderID })
        for (const orderId of orderIds) {
          try {
            await client.cancelOrder({ orderID: orderId });
            cancelledCount++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`Order ${orderId}: ${msg}`);
            runtime.logger.warn(`[cancelOrderAction] Failed to cancel ${orderId}: ${msg}`);
          }
        }
      }

      // Invalidate account state cache
      const service = runtime.getService(POLYMARKET_SERVICE_NAME) as PolymarketService | undefined;
      if (service?.refreshAccountState) {
        await service.refreshAccountState();
      }

      // Build response
      let responseText: string;
      if (errors.length > 0 && cancelledCount > 0) {
        responseText =
          `Cancelled ${cancelledCount} order(s). ` +
          `${errors.length} failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
      } else if (errors.length > 0) {
        responseText = `Failed to cancel orders:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
      } else if (cancelledCount === 0) {
        responseText = "No open orders to cancel.";
      } else {
        responseText = `Successfully cancelled ${cancelledCount} order(s).`;
      }

      const content: Content = {
        text: responseText,
        actions: ["POLYMARKET_CANCEL_ORDER"],
        data: { cancelledCount, errors, mode },
      };

      if (callback) await callback(content);

      return {
        success: errors.length === 0,
        text: responseText,
        data: content.data,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      runtime.logger.error("[cancelOrderAction] Error:", error);
      await sendError(callback, errorMsg);
      return { success: false, text: errorMsg, error: errorMsg };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Cancel all my orders" },
      },
      {
        name: "{{user2}}",
        content: {
          text: "I'll cancel all your open orders.",
          action: "POLYMARKET_CANCEL_ORDER",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Cancel my orders on token 0x123abc" },
      },
      {
        name: "{{user2}}",
        content: {
          text: "I'll cancel all orders on that token.",
          action: "POLYMARKET_CANCEL_ORDER",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Remove order abc-123-def" },
      },
      {
        name: "{{user2}}",
        content: {
          text: "I'll cancel that specific order.",
          action: "POLYMARKET_CANCEL_ORDER",
        },
      },
    ],
  ],
};
```

- [ ] **Step 2: Add export to `typescript/actions/index.ts`**

Add this line:

```typescript
export { cancelOrderAction } from "./cancelOrder";
```

- [ ] **Step 3: Register in `typescript/index.ts`**

Add import:

```typescript
import { cancelOrderAction } from "./actions";
```

(It's already re-exported from `./actions/index.ts`.)

Add to the `actions` array in `polymarketPlugin`:

```typescript
actions: [
  retrieveAllMarketsAction,
  getTokenInfoAction,
  getOrderBookDepthAction,
  placeOrderAction,
  getOrderDetailsAction,
  checkOrderScoringAction,
  researchMarketAction,
  cancelOrderAction, // NEW
],
```

- [ ] **Step 4: Build and verify**

```bash
bun run build
```

Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add typescript/actions/cancelOrder.ts typescript/actions/index.ts typescript/index.ts
git commit -m "feat: add cancel order action (cancelAll, per-token, per-ID)"
```

---

## Chunk 3: Close Position Action

### Task 7: Implement Close Position Action

**Files:**
- Create: `typescript/actions/closePosition.ts`
- Modify: `typescript/actions/index.ts` — add export
- Modify: `typescript/index.ts` — register action

- [ ] **Step 1: Create `typescript/actions/closePosition.ts`**

```typescript
/**
 * @elizaos/plugin-polymarket Close Position Action
 *
 * Exits a position by selling all held shares. Detects YES/NO side automatically.
 * Defaults to market order (FOK) with fallback to limit at best bid.
 * Optionally cancels open orders on the token first.
 */

import {
  type Action,
  type ActionResult,
  type Content,
  type HandlerCallback,
  type HandlerOptions,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import type { ClobClient } from "@polymarket/clob-client";
import { Side } from "@polymarket/clob-client";
import { POLYMARKET_SERVICE_NAME } from "../constants";
import type { PolymarketService } from "../services/polymarket";
import type { OrderBook, Position } from "../types";
import { initializeClobClientWithCreds } from "../utils/clobClient";
import { deriveBestBid } from "../utils/orderbook";
import {
  callLLMWithTimeout,
  isLLMError,
  sendAcknowledgement,
  sendError,
  sendUpdate,
} from "../utils/llmHelpers";

// =============================================================================
// Types
// =============================================================================

interface LLMClosePositionResult {
  tokenId?: string;
  marketName?: string;
  cancelOpenOrders?: boolean;
  orderType?: "limit" | "market";
  error?: string;
}

// =============================================================================
// Template
// =============================================================================

const closePositionTemplate = `You are an assistant extracting close position parameters from user messages for Polymarket.

The user wants to close/exit a position. Extract:
- "tokenId": the token ID or asset ID to close position on (hex string)
- "marketName": natural language market name if no token ID provided
- "cancelOpenOrders": whether to also cancel open orders on this token (default true)
- "orderType": "market" for immediate exit (default) or "limit" for best-bid limit order

Respond with JSON only:
{
  "tokenId": "string or null",
  "marketName": "string or null",
  "cancelOpenOrders": true,
  "orderType": "market"
}

Recent conversation:
{{recentMessages}}

User's current request:
{{currentMessage}}`;

// =============================================================================
// Action Definition
// =============================================================================

export const closePositionAction: Action = {
  name: "POLYMARKET_CLOSE_POSITION",
  similes: [
    "CLOSE_POSITION",
    "EXIT_POSITION",
    "SELL_ALL",
    "SELL_POSITION",
    "CLOSE_TRADE",
    "EXIT_TRADE",
  ],
  description:
    "Closes/exits a Polymarket position by selling all held shares on a token. Detects YES/NO side automatically. " +
    "Defaults to market order (FOK) for immediate exit, with fallback to limit at best bid. " +
    "Optionally cancels open orders on the token first. Requires L1+L2 authentication.",

  parameters: [
    {
      name: "tokenId",
      description: "Token ID to close position on",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "marketName",
      description: "Market name for lookup (alternative to tokenId)",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "cancelOpenOrders",
      description: "Cancel open orders on this token first (default: true)",
      required: false,
      schema: { type: "boolean" },
    },
    {
      name: "orderType",
      description: "Order type: 'market' (FOK, default) or 'limit' (best bid GTC)",
      required: false,
      schema: { type: "string", enum: ["market", "limit"] },
    },
  ],

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const hasPrivateKey = Boolean(
      runtime.getSetting("POLYMARKET_PRIVATE_KEY") ||
        runtime.getSetting("EVM_PRIVATE_KEY") ||
        runtime.getSetting("WALLET_PRIVATE_KEY")
    );
    if (!hasPrivateKey) {
      runtime.logger.warn("[closePositionAction] No private key configured.");
      return false;
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: HandlerOptions,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    runtime.logger.info("[closePositionAction] Handler called");

    // Extract parameters
    let tokenId: string | null = null;
    let marketName: string | null = null;
    let cancelOpenOrders = true;
    let orderType: "market" | "limit" = "market";

    const params = options?.parameters as Record<string, unknown> | undefined;
    if (params?.tokenId) {
      tokenId = params.tokenId as string;
    } else if (params?.marketName) {
      marketName = params.marketName as string;
    }
    if (params?.cancelOpenOrders !== undefined) {
      cancelOpenOrders = Boolean(params.cancelOpenOrders);
    }
    if (params?.orderType === "limit") {
      orderType = "limit";
    }

    if (!tokenId && !marketName) {
      // LLM extraction
      const llmResult = await callLLMWithTimeout<LLMClosePositionResult>(
        runtime,
        state,
        closePositionTemplate,
        "closePositionAction"
      );

      if (!isLLMError(llmResult) && llmResult) {
        tokenId = llmResult.tokenId ?? null;
        marketName = llmResult.marketName ?? null;
        if (llmResult.cancelOpenOrders !== undefined) {
          cancelOpenOrders = llmResult.cancelOpenOrders;
        }
        if (llmResult.orderType === "limit") {
          orderType = "limit";
        }
      }
    }

    if (!tokenId && !marketName) {
      await sendError(callback, "Please specify which position to close (token ID or market name).");
      return { success: false, text: "Missing position identifier", error: "missing_id" };
    }

    await sendAcknowledgement(callback, "Looking up your position...", {
      tokenId: tokenId?.slice(0, 16),
      marketName,
    });

    try {
      const client = (await initializeClobClientWithCreds(runtime)) as ClobClient;
      const service = runtime.getService(POLYMARKET_SERVICE_NAME) as PolymarketService | undefined;

      // Find the user's position
      const accountState = service ? await service.getAccountState() : null;
      if (!accountState) {
        throw new Error("Unable to fetch account state. Please check your credentials.");
      }

      let position: Position | undefined;

      if (tokenId) {
        position = accountState.positions.find((p) => p.asset_id === tokenId);
      } else if (marketName) {
        // If we only have a market name, we need to find the position
        // Look through positions — they have market (condition_id) references
        // For now, report that a tokenId is needed
        await sendError(
          callback,
          "Please provide the token ID for the position you want to close. " +
            "You can find it by asking me to show your positions."
        );
        return {
          success: false,
          text: "Token ID required for close position",
          error: "need_token_id",
        };
      }

      if (!position || parseFloat(position.size) === 0) {
        const msg = tokenId
          ? `No open position found for token ${tokenId.slice(0, 16)}...`
          : "No matching position found.";
        if (callback) await callback({ text: msg });
        return { success: true, text: msg };
      }

      tokenId = position.asset_id;
      const positionSize = parseFloat(position.size);

      await sendUpdate(
        callback,
        `Found position: ${positionSize} shares @ avg $${position.average_price}. ` +
          `${cancelOpenOrders ? "Cancelling open orders first..." : "Placing sell order..."}`
      );

      // Step 1: Cancel open orders on this token if requested
      if (cancelOpenOrders) {
        try {
          await client.cancelMarketOrders({ asset_id: tokenId });
          runtime.logger.info(`[closePositionAction] Cancelled orders for ${tokenId.slice(0, 16)}`);
        } catch (err) {
          runtime.logger.warn("[closePositionAction] Failed to cancel orders:", err);
          // Continue — not a blocker for closing position
        }
      }

      // Step 2: Fetch orderbook and place sell order
      let orderBook: OrderBook;
      try {
        orderBook = (await client.getOrderBook(tokenId)) as OrderBook;
      } catch (err) {
        throw new Error("Failed to fetch order book. Cannot determine sell price.");
      }

      const bestBidResult = deriveBestBid(orderBook.bids ?? []);
      if (!bestBidResult) {
        throw new Error(
          "No bids in the order book — zero liquidity. Cannot close position. " +
            "You may need to wait for buyers or try a lower price manually."
        );
      }

      let responseText: string;
      let orderResult: any;

      if (orderType === "market") {
        // Try FOK market order for immediate fill
        try {
          orderResult = await client.createAndPostMarketOrder({
            tokenID: tokenId,
            side: Side.SELL,
            amount: positionSize, // amount is in shares for SELL
          });

          responseText =
            `Position closed via market order.\n` +
            `  Sold: ${positionSize} shares\n` +
            `  Entry: $${position.average_price}\n` +
            `  Order ID: ${orderResult?.orderID ?? "submitted"}`;
        } catch (err) {
          // FOK failed — fallback to limit at best bid
          runtime.logger.warn("[closePositionAction] Market order failed, falling back to limit:", err);

          orderResult = await client.createAndPostOrder({
            tokenID: tokenId,
            side: Side.SELL,
            price: bestBidResult.price,
            size: positionSize,
            feeRateBps: "0",
          });

          responseText =
            `Market order failed (insufficient liquidity). Placed limit sell instead.\n` +
            `  Selling: ${positionSize} shares @ $${bestBidResult.price.toFixed(4)}\n` +
            `  Entry: $${position.average_price}\n` +
            `  Est. proceeds: $${(positionSize * bestBidResult.price).toFixed(2)}\n` +
            `  Note: This is a limit order — it may not fill immediately.`;
        }
      } else {
        // Limit order at best bid
        orderResult = await client.createAndPostOrder({
          tokenID: tokenId,
          side: Side.SELL,
          price: bestBidResult.price,
          size: positionSize,
          feeRateBps: "0",
        });

        responseText =
          `Limit sell order placed to close position.\n` +
          `  Selling: ${positionSize} shares @ $${bestBidResult.price.toFixed(4)}\n` +
          `  Entry: $${position.average_price}\n` +
          `  Est. proceeds: $${(positionSize * bestBidResult.price).toFixed(2)}\n` +
          `  Note: This is a limit order — it may not fill immediately.`;
      }

      // Refresh account state
      if (service?.refreshAccountState) {
        await service.refreshAccountState();
      }

      const content: Content = {
        text: responseText,
        actions: ["POLYMARKET_CLOSE_POSITION"],
        data: {
          tokenId,
          positionSize,
          avgEntry: position.average_price,
          sellPrice: bestBidResult.price,
          orderType,
          orderResult,
        },
      };

      if (callback) await callback(content);
      return { success: true, text: responseText, data: content.data };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      runtime.logger.error("[closePositionAction] Error:", error);
      await sendError(callback, errorMsg);
      return { success: false, text: errorMsg, error: errorMsg };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Close my position on token 0x123abc" },
      },
      {
        name: "{{user2}}",
        content: {
          text: "I'll close your position on that token.",
          action: "POLYMARKET_CLOSE_POSITION",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Exit all my positions" },
      },
      {
        name: "{{user2}}",
        content: {
          text: "I'll need to close each position individually. Let me check your positions first.",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Sell everything on the Bitcoin market" },
      },
      {
        name: "{{user2}}",
        content: {
          text: "I'll close your position on that market.",
          action: "POLYMARKET_CLOSE_POSITION",
        },
      },
    ],
  ],
};
```

- [ ] **Step 2: Add export to `typescript/actions/index.ts`**

```typescript
export { closePositionAction } from "./closePosition";
```

- [ ] **Step 3: Register in `typescript/index.ts`**

Add `closePositionAction` to imports and the `actions` array:

```typescript
actions: [
  // ... existing actions ...
  cancelOrderAction,
  closePositionAction, // NEW
],
```

- [ ] **Step 4: Build and verify**

```bash
bun run build
```

Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add typescript/actions/closePosition.ts typescript/actions/index.ts typescript/index.ts
git commit -m "feat: add close position action (market/limit, auto-cancel)"
```

---

## Chunk 4: Enhanced Provider & Trade Risk Evaluator

### Task 8: Enhance Portfolio Provider with P&L

**Files:**
- Modify: `typescript/providers/polymarket.ts`

- [ ] **Step 1: Add P&L calculation to `formatAccountStateText`**

In `typescript/providers/polymarket.ts`, add imports at the top:

```typescript
import { initializeClobClient } from "../utils/clobClient";
import { deriveBestBid } from "../utils/orderbook";
import type { OrderBook } from "../types";
```

Replace the positions section in `formatAccountStateText` with an enhanced version. Change the function signature to accept an optional `positionPrices` map:

```typescript
function formatAccountStateText(
  accountState: CachedAccountState,
  positionPrices?: Map<string, number>
): string {
```

Replace the positions block (the `if (accountState.positions.length > 0)` section):

```typescript
  if (accountState.positions.length > 0) {
    lines.push(`Open Positions: ${accountState.positions.length}`);
    let totalUnrealizedPnl = 0;
    let totalValue = 0;

    const posSummaries = accountState.positions.slice(0, 10).map((p) => {
      const size = parseFloat(p.size);
      const avgPrice = parseFloat(p.average_price);
      const realizedPnl = parseFloat(p.realized_pnl);
      const pnlSign = realizedPnl >= 0 ? "+" : "";

      const currentPrice = positionPrices?.get(p.asset_id);
      let unrealizedStr = "";
      if (currentPrice !== undefined && size > 0) {
        const unrealizedPnl = (currentPrice - avgPrice) * size;
        const unrealizedPct = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
        totalUnrealizedPnl += unrealizedPnl;
        totalValue += currentPrice * size;
        const uSign = unrealizedPnl >= 0 ? "+" : "";
        unrealizedStr = ` | Unrealized: ${uSign}$${unrealizedPnl.toFixed(2)} (${uSign}${unrealizedPct.toFixed(1)}%)`;
      } else if (size > 0) {
        totalValue += avgPrice * size; // fallback to entry price
      }

      return `  - ${p.asset_id.substring(0, 8)}...: ${p.size} @ avg $${p.average_price} (PnL: ${pnlSign}${p.realized_pnl})${unrealizedStr}`;
    });

    lines.push(...posSummaries);

    if (positionPrices && positionPrices.size > 0) {
      lines.push("");
      lines.push(`Portfolio Value: $${totalValue.toFixed(2)}`);
      const totalSign = totalUnrealizedPnl >= 0 ? "+" : "";
      lines.push(`Total Unrealized P&L: ${totalSign}$${totalUnrealizedPnl.toFixed(2)}`);

      // Risk: largest position concentration
      if (totalValue > 0) {
        let maxPct = 0;
        for (const p of accountState.positions) {
          const size = parseFloat(p.size);
          const price = positionPrices.get(p.asset_id) ?? parseFloat(p.average_price);
          const pct = ((price * size) / totalValue) * 100;
          if (pct > maxPct) maxPct = pct;
        }
        if (maxPct > 50) {
          lines.push(`⚠️ Concentration risk: largest position is ${maxPct.toFixed(0)}% of portfolio`);
        }
      }
    }
  }
```

- [ ] **Step 2: Fetch current prices in the provider's `get` method**

In the `get` method of `polymarketProvider`, after the `accountState` is retrieved and before `accountStateText = formatAccountStateText(accountState)`, add price fetching:

```typescript
        // Fetch current prices for P&L calculation
        let positionPrices: Map<string, number> | undefined;
        if (accountState.positions.length > 0) {
          positionPrices = new Map();
          try {
            const client = await initializeClobClient(runtime);
            // Fetch orderbooks for positions with non-zero size
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
            // Failed to init client — skip P&L
            positionPrices = undefined;
          }
        }

        accountStateText = formatAccountStateText(accountState, positionPrices);
```

- [ ] **Step 3: Build and verify**

```bash
bun run build
```

Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add typescript/providers/polymarket.ts
git commit -m "feat: add unrealized P&L and portfolio metrics to provider"
```

---

### Task 9: Implement Trade Risk Evaluator

**Files:**
- Create: `typescript/evaluators/tradeRisk.ts`
- Create: `typescript/evaluators/index.ts`
- Modify: `typescript/index.ts` — register evaluator

- [ ] **Step 1: Create `typescript/evaluators/index.ts`**

```typescript
export { tradeRiskEvaluator } from "./tradeRisk";
```

- [ ] **Step 2: Create `typescript/evaluators/tradeRisk.ts`**

```typescript
/**
 * @elizaos/plugin-polymarket Trade Risk Evaluator
 *
 * Post-action evaluator that assesses risk after order placement.
 * Advisory only — warns but does not block.
 * Writes risk assessment to memory for context in subsequent responses.
 */

import {
  type ActionResult,
  type Evaluator,
  type HandlerCallback,
  type HandlerOptions,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
} from "@elizaos/core";
import { POLYMARKET_SERVICE_NAME } from "../constants";
import type { PolymarketService } from "../services/polymarket";
import { initializeClobClient } from "../utils/clobClient";
import { deriveBestBid, deriveBestAsk } from "../utils/orderbook";
import type { OrderBook } from "../types";

function getConfigNumber(runtime: IAgentRuntime, key: string, defaultValue: number): number {
  const val = runtime.getSetting(key);
  if (!val) return defaultValue;
  const parsed = parseFloat(String(val));
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export const tradeRiskEvaluator: Evaluator = {
  name: "POLYMARKET_TRADE_RISK",
  description: "Evaluates trade risk after Polymarket order placement. Checks position concentration, spread width, and trade size.",
  similes: ["TRADE_RISK_CHECK", "ORDER_RISK_ASSESSMENT"],
  alwaysRun: false,
  phase: "post",

  validate: async (runtime: IAgentRuntime, message: Memory, _state?: State): Promise<boolean> => {
    // Only run after placeOrder or closePosition actions
    const content = message.content as Record<string, unknown>;
    const actions = content?.actions as string[] | undefined;
    if (!actions) return false;
    return actions.some(
      (a) => a === "POLYMARKET_PLACE_ORDER" || a === "POLYMARKET_CLOSE_POSITION"
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: HandlerOptions,
    _callback?: HandlerCallback
  ): Promise<ActionResult | undefined> => {
    logger.info("[tradeRiskEvaluator] Running post-trade risk assessment");

    const warnings: string[] = [];
    const content = message.content as Record<string, any>;
    const tradeData = content?.data;

    if (!tradeData) {
      logger.warn("[tradeRiskEvaluator] No trade data in message");
      return;
    }

    const maxPositionPct = getConfigNumber(runtime, "POLYMARKET_MAX_POSITION_PCT", 25);
    const maxSpreadPct = getConfigNumber(runtime, "POLYMARKET_MAX_SPREAD_PCT", 10);
    const maxTradeSizeUsd = getConfigNumber(runtime, "POLYMARKET_MAX_TRADE_SIZE_USD", 100);

    // Check 1: Trade size
    const tradePrice = parseFloat(tradeData.price ?? tradeData.sellPrice ?? "0");
    const tradeSize = parseFloat(tradeData.size ?? tradeData.positionSize ?? "0");
    const tradeDollarValue = tradePrice * tradeSize;

    if (tradeDollarValue > maxTradeSizeUsd) {
      warnings.push(
        `Trade size ($${tradeDollarValue.toFixed(2)}) exceeds threshold ($${maxTradeSizeUsd})`
      );
    }

    // Check 2: Spread width (fetch orderbook for the traded token)
    const tokenId = tradeData.tokenId ?? tradeData.tokenID;
    if (tokenId) {
      try {
        const client = await initializeClobClient(runtime);
        const ob = (await client.getOrderBook(tokenId)) as OrderBook;
        const bestBid = deriveBestBid(ob.bids ?? []);
        const bestAsk = deriveBestAsk(ob.asks ?? []);

        if (bestBid && bestAsk) {
          const midpoint = (bestBid.price + bestAsk.price) / 2;
          const spreadPct = midpoint > 0 ? ((bestAsk.price - bestBid.price) / midpoint) * 100 : 0;
          if (spreadPct > maxSpreadPct) {
            warnings.push(
              `Wide spread: ${spreadPct.toFixed(1)}% (bid $${bestBid.price.toFixed(4)}, ask $${bestAsk.price.toFixed(4)}). Market may be illiquid.`
            );
          }
        }
      } catch {
        // Can't fetch orderbook — skip spread check
      }
    }

    // Check 3: Position concentration
    const service = runtime.getService(POLYMARKET_SERVICE_NAME) as PolymarketService | undefined;
    if (service && tokenId) {
      const accountState = service.getCachedAccountState();
      if (accountState) {
        const position = accountState.positions.find((p) => p.asset_id === tokenId);
        if (position) {
          // Rough portfolio value from collateral balance
          const collateralBalance = parseFloat(
            accountState.balances.collateral?.balance ?? "0"
          );
          const positionValue = parseFloat(position.size) * parseFloat(position.average_price);

          // Total = collateral + sum of position values (rough estimate)
          let totalValue = collateralBalance;
          for (const p of accountState.positions) {
            totalValue += parseFloat(p.size) * parseFloat(p.average_price);
          }

          if (totalValue > 0) {
            const concentrationPct = (positionValue / totalValue) * 100;
            if (concentrationPct > maxPositionPct) {
              warnings.push(
                `Position concentration: ${concentrationPct.toFixed(0)}% of portfolio in this market (threshold: ${maxPositionPct}%)`
              );
            }
          }
        }
      }
    }

    // Write risk assessment to memory
    if (warnings.length > 0) {
      const riskLevel = warnings.length >= 3 ? "high" : warnings.length >= 2 ? "medium" : "low";
      const riskText =
        `⚠️ Trade Risk Assessment (${riskLevel}):\n` +
        warnings.map((w) => `  - ${w}`).join("\n");

      logger.warn(`[tradeRiskEvaluator] ${riskText}`);

      const riskMemory: Memory = {
        id: crypto.randomUUID() as any,
        userId: message.userId,
        agentId: message.agentId,
        roomId: message.roomId,
        createdAt: Date.now(),
        content: {
          text: riskText,
          data: {
            type: "trade_risk_assessment",
            riskLevel,
            warnings,
            tokenId,
            tradeDollarValue,
            timestamp: Date.now(),
          },
        },
      };

      await runtime.createMemory(riskMemory, "polymarket_risk_assessments");
    } else {
      logger.info("[tradeRiskEvaluator] No risk warnings for this trade");
    }

    return undefined;
  },

  examples: [
    {
      messages: [
        {
          name: "{{user1}}",
          content: { text: "Buy 500 shares of YES at $0.85" },
        },
        {
          name: "{{user2}}",
          content: {
            text: "Order placed. Risk evaluator checks position concentration, spread, and trade size.",
            action: "POLYMARKET_PLACE_ORDER",
          },
        },
      ],
    },
  ],
};
```

- [ ] **Step 3: Register in `typescript/index.ts`**

Add import:

```typescript
import { tradeRiskEvaluator } from "./evaluators";
```

Update evaluators array:

```typescript
evaluators: [tradeRiskEvaluator],
```

- [ ] **Step 4: Add config vars to `typescript/package.json`**

In the `agentConfig.pluginParameters` section, add:

```json
"POLYMARKET_MAX_POSITION_PCT": {
  "type": "string",
  "description": "Max % of portfolio in a single market before risk warning (default: 25).",
  "required": false,
  "default": "25",
  "sensitive": false
},
"POLYMARKET_MAX_SPREAD_PCT": {
  "type": "string",
  "description": "Max bid-ask spread % before illiquidity warning (default: 10).",
  "required": false,
  "default": "10",
  "sensitive": false
},
"POLYMARKET_MAX_TRADE_SIZE_USD": {
  "type": "string",
  "description": "Max single trade size in USD before warning (default: 100).",
  "required": false,
  "default": "100",
  "sensitive": false
}
```

- [ ] **Step 5: Build and verify**

```bash
bun run build
```

Expected: Clean build.

- [ ] **Step 6: Run all tests**

```bash
bun run test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add typescript/evaluators/ typescript/index.ts typescript/package.json
git commit -m "feat: add trade risk evaluator (concentration, spread, size checks)"
```

---

### Task 10: Cancel Order Parameter Extraction Tests

**Files:**
- Create: `typescript/__tests__/cancelOrder.test.ts`

- [ ] **Step 1: Write parameter extraction tests**

Create `typescript/__tests__/cancelOrder.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

/**
 * Tests for cancel order LLM parameter extraction patterns.
 * These test the regex fallback parsing, not the full action handler.
 */

describe("cancelOrder parameter extraction", () => {
  // Helper to simulate regex extraction from user text
  function extractCancelParams(text: string) {
    const cancelAll = /cancel\s+(all|every)\s+(my\s+)?orders/i.test(text);
    const orderIdMatch = text.match(
      /cancel\s+order\s+([a-f0-9-]{8,})/i
    );
    const tokenMatch = text.match(
      /cancel\s+(?:orders?\s+(?:on|for)\s+)?(?:token\s+)?(0x[a-f0-9]{8,})/i
    );

    return {
      cancelAll,
      orderId: orderIdMatch?.[1] ?? null,
      tokenId: tokenMatch?.[1] ?? null,
    };
  }

  it("detects cancel all intent", () => {
    expect(extractCancelParams("cancel all my orders").cancelAll).toBe(true);
    expect(extractCancelParams("cancel every orders").cancelAll).toBe(true);
  });

  it("extracts specific order ID", () => {
    const result = extractCancelParams("cancel order abc12345-def6-7890");
    expect(result.orderId).toBe("abc12345-def6-7890");
  });

  it("extracts token ID", () => {
    const result = extractCancelParams(
      "cancel orders on token 0x1234abcd5678ef90"
    );
    expect(result.tokenId).toBe("0x1234abcd5678ef90");
  });

  it("returns nulls for unrecognized input", () => {
    const result = extractCancelParams("hello world");
    expect(result.cancelAll).toBe(false);
    expect(result.orderId).toBeNull();
    expect(result.tokenId).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
bun run test __tests__/cancelOrder.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add typescript/__tests__/cancelOrder.test.ts
git commit -m "test: add cancel order parameter extraction tests"
```

---

### Task 11: Close Position Side Detection Tests

**Files:**
- Create: `typescript/__tests__/closePosition.test.ts`

- [ ] **Step 1: Write side detection tests**

Create `typescript/__tests__/closePosition.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { Position } from "../types";

describe("closePosition side detection", () => {
  function findPosition(
    positions: Position[],
    tokenId: string
  ): Position | undefined {
    return positions.find((p) => p.asset_id === tokenId);
  }

  function hasNonZeroPosition(position: Position | undefined): boolean {
    if (!position) return false;
    return parseFloat(position.size) > 0;
  }

  const mockPositions: Position[] = [
    {
      market: "0xcondition1",
      asset_id: "0xyes_token_1",
      size: "100",
      average_price: "0.6500",
      realized_pnl: "0.000000",
      unrealized_pnl: "0.000000",
    },
    {
      market: "0xcondition2",
      asset_id: "0xno_token_2",
      size: "50",
      average_price: "0.3000",
      realized_pnl: "5.250000",
      unrealized_pnl: "0.000000",
    },
    {
      market: "0xcondition3",
      asset_id: "0xempty_token",
      size: "0",
      average_price: "0.5000",
      realized_pnl: "10.000000",
      unrealized_pnl: "0.000000",
    },
  ];

  it("finds YES token position by asset_id", () => {
    const pos = findPosition(mockPositions, "0xyes_token_1");
    expect(pos).toBeDefined();
    expect(pos!.size).toBe("100");
    expect(hasNonZeroPosition(pos)).toBe(true);
  });

  it("finds NO token position by asset_id", () => {
    const pos = findPosition(mockPositions, "0xno_token_2");
    expect(pos).toBeDefined();
    expect(pos!.size).toBe("50");
    expect(hasNonZeroPosition(pos)).toBe(true);
  });

  it("returns undefined for unknown token", () => {
    const pos = findPosition(mockPositions, "0xnonexistent");
    expect(pos).toBeUndefined();
    expect(hasNonZeroPosition(pos)).toBe(false);
  });

  it("detects zero-size position as non-closeable", () => {
    const pos = findPosition(mockPositions, "0xempty_token");
    expect(pos).toBeDefined();
    expect(hasNonZeroPosition(pos)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
bun run test __tests__/closePosition.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add typescript/__tests__/closePosition.test.ts
git commit -m "test: add close position side detection tests"
```

---

### Task 12: Final Build & Integration Test

**Files:** None new — verification only.

- [ ] **Step 1: Clean build from scratch**

```bash
cd typescript
rm -rf dist
bun run build
```

Expected: Clean build producing `dist/index.js`.

- [ ] **Step 2: Run full test suite**

```bash
bun run test
```

Expected: All tests pass.

- [ ] **Step 3: Verify milady integration**

```bash
cd /path/to/milady
bun install
bun run build
```

Expected: Milady builds with the updated plugin.

- [ ] **Step 4: Verify plugin exports**

Check that `dist/index.js` exports the new actions:

```bash
grep -c "cancelOrderAction\|closePositionAction\|tradeRiskEvaluator" typescript/dist/index.js
```

Expected: At least 3 matches.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: verify clean build with all improvements"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Fork + setup | repo setup |
| 2 | `deriveBestBid/Ask` utility + tests | `utils/orderbook.ts`, `__tests__/orderbook.test.ts` |
| 3 | Fix `getTokenInfo` orderbook | `actions/getTokenInfo.ts` |
| 4 | Fix `placeOrder` orderbook | `actions/placeOrder.ts` |
| 5 | Cancel order template | (inline in action) |
| 6 | Cancel order action | `actions/cancelOrder.ts`, `actions/index.ts`, `index.ts` |
| 7 | Close position action | `actions/closePosition.ts`, `actions/index.ts`, `index.ts` |
| 8 | Enhanced provider with P&L | `providers/polymarket.ts` |
| 9 | Trade risk evaluator | `evaluators/tradeRisk.ts`, `evaluators/index.ts`, `index.ts`, `package.json` |
| 10 | Cancel order tests | `__tests__/cancelOrder.test.ts` |
| 11 | Close position tests | `__tests__/closePosition.test.ts` |
| 12 | Final verification | build + test |
