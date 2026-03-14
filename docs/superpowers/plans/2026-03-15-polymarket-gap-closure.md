# Polymarket API Gap Closure — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 10 most impactful gaps between the Polymarket plugin and the official Polymarket API surface — adding rewards/earnings tracking, direct portfolio querying actions, rate limiting, and multi-outcome market support.

**Architecture:** New actions follow the existing codebase patterns (CLOB client calls, activity recording, callback responses). Actions that need parameter extraction use LLM templates (inline — the generated prompts pipeline is reserved for actions with complex extraction needs). Simple actions like `getPositions` skip LLM extraction since they have no user-variable parameters. Rate limiting wraps the Gamma API fetch layer. No changes to the plugin registration shape — only additions. Reward types are imported from `@polymarket/clob-client` where available; no custom type definitions for shapes the SDK already exports.

**Tech Stack:** TypeScript, ElizaOS core (`@elizaos/core`), `@polymarket/clob-client`, Vitest, Bun

**Prior plans:**
- `docs/superpowers/plans/2026-03-13-plugin-polymarket-improvements.md` (cancel, close, evaluator, P&L)
- `docs/superpowers/plans/2026-03-15-polymarket-api-alignment.md` (correctness fixes, Data API, batch endpoints)

---

## File Map

| File | Responsibility | Changes |
|------|---------------|---------|
| **New:** `src/plugins/polymarket/utils/rateLimiter.ts` | Token-bucket rate limiter for Gamma API | New file |
| **New:** `src/plugins/polymarket/utils/gammaApi.ts` | Centralized Gamma API client with rate limiting | New file |
| **New:** `src/plugins/polymarket/actions/getRewards.ts` | Action: track LP rewards & earnings | New file |
| **New:** `src/plugins/polymarket/actions/getPositions.ts` | Action: query positions & portfolio value | New file |
| **New:** `src/plugins/polymarket/actions/getTradeHistory.ts` | Action: query trade history on demand | New file |
| **New:** `src/plugins/polymarket/actions/getBalance.ts` | Action: check USDC + conditional token balances | New file |
| `src/plugins/polymarket/types.ts` | Type definitions | Add reward/earnings types, multi-outcome token array |
| `src/plugins/polymarket/constants.ts` | Config constants | Add rate limit constants |
| `src/plugins/polymarket/templates.ts` | LLM prompt templates | Re-export new templates |
| `src/plugins/polymarket/services/polymarket.ts` | Core service | Add rewards cache methods |
| `src/plugins/polymarket/actions/index.ts` | Action barrel exports | Register new actions |
| `src/plugins/polymarket/actions/placeOrder.ts` | Order placement | Handle multi-outcome token selection |
| `src/plugins/polymarket/actions/getTokenInfo.ts` | Token info | Handle multi-outcome markets |
| `src/plugins/polymarket/index.ts` | Plugin registration | Register new actions |
| **New:** `src/plugins/polymarket/__tests__/rateLimiter.test.ts` | Rate limiter tests | New file |
| **New:** `src/plugins/polymarket/__tests__/gammaApi.test.ts` | Gamma API client tests | New file |
| **New:** `src/plugins/polymarket/__tests__/getRewards.test.ts` | Rewards action tests | New file |
| **New:** `src/plugins/polymarket/__tests__/getPositions.test.ts` | Positions action tests | New file |
| **New:** `src/plugins/polymarket/__tests__/getTradeHistory.test.ts` | Trade history action tests | New file |
| **New:** `src/plugins/polymarket/__tests__/getBalance.test.ts` | Balance action tests | New file |

---

## Chunk 1: Rate Limiter for Gamma API

The Gamma API has strict rate limits (4,000 req/10s general, 500 req/10s for `/events`, 300 req/10s for `/markets`, 350 req/10s for `/public-search`). The plugin currently has zero rate-limiting protection. An aggressive agent will get blocked.

### Task 1: Create token-bucket rate limiter utility

**Files:**
- Create: `src/plugins/polymarket/utils/rateLimiter.ts`
- Create: `src/plugins/polymarket/__tests__/rateLimiter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/plugins/polymarket/__tests__/rateLimiter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TokenBucketRateLimiter } from "../utils/rateLimiter";

describe("TokenBucketRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("should allow requests within limit", async () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 5, refillRate: 1, refillIntervalMs: 1000 });
    for (let i = 0; i < 5; i++) {
      const allowed = limiter.tryConsume();
      expect(allowed).toBe(true);
    }
  });

  it("should reject requests over limit", () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 2, refillRate: 1, refillIntervalMs: 1000 });
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);
  });

  it("should refill tokens over time", () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 2, refillRate: 2, refillIntervalMs: 1000 });
    limiter.tryConsume();
    limiter.tryConsume();
    expect(limiter.tryConsume()).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(limiter.tryConsume()).toBe(true);
  });

  it("should wait for token availability", async () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 1, refillRate: 1, refillIntervalMs: 100 });
    limiter.tryConsume();

    const waitPromise = limiter.waitForToken();
    vi.advanceTimersByTime(100);
    await waitPromise;
    expect(limiter.tryConsume()).toBe(false); // waitForToken consumed the token
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pleasures/Desktop/Untitled && npx vitest run src/plugins/polymarket/__tests__/rateLimiter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

Create `src/plugins/polymarket/utils/rateLimiter.ts`:

```typescript
export interface RateLimiterConfig {
  /** Maximum tokens in the bucket */
  maxTokens: number;
  /** Tokens to add per refill */
  refillRate: number;
  /** Milliseconds between refills */
  refillIntervalMs: number;
}

export class TokenBucketRateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private readonly refillIntervalMs: number;
  private lastRefillTime: number;

  constructor(config: RateLimiterConfig) {
    this.maxTokens = config.maxTokens;
    this.refillRate = config.refillRate;
    this.refillIntervalMs = config.refillIntervalMs;
    this.tokens = config.maxTokens;
    this.lastRefillTime = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    const tokensToAdd = Math.floor(elapsed / this.refillIntervalMs) * this.refillRate;
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefillTime = now;
    }
  }

  tryConsume(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  async waitForToken(maxRetries = 10): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (this.tryConsume()) return;
      const elapsed = Date.now() - this.lastRefillTime;
      const waitMs = Math.max(10, this.refillIntervalMs - elapsed);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    // Force consume after max retries — caller should handle degraded state
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }

  get availableTokens(): number {
    this.refill();
    return this.tokens;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pleasures/Desktop/Untitled && npx vitest run src/plugins/polymarket/__tests__/rateLimiter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/polymarket/utils/rateLimiter.ts src/plugins/polymarket/__tests__/rateLimiter.test.ts
git commit -m "feat(polymarket): add token-bucket rate limiter utility"
```

### Task 2: Create centralized Gamma API client with rate limiting

**Files:**
- Create: `src/plugins/polymarket/utils/gammaApi.ts`
- Create: `src/plugins/polymarket/__tests__/gammaApi.test.ts`
- Modify: `src/plugins/polymarket/constants.ts`

- [ ] **Step 1: Add rate limit constants**

Add to `src/plugins/polymarket/constants.ts`:

```typescript
// Gamma API Rate Limits (per 10-second window)
export const GAMMA_RATE_LIMIT_GENERAL = 4000;
export const GAMMA_RATE_LIMIT_EVENTS = 500;
export const GAMMA_RATE_LIMIT_MARKETS = 300;
export const GAMMA_RATE_LIMIT_SEARCH = 350;
export const GAMMA_RATE_LIMIT_WINDOW_MS = 10_000;
```

- [ ] **Step 2: Write the failing test**

Create `src/plugins/polymarket/__tests__/gammaApi.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { GammaApiClient } from "../utils/gammaApi";

function createMockRuntime(responseData: unknown, ok = true) {
  return {
    fetch: vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 429,
      json: vi.fn().mockResolvedValue(responseData),
      text: vi.fn().mockResolvedValue(JSON.stringify(responseData)),
      headers: new Headers({ "retry-after": "1" }),
    }),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  } as unknown as Parameters<typeof GammaApiClient.prototype.search>[0];
}

describe("GammaApiClient", () => {
  it("should search markets via /public-search", async () => {
    const mockResults = [{ id: 1, question: "Will BTC hit 100k?" }];
    const runtime = createMockRuntime(mockResults);
    const client = new GammaApiClient();

    const results = await client.search(runtime, "bitcoin");
    expect(results).toEqual(mockResults);
    expect(runtime.fetch).toHaveBeenCalledWith(
      expect.stringContaining("gamma-api.polymarket.com/public-search?q=bitcoin")
    );
  });

  it("should fetch events by tag", async () => {
    const mockEvents = [{ id: 1, title: "NBA Finals" }];
    const runtime = createMockRuntime(mockEvents);
    const client = new GammaApiClient();

    const results = await client.getEventsByTag(runtime, "sports", { limit: 10 });
    expect(results).toEqual(mockEvents);
  });

  it("should fetch tags list", async () => {
    const mockTags = [{ id: "1", label: "Sports" }];
    const runtime = createMockRuntime(mockTags);
    const client = new GammaApiClient();

    const results = await client.getTags(runtime);
    expect(results).toEqual(mockTags);
  });

  it("should fetch sports market types", async () => {
    const mockTypes = { marketTypes: ["moneyline", "spread", "total"] };
    const runtime = createMockRuntime(mockTypes);
    const client = new GammaApiClient();

    const results = await client.getSportsMarketTypes(runtime);
    expect(results).toEqual(mockTypes);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/pleasures/Desktop/Untitled && npx vitest run src/plugins/polymarket/__tests__/gammaApi.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Write the Gamma API client**

Create `src/plugins/polymarket/utils/gammaApi.ts`:

```typescript
import type { IAgentRuntime } from "@elizaos/core";
import {
  GAMMA_API_URL,
  GAMMA_RATE_LIMIT_EVENTS,
  GAMMA_RATE_LIMIT_GENERAL,
  GAMMA_RATE_LIMIT_MARKETS,
  GAMMA_RATE_LIMIT_SEARCH,
  GAMMA_RATE_LIMIT_WINDOW_MS,
} from "../constants";
import { TokenBucketRateLimiter } from "./rateLimiter";

export class GammaApiClient {
  private readonly generalLimiter: TokenBucketRateLimiter;
  private readonly eventsLimiter: TokenBucketRateLimiter;
  private readonly marketsLimiter: TokenBucketRateLimiter;
  private readonly searchLimiter: TokenBucketRateLimiter;

  constructor() {
    const windowMs = GAMMA_RATE_LIMIT_WINDOW_MS;
    // Use 80% of limit as safety margin
    this.generalLimiter = new TokenBucketRateLimiter({
      maxTokens: Math.floor(GAMMA_RATE_LIMIT_GENERAL * 0.8),
      refillRate: Math.floor(GAMMA_RATE_LIMIT_GENERAL * 0.8),
      refillIntervalMs: windowMs,
    });
    this.eventsLimiter = new TokenBucketRateLimiter({
      maxTokens: Math.floor(GAMMA_RATE_LIMIT_EVENTS * 0.8),
      refillRate: Math.floor(GAMMA_RATE_LIMIT_EVENTS * 0.8),
      refillIntervalMs: windowMs,
    });
    this.marketsLimiter = new TokenBucketRateLimiter({
      maxTokens: Math.floor(GAMMA_RATE_LIMIT_MARKETS * 0.8),
      refillRate: Math.floor(GAMMA_RATE_LIMIT_MARKETS * 0.8),
      refillIntervalMs: windowMs,
    });
    this.searchLimiter = new TokenBucketRateLimiter({
      maxTokens: Math.floor(GAMMA_RATE_LIMIT_SEARCH * 0.8),
      refillRate: Math.floor(GAMMA_RATE_LIMIT_SEARCH * 0.8),
      refillIntervalMs: windowMs,
    });
  }

  private async rateLimitedFetch(
    runtime: IAgentRuntime,
    url: string,
    limiter: TokenBucketRateLimiter,
    retriesLeft = 3
  ): Promise<unknown> {
    await this.generalLimiter.waitForToken();
    await limiter.waitForToken();

    const doFetch = runtime.fetch ?? globalThis.fetch;
    const response = await doFetch(url);

    if (response.status === 429) {
      if (retriesLeft <= 0) {
        throw new Error(`Gamma API rate limited after max retries: ${url}`);
      }
      runtime.logger.warn(`[gammaApi] Rate limited on ${url}, retries left: ${retriesLeft}`);
      await new Promise((r) => setTimeout(r, 2000));
      return this.rateLimitedFetch(runtime, url, limiter, retriesLeft - 1);
    }

    if (!response.ok) {
      throw new Error(`Gamma API error ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }

  async search(runtime: IAgentRuntime, query: string, limitPerType = 10): Promise<unknown> {
    const url = `${GAMMA_API_URL}/public-search?q=${encodeURIComponent(query)}&limit_per_type=${limitPerType}`;
    return this.rateLimitedFetch(runtime, url, this.searchLimiter);
  }

  async getEventsByTag(
    runtime: IAgentRuntime,
    tagId: string,
    options?: { limit?: number; order?: string; ascending?: boolean }
  ): Promise<unknown> {
    const params = new URLSearchParams({
      tag_id: tagId,
      closed: "false",
      active: "true",
      limit: String(options?.limit ?? 20),
      order: options?.order ?? "volume",
      ascending: String(options?.ascending ?? false),
    });
    const url = `${GAMMA_API_URL}/events?${params.toString()}`;
    return this.rateLimitedFetch(runtime, url, this.eventsLimiter);
  }

  async getTags(runtime: IAgentRuntime): Promise<unknown> {
    const url = `${GAMMA_API_URL}/tags`;
    return this.rateLimitedFetch(runtime, url, this.generalLimiter);
  }

  async getMarketById(runtime: IAgentRuntime, id: string): Promise<unknown> {
    const url = `${GAMMA_API_URL}/markets/${id}`;
    return this.rateLimitedFetch(runtime, url, this.marketsLimiter);
  }

  async getSportsMarketTypes(runtime: IAgentRuntime): Promise<unknown> {
    const url = `${GAMMA_API_URL}/sports/market-types`;
    return this.rateLimitedFetch(runtime, url, this.generalLimiter);
  }

  async getPublicProfile(runtime: IAgentRuntime, address: string): Promise<unknown> {
    const url = `${GAMMA_API_URL}/public-profile?address=${address}`;
    return this.rateLimitedFetch(runtime, url, this.generalLimiter);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/pleasures/Desktop/Untitled && npx vitest run src/plugins/polymarket/__tests__/gammaApi.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/plugins/polymarket/utils/gammaApi.ts src/plugins/polymarket/__tests__/gammaApi.test.ts src/plugins/polymarket/constants.ts
git commit -m "feat(polymarket): add centralized Gamma API client with rate limiting"
```

---

## Chunk 2: Rewards & Earnings Action (P0 Gap)

The CLOB client exposes `getEarningsForUserForDay`, `getTotalEarningsForUserForDay`, `getRewardPercentages`, `getCurrentRewards`, `getRawRewardsForMarket`, `getUserEarningsAndMarketsConfig`. None are used. An LP agent cannot track its profitability.

### Task 3: Add reward/earnings types

**Files:**
- Modify: `src/plugins/polymarket/types.ts`

- [ ] **Step 1: Add rewards activity type to types.ts**

NOTE: Reward/earnings response types (`UserEarning`, `TotalUserEarning`, `MarketReward`, `RewardsPercentages`) are already exported from `@polymarket/clob-client`. Do NOT redefine them. Only add the activity tracking type.

Append to the end of `src/plugins/polymarket/types.ts` (before the Activity section):

```typescript
// =============================================================================
// Rewards Activity Type (response types are from @polymarket/clob-client)
// =============================================================================

/**
 * Activity data for rewards viewing
 */
export interface RewardsActivityData {
  type: "rewards_earnings";
  date: string;
  totalEarnings: string;
  marketCount: number;
}
```

- [ ] **Step 2: Update ActivityType and ActivityData unions**

In `types.ts`, update the `ActivityType` union to include `"rewards_earnings"` and add `RewardsActivityData` to the `ActivityData` union:

```typescript
export type ActivityType =
  | "markets_list"
  | "market_details"
  | "order_details"
  | "price_history"
  | "trade_history"
  | "order_scoring"
  | "rewards_earnings";

export type ActivityData =
  | MarketsActivityData
  | MarketDetailsActivityData
  | OrderDetailsActivityData
  | PriceHistoryActivityData
  | TradeHistoryActivityData
  | OrderScoringActivityData
  | RewardsActivityData;
```

- [ ] **Step 3: Commit**

```bash
git add src/plugins/polymarket/types.ts
git commit -m "feat(polymarket): add rewards and earnings type definitions"
```

### Task 4: Create getRewards action

**Files:**
- Create: `src/plugins/polymarket/actions/getRewards.ts`
- Create: `src/plugins/polymarket/__tests__/getRewards.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/plugins/polymarket/__tests__/getRewards.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getRewardsAction } from "../actions/getRewards";

describe("getRewardsAction", () => {
  it("should have correct action name", () => {
    expect(getRewardsAction.name).toBe("POLYMARKET_GET_REWARDS");
  });

  it("should have similes for reward-related queries", () => {
    expect(getRewardsAction.similes).toContain("POLYMARKET_LP_EARNINGS");
    expect(getRewardsAction.similes).toContain("POLYMARKET_REWARD_STATUS");
  });

  it("should have examples", () => {
    expect(getRewardsAction.examples.length).toBeGreaterThan(0);
  });

  it("should require API credentials in validate", async () => {
    const mockRuntime = {
      getSetting: (key: string) => {
        if (key === "CLOB_API_URL") return "https://clob.polymarket.com";
        return undefined;
      },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };
    const mockMessage = { content: { text: "show my rewards" } };
    const result = await getRewardsAction.validate(mockRuntime as any, mockMessage as any);
    expect(result).toBe(false); // No private key
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pleasures/Desktop/Untitled && npx vitest run src/plugins/polymarket/__tests__/getRewards.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the getRewards action**

Create `src/plugins/polymarket/actions/getRewards.ts`:

```typescript
import {
  type Action,
  type ActionResult,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import type { ClobClient } from "@polymarket/clob-client";
import { DEFAULT_CLOB_API_URL, POLYMARKET_SERVICE_NAME } from "../constants";
import type { PolymarketService } from "../services/polymarket";
import type { RewardsActivityData } from "../types";
import { initializeClobClientWithCreds } from "../utils/clobClient";
import { callLLMWithTimeout } from "../utils/llmHelpers";

interface LLMRewardsResult {
  date?: string;
  marketId?: string;
  mode?: "daily" | "total" | "current_markets" | "market_rewards";
  error?: string;
}

const getRewardsTemplate = `You are an assistant extracting reward/earnings query parameters from a user message.

Determine what the user wants:
- "daily" — earnings for a specific day (default: today)
- "total" — total earnings for a day
- "current_markets" — which markets currently offer rewards
- "market_rewards" — raw rewards for a specific market (needs marketId/conditionId)

Respond with JSON only:
{
  "date": "YYYY-MM-DD or null",
  "marketId": "condition_id or null",
  "mode": "daily|total|current_markets|market_rewards",
  "error": "error message or null"
}

Recent conversation:
{{recentMessages}}

User's current request:
{{currentMessage}}`;

export const getRewardsAction: Action = {
  name: "POLYMARKET_GET_REWARDS",
  similes: [
    "POLYMARKET_LP_EARNINGS",
    "POLYMARKET_REWARD_STATUS",
    "POLYMARKET_LIQUIDITY_REWARDS",
    "POLYMARKET_CHECK_EARNINGS",
    "POLYMARKET_MY_REWARDS",
    "POLYMARKET_REWARD_MARKETS",
  ],
  description:
    "Retrieves LP rewards and earnings data from Polymarket. Can show daily earnings, total earnings, current reward markets, or raw rewards for a specific market. Requires CLOB API credentials.",

  validate: async (runtime: IAgentRuntime, message: Memory, _state?: State): Promise<boolean> => {
    const clobApiUrl = runtime.getSetting("CLOB_API_URL") || DEFAULT_CLOB_API_URL;
    const privateKey =
      runtime.getSetting("WALLET_PRIVATE_KEY") ||
      runtime.getSetting("PRIVATE_KEY") ||
      runtime.getSetting("POLYMARKET_PRIVATE_KEY");

    if (!clobApiUrl || !privateKey) {
      runtime.logger.warn("[getRewardsAction] Missing CLOB_API_URL or private key");
      return false;
    }

    const clobApiKey = runtime.getSetting("CLOB_API_KEY");
    const clobApiSecret = runtime.getSetting("CLOB_API_SECRET") || runtime.getSetting("CLOB_SECRET");
    const clobApiPassphrase =
      runtime.getSetting("CLOB_API_PASSPHRASE") || runtime.getSetting("CLOB_PASS_PHRASE");

    if (!clobApiKey || !clobApiSecret || !clobApiPassphrase) {
      runtime.logger.warn("[getRewardsAction] Missing CLOB API credentials for L2 auth");
      return false;
    }

    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    runtime.logger.info("[getRewardsAction] Handler called");

    let llmResult: LLMRewardsResult = { mode: "daily" };
    try {
      const result = await callLLMWithTimeout<LLMRewardsResult>(
        runtime,
        state,
        getRewardsTemplate,
        "getRewardsAction"
      );
      if (result) llmResult = result;
    } catch {
      runtime.logger.warn("[getRewardsAction] LLM extraction failed, defaulting to daily mode");
    }

    const mode = llmResult.mode || "daily";
    const date = llmResult.date || new Date().toISOString().split("T")[0];

    try {
      const client = (await initializeClobClientWithCreds(runtime)) as ClobClient;
      let responseText = "";

      switch (mode) {
        case "daily": {
          const earnings = await client.getEarningsForUserForDay(date);
          responseText = `📊 **LP Earnings for ${date}**:\n\n`;
          if (earnings && typeof earnings === "object") {
            responseText += `\`\`\`json\n${JSON.stringify(earnings, null, 2)}\n\`\`\``;
          } else {
            responseText += "No earnings data found for this date.";
          }
          break;
        }

        case "total": {
          const total = await client.getTotalEarningsForUserForDay(date);
          responseText = `💰 **Total Earnings for ${date}**: ${JSON.stringify(total)}`;
          break;
        }

        case "current_markets": {
          const currentRewards = await client.getCurrentRewards();
          responseText = `🎯 **Current Reward Markets**:\n\n`;
          if (Array.isArray(currentRewards) && currentRewards.length > 0) {
            for (const market of currentRewards.slice(0, 20)) {
              const m = market as Record<string, unknown>;
              responseText += `  • ${m.condition_id ?? "unknown"}\n`;
            }
            if (currentRewards.length > 20) {
              responseText += `  ... and ${currentRewards.length - 20} more\n`;
            }
          } else {
            responseText += "No reward markets found.";
          }
          break;
        }

        case "market_rewards": {
          if (!llmResult.marketId) {
            const errorMsg = "Please specify a market condition ID to check rewards.";
            if (callback) await callback({ text: `❌ ${errorMsg}`, actions: ["GET_REWARDS"] });
            return { success: false, text: errorMsg, error: errorMsg };
          }
          const marketRewards = await client.getRawRewardsForMarket(llmResult.marketId);
          responseText = `📈 **Rewards for Market ${llmResult.marketId.substring(0, 16)}...**:\n\n`;
          responseText += `\`\`\`json\n${JSON.stringify(marketRewards, null, 2)}\n\`\`\``;
          break;
        }
      }

      if (callback) await callback({ text: responseText, actions: ["GET_REWARDS"] });

      // Record activity
      const service = runtime.getService(POLYMARKET_SERVICE_NAME) as PolymarketService | undefined;
      if (service) {
        const activityData: RewardsActivityData = {
          type: "rewards_earnings",
          date,
          totalEarnings: "fetched",
          marketCount: 0,
        };
        await service.recordActivity(activityData);
      }

      return { success: true, text: responseText };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      runtime.logger.error(`[getRewardsAction] Error: ${errorMsg}`);
      if (callback) {
        await callback({
          text: `❌ **Error fetching rewards**: ${errorMsg}`,
          actions: ["GET_REWARDS"],
        });
      }
      return { success: false, text: `Error: ${errorMsg}`, error: errorMsg };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "How much did I earn in LP rewards today?" },
      },
      {
        name: "{{user2}}",
        content: {
          text: "Let me check your daily LP earnings.",
          action: "POLYMARKET_GET_REWARDS",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Which markets are currently offering liquidity rewards?" },
      },
      {
        name: "{{user2}}",
        content: {
          text: "I'll fetch the current reward markets for you.",
          action: "POLYMARKET_GET_REWARDS",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Show me reward rates for market 0x5f651..." },
      },
      {
        name: "{{user2}}",
        content: {
          text: "Checking reward data for that market.",
          action: "POLYMARKET_GET_REWARDS",
        },
      },
    ],
  ],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pleasures/Desktop/Untitled && npx vitest run src/plugins/polymarket/__tests__/getRewards.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/polymarket/actions/getRewards.ts src/plugins/polymarket/__tests__/getRewards.test.ts
git commit -m "feat(polymarket): add LP rewards and earnings action"
```

---

## Chunk 3: Direct Portfolio Query Actions (P1 Gap)

Users currently can't directly query "show my positions" or "show my trades" — they must rely on the provider's auto-context which may be stale (30-min TTL). These need dedicated, on-demand actions.

### Task 5: Create getPositions action

**Files:**
- Create: `src/plugins/polymarket/actions/getPositions.ts`
- Create: `src/plugins/polymarket/__tests__/getPositions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/plugins/polymarket/__tests__/getPositions.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getPositionsAction } from "../actions/getPositions";

describe("getPositionsAction", () => {
  it("should have correct action name", () => {
    expect(getPositionsAction.name).toBe("POLYMARKET_GET_POSITIONS");
  });

  it("should have position-related similes", () => {
    expect(getPositionsAction.similes).toContain("POLYMARKET_MY_POSITIONS");
    expect(getPositionsAction.similes).toContain("POLYMARKET_PORTFOLIO");
  });

  it("should require a private key in validate", async () => {
    const mockRuntime = {
      getSetting: () => undefined,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await getPositionsAction.validate(mockRuntime as any, {} as any);
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pleasures/Desktop/Untitled && npx vitest run src/plugins/polymarket/__tests__/getPositions.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the getPositions action**

Create `src/plugins/polymarket/actions/getPositions.ts`:

```typescript
import {
  type Action,
  type ActionResult,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import { POLYMARKET_SERVICE_NAME } from "../constants";
import type { PolymarketService } from "../services/polymarket";
import type { DataApiPosition, MarketsActivityData } from "../types";
import { getWalletAddress } from "../utils/clobClient";
import { fetchUserPositions, fetchUserTotalValue } from "../utils/dataApi";

export const getPositionsAction: Action = {
  name: "POLYMARKET_GET_POSITIONS",
  similes: [
    "POLYMARKET_MY_POSITIONS",
    "POLYMARKET_PORTFOLIO",
    "POLYMARKET_SHOW_POSITIONS",
    "POLYMARKET_POSITION_STATUS",
    "POLYMARKET_HOLDINGS",
  ],
  description:
    "Fetches current Polymarket positions and portfolio value on demand from the Data API. Use when the user explicitly asks about their positions, portfolio, or holdings. Does NOT require CLOB API credentials — only a wallet address.",

  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    const privateKey =
      runtime.getSetting("WALLET_PRIVATE_KEY") ||
      runtime.getSetting("PRIVATE_KEY") ||
      runtime.getSetting("POLYMARKET_PRIVATE_KEY");
    if (!privateKey) {
      runtime.logger.warn("[getPositionsAction] No private key configured");
      return false;
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    runtime.logger.info("[getPositionsAction] Handler called");

    try {
      const walletAddress = getWalletAddress(runtime);

      // Fetch positions and total value in parallel
      const [positions, totalValue] = await Promise.all([
        fetchUserPositions(runtime, walletAddress),
        fetchUserTotalValue(runtime, walletAddress),
      ]);

      let responseText = `📊 **Polymarket Portfolio** (${walletAddress.substring(0, 8)}...)\n\n`;
      responseText += `💰 **Total Value**: $${totalValue.toFixed(2)}\n\n`;

      if (positions.length === 0) {
        responseText += "No open positions found.";
      } else {
        responseText += `**Open Positions** (${positions.length}):\n\n`;
        for (const pos of positions) {
          const pnlSign = pos.cashPnl >= 0 ? "+" : "";
          const pctSign = pos.percentPnl >= 0 ? "+" : "";
          responseText += `  • **${pos.title}** (${pos.outcome})\n`;
          responseText += `    Size: ${pos.size} @ avg $${pos.avgPrice.toFixed(4)} | Current: $${pos.curPrice.toFixed(4)}\n`;
          responseText += `    P&L: ${pnlSign}$${pos.cashPnl.toFixed(2)} (${pctSign}${pos.percentPnl.toFixed(1)}%)\n\n`;
        }
      }

      if (callback) await callback({ text: responseText, actions: ["GET_POSITIONS"] });

      // Record activity for context continuity
      const service = runtime.getService(POLYMARKET_SERVICE_NAME) as PolymarketService | undefined;
      if (service && positions.length > 0) {
        const activityData: MarketsActivityData = {
          type: "markets_list",
          mode: "standard",
          count: positions.length,
          markets: positions.slice(0, 5).map((p) => ({
            conditionId: p.conditionId,
            question: p.title,
            active: true,
            closed: false,
          })),
        };
        await service.recordActivity(activityData);
      }

      return {
        success: true,
        text: responseText,
        data: {
          positionCount: positions.length,
          totalValue,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      runtime.logger.error(`[getPositionsAction] Error: ${errorMsg}`);
      if (callback) {
        await callback({
          text: `❌ **Error fetching positions**: ${errorMsg}`,
          actions: ["GET_POSITIONS"],
        });
      }
      return { success: false, text: `Error: ${errorMsg}`, error: errorMsg };
    }
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "Show me my current Polymarket positions" } },
      {
        name: "{{user2}}",
        content: { text: "Fetching your portfolio from the Data API.", action: "POLYMARKET_GET_POSITIONS" },
      },
    ],
    [
      { name: "{{user1}}", content: { text: "What's my portfolio value?" } },
      {
        name: "{{user2}}",
        content: { text: "Let me check your current positions and total value.", action: "POLYMARKET_GET_POSITIONS" },
      },
    ],
  ],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pleasures/Desktop/Untitled && npx vitest run src/plugins/polymarket/__tests__/getPositions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/polymarket/actions/getPositions.ts src/plugins/polymarket/__tests__/getPositions.test.ts
git commit -m "feat(polymarket): add on-demand positions and portfolio action"
```

### Task 6: Create getTradeHistory action

**Files:**
- Create: `src/plugins/polymarket/actions/getTradeHistory.ts`
- Create: `src/plugins/polymarket/__tests__/getTradeHistory.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/plugins/polymarket/__tests__/getTradeHistory.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getTradeHistoryAction } from "../actions/getTradeHistory";

describe("getTradeHistoryAction", () => {
  it("should have correct action name", () => {
    expect(getTradeHistoryAction.name).toBe("POLYMARKET_GET_TRADE_HISTORY");
  });

  it("should have trade-related similes", () => {
    expect(getTradeHistoryAction.similes).toContain("POLYMARKET_MY_TRADES");
    expect(getTradeHistoryAction.similes).toContain("POLYMARKET_TRADE_LOG");
  });

  it("should require a private key", async () => {
    const mockRuntime = {
      getSetting: () => undefined,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await getTradeHistoryAction.validate(mockRuntime as any, {} as any);
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pleasures/Desktop/Untitled && npx vitest run src/plugins/polymarket/__tests__/getTradeHistory.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the getTradeHistory action**

Create `src/plugins/polymarket/actions/getTradeHistory.ts`:

```typescript
import {
  type Action,
  type ActionResult,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import { POLYMARKET_SERVICE_NAME } from "../constants";
import type { PolymarketService } from "../services/polymarket";
import type { DataApiTrade, TradeHistoryActivityData } from "../types";
import { getWalletAddress } from "../utils/clobClient";
import { fetchUserTrades } from "../utils/dataApi";
import { callLLMWithTimeout } from "../utils/llmHelpers";

interface LLMTradeHistoryResult {
  limit?: number;
  market?: string;
  error?: string;
}

const getTradeHistoryTemplate = `You are an assistant extracting trade history query parameters from a user message.

Determine:
- limit: number of trades to show (default 20, max 100)
- market: condition_id if user asks about a specific market (null otherwise)

Respond with JSON only:
{
  "limit": 20,
  "market": "condition_id or null",
  "error": "error message or null"
}

Recent conversation:
{{recentMessages}}

User's current request:
{{currentMessage}}`;

export const getTradeHistoryAction: Action = {
  name: "POLYMARKET_GET_TRADE_HISTORY",
  similes: [
    "POLYMARKET_MY_TRADES",
    "POLYMARKET_TRADE_LOG",
    "POLYMARKET_RECENT_TRADES",
    "POLYMARKET_SHOW_TRADES",
    "POLYMARKET_TRADING_HISTORY",
  ],
  description:
    "Fetches recent trade history from the Polymarket Data API. Can filter by market. Use when user asks about their trades, trade history, or recent fills.",

  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    const privateKey =
      runtime.getSetting("WALLET_PRIVATE_KEY") ||
      runtime.getSetting("PRIVATE_KEY") ||
      runtime.getSetting("POLYMARKET_PRIVATE_KEY");
    if (!privateKey) {
      runtime.logger.warn("[getTradeHistoryAction] No private key configured");
      return false;
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    runtime.logger.info("[getTradeHistoryAction] Handler called");

    let llmResult: LLMTradeHistoryResult = {};
    try {
      const result = await callLLMWithTimeout<LLMTradeHistoryResult>(
        runtime,
        state,
        getTradeHistoryTemplate,
        "getTradeHistoryAction"
      );
      if (result) llmResult = result;
    } catch {
      runtime.logger.warn("[getTradeHistoryAction] LLM extraction failed, using defaults");
    }

    const limit = Math.min(llmResult.limit ?? 20, 100);

    try {
      const walletAddress = getWalletAddress(runtime);
      const trades = await fetchUserTrades(runtime, walletAddress, {
        limit,
        market: llmResult.market ?? undefined,
      });

      let responseText = `📜 **Trade History** (${walletAddress.substring(0, 8)}...)\n\n`;

      if (trades.length === 0) {
        responseText += "No trades found.";
      } else {
        responseText += `Showing ${trades.length} most recent trade(s):\n\n`;
        for (const trade of trades) {
          const date = new Date(trade.timestamp * 1000).toISOString().split("T")[0];
          responseText += `  • **${trade.title}** (${trade.outcome})\n`;
          responseText += `    ${trade.side} ${trade.size} @ $${trade.price.toFixed(4)} — ${date}\n`;
          if (trade.transactionHash) {
            responseText += `    Tx: ${trade.transactionHash.substring(0, 16)}...\n`;
          }
          responseText += "\n";
        }
      }

      if (callback) await callback({ text: responseText, actions: ["GET_TRADE_HISTORY"] });

      // Record activity
      const service = runtime.getService(POLYMARKET_SERVICE_NAME) as PolymarketService | undefined;
      if (service && trades.length > 0) {
        const activityData: TradeHistoryActivityData = {
          type: "trade_history",
          totalTrades: trades.length,
          recentTrades: trades.slice(0, 5).map((t) => ({
            tradeId: t.transactionHash ?? "",
            side: t.side,
            price: String(t.price),
            size: String(t.size),
            market: t.conditionId,
          })),
          filterMarket: llmResult.market ?? undefined,
        };
        await service.recordActivity(activityData);
      }

      return {
        success: true,
        text: responseText,
        data: { tradeCount: trades.length, timestamp: new Date().toISOString() },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      runtime.logger.error(`[getTradeHistoryAction] Error: ${errorMsg}`);
      if (callback) {
        await callback({
          text: `❌ **Error fetching trade history**: ${errorMsg}`,
          actions: ["GET_TRADE_HISTORY"],
        });
      }
      return { success: false, text: `Error: ${errorMsg}`, error: errorMsg };
    }
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "Show me my recent Polymarket trades" } },
      {
        name: "{{user2}}",
        content: { text: "Fetching your trade history.", action: "POLYMARKET_GET_TRADE_HISTORY" },
      },
    ],
    [
      { name: "{{user1}}", content: { text: "What trades have I made on the Bitcoin market?" } },
      {
        name: "{{user2}}",
        content: { text: "Let me pull your trades filtered by that market.", action: "POLYMARKET_GET_TRADE_HISTORY" },
      },
    ],
  ],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pleasures/Desktop/Untitled && npx vitest run src/plugins/polymarket/__tests__/getTradeHistory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/polymarket/actions/getTradeHistory.ts src/plugins/polymarket/__tests__/getTradeHistory.test.ts
git commit -m "feat(polymarket): add on-demand trade history action"
```

### Task 7: Create getBalance action

**Files:**
- Create: `src/plugins/polymarket/actions/getBalance.ts`
- Create: `src/plugins/polymarket/__tests__/getBalance.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/plugins/polymarket/__tests__/getBalance.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getBalanceAction } from "../actions/getBalance";

describe("getBalanceAction", () => {
  it("should have correct action name", () => {
    expect(getBalanceAction.name).toBe("POLYMARKET_GET_BALANCE");
  });

  it("should have balance-related similes", () => {
    expect(getBalanceAction.similes).toContain("POLYMARKET_CHECK_BALANCE");
    expect(getBalanceAction.similes).toContain("POLYMARKET_USDC_BALANCE");
  });

  it("should require API credentials", async () => {
    const mockRuntime = {
      getSetting: () => undefined,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await getBalanceAction.validate(mockRuntime as any, {} as any);
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pleasures/Desktop/Untitled && npx vitest run src/plugins/polymarket/__tests__/getBalance.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the getBalance action**

Create `src/plugins/polymarket/actions/getBalance.ts`:

```typescript
import {
  type Action,
  type ActionResult,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import { AssetType, type ClobClient } from "@polymarket/clob-client";
import { DEFAULT_CLOB_API_URL } from "../constants";
import { initializeClobClientWithCreds } from "../utils/clobClient";
import { callLLMWithTimeout } from "../utils/llmHelpers";

interface LLMBalanceResult {
  tokenId?: string;
  error?: string;
}

const getBalanceTemplate = `You are an assistant extracting balance query parameters from a user message.

If the user asks about a specific conditional token balance, extract the tokenId.
If they ask about USDC/collateral balance, leave tokenId null.

Respond with JSON only:
{
  "tokenId": "token_id or null",
  "error": "error message or null"
}

Recent conversation:
{{recentMessages}}

User's current request:
{{currentMessage}}`;

export const getBalanceAction: Action = {
  name: "POLYMARKET_GET_BALANCE",
  similes: [
    "POLYMARKET_CHECK_BALANCE",
    "POLYMARKET_USDC_BALANCE",
    "POLYMARKET_TOKEN_BALANCE",
    "POLYMARKET_MY_BALANCE",
    "POLYMARKET_WALLET_BALANCE",
  ],
  description:
    "Checks USDC (collateral) balance and allowance, or conditional token balance for a specific token. Requires CLOB API credentials.",

  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    const privateKey =
      runtime.getSetting("WALLET_PRIVATE_KEY") ||
      runtime.getSetting("PRIVATE_KEY") ||
      runtime.getSetting("POLYMARKET_PRIVATE_KEY");
    if (!privateKey) {
      runtime.logger.warn("[getBalanceAction] No private key configured");
      return false;
    }

    const clobApiKey = runtime.getSetting("CLOB_API_KEY");
    const clobApiSecret = runtime.getSetting("CLOB_API_SECRET") || runtime.getSetting("CLOB_SECRET");
    const clobApiPassphrase =
      runtime.getSetting("CLOB_API_PASSPHRASE") || runtime.getSetting("CLOB_PASS_PHRASE");
    if (!clobApiKey || !clobApiSecret || !clobApiPassphrase) {
      runtime.logger.warn("[getBalanceAction] Missing CLOB API credentials");
      return false;
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    runtime.logger.info("[getBalanceAction] Handler called");

    let llmResult: LLMBalanceResult = {};
    try {
      const result = await callLLMWithTimeout<LLMBalanceResult>(
        runtime,
        state,
        getBalanceTemplate,
        "getBalanceAction"
      );
      if (result) llmResult = result;
    } catch {
      runtime.logger.warn("[getBalanceAction] LLM extraction failed, checking USDC balance");
    }

    try {
      const client = (await initializeClobClientWithCreds(runtime)) as ClobClient;
      let responseText = "💵 **Polymarket Balances**:\n\n";

      // Always fetch collateral balance
      const collateral = await client.getBalanceAllowance({
        asset_type: AssetType.COLLATERAL,
      });
      responseText += `**USDC (Collateral)**:\n`;
      responseText += `  Balance: $${collateral.balance}\n`;
      responseText += `  Allowance: $${collateral.allowance}\n\n`;

      // If a specific token was requested, fetch its balance too
      if (llmResult.tokenId) {
        const tokenBalance = await client.getBalanceAllowance({
          asset_type: AssetType.CONDITIONAL,
          token_id: llmResult.tokenId,
        });
        responseText += `**Token ${llmResult.tokenId.substring(0, 16)}...**:\n`;
        responseText += `  Balance: ${tokenBalance.balance}\n`;
        responseText += `  Allowance: ${tokenBalance.allowance}\n`;
      }

      if (callback) await callback({ text: responseText, actions: ["GET_BALANCE"] });

      return {
        success: true,
        text: responseText,
        data: {
          collateralBalance: collateral.balance,
          collateralAllowance: collateral.allowance,
          tokenId: llmResult.tokenId,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      runtime.logger.error(`[getBalanceAction] Error: ${errorMsg}`);
      if (callback) {
        await callback({
          text: `❌ **Error fetching balance**: ${errorMsg}`,
          actions: ["GET_BALANCE"],
        });
      }
      return { success: false, text: `Error: ${errorMsg}`, error: errorMsg };
    }
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "What's my USDC balance on Polymarket?" } },
      {
        name: "{{user2}}",
        content: { text: "Checking your collateral balance.", action: "POLYMARKET_GET_BALANCE" },
      },
    ],
    [
      { name: "{{user1}}", content: { text: "How many YES tokens do I have for that market?" } },
      {
        name: "{{user2}}",
        content: { text: "Let me check your conditional token balance.", action: "POLYMARKET_GET_BALANCE" },
      },
    ],
  ],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pleasures/Desktop/Untitled && npx vitest run src/plugins/polymarket/__tests__/getBalance.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/polymarket/actions/getBalance.ts src/plugins/polymarket/__tests__/getBalance.test.ts
git commit -m "feat(polymarket): add on-demand balance check action"
```

---

## Chunk 4: Plugin Registration & Multi-Outcome Support

### Task 8: Register all new actions in the plugin

**Files:**
- Modify: `src/plugins/polymarket/actions/index.ts`
- Modify: `src/plugins/polymarket/index.ts`

- [ ] **Step 1: Update action barrel exports**

In `src/plugins/polymarket/actions/index.ts`, add:

```typescript
export { getRewardsAction } from "./getRewards";
export { getPositionsAction } from "./getPositions";
export { getTradeHistoryAction } from "./getTradeHistory";
export { getBalanceAction } from "./getBalance";
```

- [ ] **Step 2: Register new actions in plugin index**

In `src/plugins/polymarket/index.ts`, add imports:

```typescript
import {
  cancelOrderAction,
  checkOrderScoringAction,
  closePositionAction,
  getBalanceAction,
  getOrderBookDepthAction,
  getOrderDetailsAction,
  getPositionsAction,
  getRewardsAction,
  getTokenInfoAction,
  getTradeHistoryAction,
  placeOrderAction,
  researchMarketAction,
  retrieveAllMarketsAction,
} from "./actions";
```

And add to the actions array:

```typescript
actions: [
  retrieveAllMarketsAction,
  getTokenInfoAction,
  getOrderBookDepthAction,
  placeOrderAction,
  getOrderDetailsAction,
  checkOrderScoringAction,
  researchMarketAction,
  cancelOrderAction,
  closePositionAction,
  // New actions — portfolio & rewards
  getRewardsAction,
  getPositionsAction,
  getTradeHistoryAction,
  getBalanceAction,
],
```

Also add to exports (single statement):

```typescript
export { getRewardsAction, getPositionsAction, getTradeHistoryAction, getBalanceAction } from "./actions";
```

- [ ] **Step 3: Run full test suite**

Run: `cd /Users/pleasures/Desktop/Untitled && npx vitest run src/plugins/polymarket/__tests__/`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/plugins/polymarket/actions/index.ts src/plugins/polymarket/index.ts
git commit -m "feat(polymarket): register rewards, positions, trades, balance actions"
```

### Task 9: Support multi-outcome markets in token types

Currently `Market.tokens` is typed as `[Token, Token]` — a fixed 2-tuple for binary markets. Polymarket supports multi-outcome markets with 3+ tokens.

**Files:**
- Modify: `src/plugins/polymarket/types.ts:15-38`

- [ ] **Step 1: Widen the token tuple type**

In `types.ts`, change the `Market` interface's `tokens` field:

```typescript
// Before:
tokens: [Token, Token];

// After:
tokens: Token[];
```

Also update `SimplifiedMarket`:

```typescript
// Before:
tokens: [Token, Token];

// After:
tokens: Token[];
```

- [ ] **Step 2: Search for hardcoded binary assumptions**

Run: `cd /Users/pleasures/Desktop/Untitled && grep -rn "tokens\[0\]\|tokens\[1\]\|\.tokens\[" src/plugins/polymarket/ --include="*.ts"`

Review each occurrence. For any that index `[0]` or `[1]` directly without bounds checking, add a guard:

```typescript
// Before:
const yesToken = market.tokens[0];
const noToken = market.tokens[1];

// After:
const yesToken = market.tokens.find(t => t.outcome === "Yes") ?? market.tokens[0];
const noToken = market.tokens.find(t => t.outcome === "No") ?? market.tokens[1];
```

For multi-outcome markets, the action should list all outcomes and let the user pick.

- [ ] **Step 3: Run tests to verify nothing breaks**

Run: `cd /Users/pleasures/Desktop/Untitled && npx vitest run src/plugins/polymarket/__tests__/`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/plugins/polymarket/types.ts src/plugins/polymarket/actions/
git commit -m "feat(polymarket): support multi-outcome markets in token types"
```

---

## Chunk 5: Update existing getMarkets action to use rate-limited Gamma client

### Task 10: Migrate getMarkets to use GammaApiClient

Currently `getMarkets.ts` calls the Gamma API directly with `fetch()`. This should use the rate-limited `GammaApiClient`.

**Files:**
- Modify: `src/plugins/polymarket/actions/getMarkets.ts`

- [ ] **Step 1: Read the existing getMarkets.ts**

Read the full file to understand current fetch patterns.

- [ ] **Step 2: Replace direct fetch calls with GammaApiClient**

Import the client and replace each direct `fetch()` to `gamma-api.polymarket.com` with the corresponding `GammaApiClient` method. The client is instantiated once per action handler invocation:

```typescript
import { GammaApiClient } from "../utils/gammaApi";

// In the handler:
const gammaClient = new GammaApiClient();
// Replace: const response = await doFetch(`${GAMMA_API_URL}/public-search?q=...`);
// With:    const results = await gammaClient.search(runtime, query);
```

- [ ] **Step 3: Run existing tests**

Run: `cd /Users/pleasures/Desktop/Untitled && npx vitest run src/plugins/polymarket/__tests__/`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/plugins/polymarket/actions/getMarkets.ts
git commit -m "refactor(polymarket): use rate-limited Gamma API client in getMarkets"
```

---

## Chunk 6: Activity Context Update for New Action Types

### Task 11: Update provider to format new activity types

The provider's `formatActivityCursor` function handles the switch on `data.type`. It needs a case for `"rewards_earnings"`.

**Files:**
- Modify: `src/plugins/polymarket/providers/polymarket.ts`

- [ ] **Step 1: Add rewards case to formatActivityCursor**

In the `switch (data.type)` block in `formatActivityCursor`, add:

```typescript
case "rewards_earnings": {
  const rewardsData = data as RewardsActivityData;
  return `Checked LP rewards/earnings ${timeAgo}\n  Date: ${rewardsData.date}\n  Total: ${rewardsData.totalEarnings}`;
}
```

And add `RewardsActivityData` to the imports from `"../types"`.

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/pleasures/Desktop/Untitled && npx vitest run src/plugins/polymarket/__tests__/`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/plugins/polymarket/providers/polymarket.ts
git commit -m "feat(polymarket): update provider to display rewards activity context"
```

---

## Summary of What This Plan Closes

| Gap | Solution | Priority |
|-----|----------|----------|
| **Rewards & Earnings** | `getRewardsAction` — daily/total/market-specific via CLOB client methods | P0 |
| **Rate Limiting** | `TokenBucketRateLimiter` + `GammaApiClient` wrapping all Gamma calls | P0 |
| **Direct Position Query** | `getPositionsAction` — on-demand Data API fetch | P1 |
| **Direct Trade History** | `getTradeHistoryAction` — on-demand Data API fetch | P1 |
| **Balance Management** | `getBalanceAction` — USDC + conditional token via CLOB client | P1 |
| **Multi-Outcome Markets** | Widened `tokens: Token[]` type + outcome-based lookup | P1 |
| **Gamma API Centralization** | All Gamma calls through rate-limited client | P0 |

### Not in this plan (future work)

| Gap | Reason deferred |
|-----|----------------|
| **WebSocket streaming** | Requires architectural changes (event loop, subscription manager). Separate plan. |
| **Rebates endpoints** | Low urgency; needs more API research to understand response shapes. |
| **Notifications** | Requires WebSocket user stream — blocked by WebSocket work. |
| **Sports/Series/Comments** | Low priority discovery features. Separate plan. |
| **Builder trades** | Only relevant for builder role. Niche. |
| **Research persistence** | Needs database integration. Separate plan. |
| **`deferExec` / `GTD` expiration** | Incremental enhancement to placeOrder. Can be a single PR. |
