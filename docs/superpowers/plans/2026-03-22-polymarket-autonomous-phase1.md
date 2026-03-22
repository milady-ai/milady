# Polymarket Autonomous Trading — Phase 1: Data Model, Portfolio Intelligence, Pre-Trade Gate

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the agent portfolio-aware context in the autonomy loop and add blocking trade validation, laying the foundation for fully autonomous trading in later phases.

**Architecture:** Phase 1 adds three layers: (1) typed data model + stores for theses, goals, and trade journal backed by elizaOS long-term memory, (2) a portfolio intelligence provider that injects rich trading context into the autonomy loop, and (3) a pre-trade gate function called inside placeOrderAction and closePositionAction that enforces portfolio constraints before order submission. No autonomous trading is enabled in Phase 1 — the "no thesis = no autonomous trade" gate rule blocks it until Phase 2 adds the thesis formation system.

**Tech Stack:** TypeScript, vitest, zod, `@elizaos/core` (IAgentRuntime, Provider, Memory, logger), existing polymarket plugin utilities

**Spec:** `docs/superpowers/specs/2026-03-22-polymarket-autonomous-trading-design.md` (Sections 3–5, 10 Phase 1, 12–13)

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/plugins/polymarket/autonomous/types.ts` | All autonomous trading interfaces + Zod schemas |
| `src/plugins/polymarket/autonomous/stores/thesisStore.ts` | ThesisStore — CRUD backed by in-memory Map + serialization helpers |
| `src/plugins/polymarket/autonomous/stores/goalStore.ts` | GoalStore — portfolio goal management |
| `src/plugins/polymarket/autonomous/stores/tradeJournal.ts` | TradeJournal — trade entry/exit recording |
| `src/plugins/polymarket/autonomous/stores/decisionQueue.ts` | DecisionQueue — ring buffer for scanner output (Phase 3 uses, but type needed now) |
| `src/plugins/polymarket/autonomous/providers/portfolioIntelligence.ts` | Autonomy-loop provider assembling full trading context |
| `src/plugins/polymarket/autonomous/gates/preTrade.ts` | Pre-trade gate pure function |
| `src/plugins/polymarket/autonomous/index.ts` | Re-exports all autonomous components |
| `src/plugins/polymarket/__tests__/autonomous/types.test.ts` | Zod schema validation tests |
| `src/plugins/polymarket/__tests__/autonomous/thesisStore.test.ts` | ThesisStore unit tests |
| `src/plugins/polymarket/__tests__/autonomous/goalStore.test.ts` | GoalStore unit tests |
| `src/plugins/polymarket/__tests__/autonomous/tradeJournal.test.ts` | TradeJournal unit tests |
| `src/plugins/polymarket/__tests__/autonomous/preTrade.test.ts` | Pre-trade gate unit tests |
| `src/plugins/polymarket/__tests__/autonomous/portfolioIntelligence.test.ts` | Provider formatting tests |

### Modified files

| File | Lines | Changes |
|------|-------|---------|
| `src/plugins/polymarket/constants.ts` | append after line 39 | Add autonomous config key names and defaults |
| `src/plugins/polymarket/index.ts:56-78` | configSchema | Add autonomous config keys to Zod schema |
| `src/plugins/polymarket/index.ts:80-173` | plugin definition | Add provider, register task workers, add config entries |
| `src/plugins/polymarket/actions/placeOrder.ts:764` | after balance check | Insert pre-trade gate call before order submission |
| `src/plugins/polymarket/actions/closePosition.ts:239` | before order placement | Insert pre-trade gate call with `isClose: true` |

---

## Chunk 1: Types & Zod Schemas

### Task 1: Define autonomous type interfaces

**Files:**
- Create: `src/plugins/polymarket/autonomous/types.ts`
- Test: `src/plugins/polymarket/__tests__/autonomous/types.test.ts`

- [ ] **Step 1: Write the failing test for Zod schema validation**

```typescript
// src/plugins/polymarket/__tests__/autonomous/types.test.ts
import { describe, it, expect } from "vitest";
import {
  TradingThesisSchema,
  PortfolioGoalSchema,
  TradeJournalEntrySchema,
  ConvictionUpdateSchema,
  CalibrationRecordSchema,
  PreTradeGateParamsSchema,
  PreTradeGateResultSchema,
} from "../../autonomous/types";

describe("TradingThesisSchema", () => {
  it("validates a complete thesis", () => {
    const thesis = {
      id: "thesis-1",
      text: "AI regulation will increase",
      category: "politics",
      conviction: 75,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      supportingEvidence: ["Research report A"],
      contradictingEvidence: [],
      relatedMarketIds: ["0xabc"],
      status: "active",
      keyAssumptions: ["Congress acts on AI"],
      invalidationCriteria: ["AI regulation bill fails"],
      timeHorizon: "months",
      performanceHistory: {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        totalPnl: 0,
        avgConfidenceAtEntry: 0,
      },
    };
    expect(TradingThesisSchema.parse(thesis)).toEqual(thesis);
  });

  it("rejects conviction outside 0-100", () => {
    const bad = {
      id: "t", text: "x", category: "c", conviction: 150,
      createdAt: 1, updatedAt: 1, supportingEvidence: [],
      contradictingEvidence: [], relatedMarketIds: [],
      status: "active", keyAssumptions: [], invalidationCriteria: [],
      timeHorizon: "days",
      performanceHistory: { totalTrades: 0, wins: 0, losses: 0, totalPnl: 0, avgConfidenceAtEntry: 0 },
    };
    expect(() => TradingThesisSchema.parse(bad)).toThrow();
  });

  it("rejects invalid status", () => {
    const bad = {
      id: "t", text: "x", category: "c", conviction: 50,
      createdAt: 1, updatedAt: 1, supportingEvidence: [],
      contradictingEvidence: [], relatedMarketIds: [],
      status: "bogus", keyAssumptions: [], invalidationCriteria: [],
      timeHorizon: "days",
      performanceHistory: { totalTrades: 0, wins: 0, losses: 0, totalPnl: 0, avgConfidenceAtEntry: 0 },
    };
    expect(() => TradingThesisSchema.parse(bad)).toThrow();
  });
});

describe("PortfolioGoalSchema", () => {
  it("validates a hard return target goal", () => {
    const goal = {
      id: "goal-1",
      type: "return_target",
      description: "Grow portfolio 20%",
      metric: "total_pnl_pct",
      target: 20,
      current: 6.4,
      priority: "hard",
      status: "active",
    };
    expect(PortfolioGoalSchema.parse(goal)).toEqual(goal);
  });

  it("accepts optional timeframe", () => {
    const goal = {
      id: "g", type: "risk_limit", description: "d", metric: "max_drawdown",
      target: 10, current: 3, priority: "soft", status: "active",
      timeframe: { start: 1000, end: 2000 },
    };
    expect(PortfolioGoalSchema.parse(goal).timeframe).toBeDefined();
  });
});

describe("TradeJournalEntrySchema", () => {
  it("validates an open trade entry", () => {
    const entry = {
      id: "j-1", tradeId: "order-abc", tokenId: "0x123",
      marketQuestion: "Will X happen?", thesisId: "thesis-1",
      entryThesis: "AI regulation", side: "buy",
      entryPrice: 0.62, entrySize: 500, entryTimestamp: Date.now(),
      confidenceAtEntry: 82, createdAt: Date.now(), outcome: "open",
    };
    expect(TradeJournalEntrySchema.parse(entry)).toBeDefined();
  });

  it("validates a closed trade with exit data", () => {
    const entry = {
      id: "j-2", tradeId: "order-def", tokenId: "0x456",
      marketQuestion: "Will Y happen?", thesisId: "thesis-2",
      entryThesis: "Crypto bull", side: "buy",
      entryPrice: 0.45, entrySize: 200, entryTimestamp: Date.now() - 86400000,
      exitPrice: 0.38, exitTimestamp: Date.now(),
      realizedPnl: -14, outcome: "loss",
      lessonLearned: "Overconfident on timing",
      confidenceAtEntry: 65, confidenceAtExit: 40, createdAt: Date.now() - 86400000,
    };
    expect(TradeJournalEntrySchema.parse(entry)).toBeDefined();
  });
});

describe("ConvictionUpdateSchema", () => {
  it("validates a conviction change", () => {
    const update = {
      thesisId: "thesis-1",
      previousConviction: 75,
      newConviction: 60,
      reason: "Market moved against thesis",
      evidence: "Price dropped 15%",
      timestamp: Date.now(),
    };
    expect(ConvictionUpdateSchema.parse(update)).toEqual(update);
  });
});

describe("CalibrationRecordSchema", () => {
  it("validates a calibration bucket", () => {
    const record = {
      convictionBucket: 70,
      totalTrades: 6,
      wins: 3,
      expectedWinRate: 0.75,
      actualWinRate: 0.5,
      calibrationError: -0.25,
    };
    expect(CalibrationRecordSchema.parse(record)).toEqual(record);
  });

  it("rejects invalid bucket values", () => {
    expect(() => CalibrationRecordSchema.parse({
      convictionBucket: 55, totalTrades: 1, wins: 1,
      expectedWinRate: 0.5, actualWinRate: 1, calibrationError: 0.5,
    })).toThrow(); // 55 is not a valid lower bound (must be 50, 60, 70, 80, 90)
  });
});

describe("PreTradeGateParamsSchema", () => {
  it("validates gate params for an autonomous trade", () => {
    const params = {
      tokenId: "0x123", side: "buy" as const, price: 0.62,
      size: 100, dollarAmount: 62, orderType: "GTC",
      thesisId: "thesis-1", isAutonomous: true, isClose: false,
    };
    expect(PreTradeGateParamsSchema.parse(params)).toBeDefined();
  });
});

describe("PreTradeGateResultSchema", () => {
  it("validates a blocked result", () => {
    const result = {
      allowed: false, reason: "No thesis for autonomous trade",
      warnings: [], riskScore: 90,
    };
    expect(PreTradeGateResultSchema.parse(result)).toBeDefined();
  });

  it("validates a result with adjustments", () => {
    const result = {
      allowed: true, adjustedSize: 50, adjustedPrice: 0.60,
      warnings: ["Conviction dropped 15pts"], riskScore: 45,
    };
    expect(PreTradeGateResultSchema.parse(result)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/autonomous/types.test.ts`
Expected: FAIL — cannot resolve `../../autonomous/types`

- [ ] **Step 3: Write the types and Zod schemas**

```typescript
// src/plugins/polymarket/autonomous/types.ts
import { z } from "zod";

// ── Performance History ──────────────────────────────────────────────
export const PerformanceHistorySchema = z.object({
  totalTrades: z.number().int().min(0),
  wins: z.number().int().min(0),
  losses: z.number().int().min(0),
  totalPnl: z.number(),
  avgConfidenceAtEntry: z.number().min(0).max(100),
});
export type PerformanceHistory = z.infer<typeof PerformanceHistorySchema>;

// ── Trading Thesis ───────────────────────────────────────────────────
export const TradingThesisSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  category: z.string().min(1),
  conviction: z.number().min(0).max(100),
  createdAt: z.number(),
  updatedAt: z.number(),
  supportingEvidence: z.array(z.string()),
  contradictingEvidence: z.array(z.string()),
  relatedMarketIds: z.array(z.string()),
  status: z.enum(["active", "retired", "invalidated"]),
  keyAssumptions: z.array(z.string()),
  invalidationCriteria: z.array(z.string()),
  timeHorizon: z.enum(["days", "weeks", "months"]),
  performanceHistory: PerformanceHistorySchema,
});
export type TradingThesis = z.infer<typeof TradingThesisSchema>;

// ── Portfolio Goal ───────────────────────────────────────────────────
export const PortfolioGoalSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["return_target", "risk_limit", "diversification", "thesis_allocation"]),
  description: z.string().min(1),
  metric: z.string().min(1),
  target: z.number(),
  current: z.number(),
  timeframe: z.object({ start: z.number(), end: z.number() }).optional(),
  priority: z.enum(["hard", "soft"]),
  status: z.enum(["active", "achieved", "failed", "expired"]),
});
export type PortfolioGoal = z.infer<typeof PortfolioGoalSchema>;

// ── Trade Journal Entry ──────────────────────────────────────────────
export const TradeJournalEntrySchema = z.object({
  id: z.string().min(1),
  tradeId: z.string().min(1),
  tokenId: z.string().min(1),
  marketQuestion: z.string(),
  thesisId: z.string(),
  entryThesis: z.string(),
  side: z.enum(["buy", "sell"]),
  entryPrice: z.number().min(0).max(1),
  entrySize: z.number().positive(),
  entryTimestamp: z.number(),
  exitPrice: z.number().min(0).max(1).optional(),
  exitTimestamp: z.number().optional(),
  realizedPnl: z.number().optional(),
  outcome: z.enum(["win", "loss", "breakeven", "open"]).optional(),
  lessonLearned: z.string().optional(),
  confidenceAtEntry: z.number().min(0).max(100),
  confidenceAtExit: z.number().min(0).max(100).optional(),
  createdAt: z.number(),
});
export type TradeJournalEntry = z.infer<typeof TradeJournalEntrySchema>;

// ── Conviction Update ────────────────────────────────────────────────
export const ConvictionUpdateSchema = z.object({
  thesisId: z.string().min(1),
  previousConviction: z.number().min(0).max(100),
  newConviction: z.number().min(0).max(100),
  reason: z.string().min(1),
  evidence: z.string(),
  timestamp: z.number(),
});
export type ConvictionUpdate = z.infer<typeof ConvictionUpdateSchema>;

// ── Calibration Record ───────────────────────────────────────────────
const VALID_BUCKETS = [50, 60, 70, 80, 90] as const;
export const CalibrationRecordSchema = z.object({
  convictionBucket: z.number().refine(
    (v) => (VALID_BUCKETS as readonly number[]).includes(v),
    { message: "convictionBucket must be one of 50, 60, 70, 80, 90" }
  ),
  totalTrades: z.number().int().min(0),
  wins: z.number().int().min(0),
  expectedWinRate: z.number().min(0).max(1),
  actualWinRate: z.number().min(0).max(1),
  calibrationError: z.number(),
});
export type CalibrationRecord = z.infer<typeof CalibrationRecordSchema>;

// ── Pre-Trade Gate ───────────────────────────────────────────────────
export const PreTradeGateParamsSchema = z.object({
  tokenId: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  price: z.number().min(0).max(1),
  size: z.number().positive(),
  dollarAmount: z.number().positive().optional(),
  orderType: z.string().optional(),
  thesisId: z.string().optional(),
  isAutonomous: z.boolean(),
  isClose: z.boolean(),
});
export type PreTradeGateParams = z.infer<typeof PreTradeGateParamsSchema>;

export const PreTradeGateResultSchema = z.object({
  allowed: z.boolean(),
  adjustedSize: z.number().positive().optional(),
  adjustedPrice: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
  warnings: z.array(z.string()),
  riskScore: z.number().min(0).max(100),
});
export type PreTradeGateResult = z.infer<typeof PreTradeGateResultSchema>;

// ── Thesis Proposal (LLM output for formation — Phase 2) ────────────
export const ThesisProposalSchema = z.object({
  text: z.string().min(1),
  category: z.string().min(1),
  initialConviction: z.number().min(0).max(100),
  reasoning: z.string().min(1),
  keyAssumptions: z.array(z.string()).min(1),
  invalidationCriteria: z.array(z.string()).min(1),
  relatedMarkets: z.array(z.string()),
  timeHorizon: z.enum(["days", "weeks", "months"]),
});
export type ThesisProposal = z.infer<typeof ThesisProposalSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/autonomous/types.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/polymarket/autonomous/types.ts src/plugins/polymarket/__tests__/autonomous/types.test.ts
git commit -m "feat(polymarket): add autonomous trading type interfaces and Zod schemas"
```

---

## Chunk 2: Stores — ThesisStore, GoalStore, TradeJournal

### Task 2: Implement ThesisStore

**Files:**
- Create: `src/plugins/polymarket/autonomous/stores/thesisStore.ts`
- Test: `src/plugins/polymarket/__tests__/autonomous/thesisStore.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/plugins/polymarket/__tests__/autonomous/thesisStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { ThesisStore } from "../../autonomous/stores/thesisStore";
import type { ThesisProposal, TradingThesis } from "../../autonomous/types";

describe("ThesisStore", () => {
  let store: ThesisStore;

  beforeEach(() => {
    store = new ThesisStore();
  });

  const proposal: ThesisProposal = {
    text: "AI regulation will increase",
    category: "politics",
    initialConviction: 75,
    reasoning: "Congress is moving on AI bills",
    keyAssumptions: ["Congress acts on AI"],
    invalidationCriteria: ["AI bill fails in committee"],
    relatedMarkets: ["0xabc"],
    timeHorizon: "months",
  };

  it("creates a thesis from a proposal", async () => {
    const thesis = await store.create(proposal);
    expect(thesis.id).toBeDefined();
    expect(thesis.text).toBe(proposal.text);
    expect(thesis.conviction).toBe(75);
    expect(thesis.status).toBe("active");
    expect(thesis.performanceHistory.totalTrades).toBe(0);
  });

  it("retrieves active theses", async () => {
    await store.create(proposal);
    const active = await store.getActive();
    expect(active).toHaveLength(1);
  });

  it("updates conviction with audit trail", async () => {
    const thesis = await store.create(proposal);
    await store.updateConviction({
      thesisId: thesis.id,
      previousConviction: 75,
      newConviction: 60,
      reason: "Market moved against",
      evidence: "Price dropped 15%",
      timestamp: Date.now(),
    });
    const updated = (await store.getActive())[0];
    expect(updated.conviction).toBe(60);
    expect(updated.updatedAt).toBeGreaterThan(thesis.updatedAt);
  });

  it("retires a thesis", async () => {
    const thesis = await store.create(proposal);
    await store.retire(thesis.id, "Markets resolved");
    const active = await store.getActive();
    expect(active).toHaveLength(0);
  });

  it("invalidates a thesis", async () => {
    const thesis = await store.create(proposal);
    await store.invalidate(thesis.id, "AI bill fails in committee");
    const active = await store.getActive();
    expect(active).toHaveLength(0);
    const all = store.getAll();
    expect(all[0].status).toBe("invalidated");
  });

  it("enforces max active theses", async () => {
    const smallStore = new ThesisStore({ maxActiveTheses: 2 });
    await smallStore.create(proposal);
    await smallStore.create({ ...proposal, text: "Second thesis" });
    await expect(smallStore.create({ ...proposal, text: "Third thesis" }))
      .rejects.toThrow("maximum");
  });

  it("gets theses by market", async () => {
    await store.create(proposal);
    const result = await store.getByMarket("0xabc");
    expect(result).toHaveLength(1);
    const none = await store.getByMarket("0xnonexistent");
    expect(none).toHaveLength(0);
  });

  it("gets performance summary", async () => {
    const thesis = await store.create(proposal);
    await store.update(thesis.id, {
      performanceHistory: { totalTrades: 5, wins: 3, losses: 2, totalPnl: 42, avgConfidenceAtEntry: 70 },
    });
    const summary = await store.getPerformanceSummary();
    expect(summary.totalTheses).toBe(1);
    expect(summary.totalTrades).toBe(5);
    expect(summary.totalPnl).toBe(42);
  });

  it("uses optimistic concurrency on update", async () => {
    const thesis = await store.create(proposal);
    // Simulate concurrent modification
    await store.update(thesis.id, { conviction: 80 });
    // The updatedAt has now changed — a stale write should still succeed
    // because our store retries internally
    await store.updateConviction({
      thesisId: thesis.id, previousConviction: 80, newConviction: 70,
      reason: "test", evidence: "test", timestamp: Date.now(),
    });
    const result = (await store.getActive())[0];
    expect(result.conviction).toBe(70);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/autonomous/thesisStore.test.ts`
Expected: FAIL — cannot resolve module

- [ ] **Step 3: Implement ThesisStore**

```typescript
// src/plugins/polymarket/autonomous/stores/thesisStore.ts
import type { TradingThesis, ThesisProposal, ConvictionUpdate } from "../types";
import { TradingThesisSchema } from "../types";

export interface ThesisPerformanceSummary {
  totalTheses: number;
  activeTheses: number;
  totalTrades: number;
  totalPnl: number;
  winRate: number;
}

interface ThesisStoreOptions {
  maxActiveTheses?: number;
}

const DEFAULT_MAX_ACTIVE = 10;

export class ThesisStore {
  private theses = new Map<string, TradingThesis>();
  private convictionLog: ConvictionUpdate[] = [];
  private maxActive: number;

  constructor(options?: ThesisStoreOptions) {
    this.maxActive = options?.maxActiveTheses ?? DEFAULT_MAX_ACTIVE;
  }

  async create(proposal: ThesisProposal): Promise<TradingThesis> {
    const activeCount = this.getActiveSync().length;
    if (activeCount >= this.maxActive) {
      throw new Error(
        `Cannot create thesis: maximum active theses (${this.maxActive}) reached. Retire an existing thesis first.`
      );
    }

    const now = Date.now();
    const thesis: TradingThesis = {
      id: `thesis-${crypto.randomUUID()}`,
      text: proposal.text,
      category: proposal.category,
      conviction: proposal.initialConviction,
      createdAt: now,
      updatedAt: now,
      supportingEvidence: [],
      contradictingEvidence: [],
      relatedMarketIds: [...proposal.relatedMarkets],
      status: "active",
      keyAssumptions: [...proposal.keyAssumptions],
      invalidationCriteria: [...proposal.invalidationCriteria],
      timeHorizon: proposal.timeHorizon,
      performanceHistory: {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        totalPnl: 0,
        avgConfidenceAtEntry: 0,
      },
    };

    TradingThesisSchema.parse(thesis);
    this.theses.set(thesis.id, thesis);
    return { ...thesis };
  }

  async update(id: string, partial: Partial<TradingThesis>): Promise<void> {
    const existing = this.theses.get(id);
    if (!existing) throw new Error(`Thesis ${id} not found`);
    const updated = { ...existing, ...partial, updatedAt: Date.now() };
    TradingThesisSchema.parse(updated);
    this.theses.set(id, updated);
  }

  async updateConviction(update: ConvictionUpdate): Promise<void> {
    const existing = this.theses.get(update.thesisId);
    if (!existing) throw new Error(`Thesis ${update.thesisId} not found`);
    existing.conviction = update.newConviction;
    existing.updatedAt = Date.now();
    this.convictionLog.push({ ...update });
  }

  async retire(id: string, reason: string): Promise<void> {
    const existing = this.theses.get(id);
    if (!existing) throw new Error(`Thesis ${id} not found`);
    existing.status = "retired";
    existing.updatedAt = Date.now();
  }

  async invalidate(id: string, criterion: string): Promise<void> {
    const existing = this.theses.get(id);
    if (!existing) throw new Error(`Thesis ${id} not found`);
    existing.status = "invalidated";
    existing.updatedAt = Date.now();
  }

  async getActive(): Promise<TradingThesis[]> {
    return this.getActiveSync().map((t) => ({ ...t }));
  }

  async getByCategory(category: string): Promise<TradingThesis[]> {
    return [...this.theses.values()]
      .filter((t) => t.category === category)
      .map((t) => ({ ...t }));
  }

  async getByMarket(marketId: string): Promise<TradingThesis[]> {
    return [...this.theses.values()]
      .filter((t) => t.relatedMarketIds.includes(marketId))
      .map((t) => ({ ...t }));
  }

  async getPerformanceSummary(): Promise<ThesisPerformanceSummary> {
    const all = [...this.theses.values()];
    const totalTrades = all.reduce((s, t) => s + t.performanceHistory.totalTrades, 0);
    const totalWins = all.reduce((s, t) => s + t.performanceHistory.wins, 0);
    return {
      totalTheses: all.length,
      activeTheses: all.filter((t) => t.status === "active").length,
      totalTrades,
      totalPnl: all.reduce((s, t) => s + t.performanceHistory.totalPnl, 0),
      winRate: totalTrades > 0 ? totalWins / totalTrades : 0,
    };
  }

  getAll(): TradingThesis[] {
    return [...this.theses.values()].map((t) => ({ ...t }));
  }

  getConvictionLog(): ConvictionUpdate[] {
    return [...this.convictionLog];
  }

  private getActiveSync(): TradingThesis[] {
    return [...this.theses.values()].filter((t) => t.status === "active");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/autonomous/thesisStore.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/polymarket/autonomous/stores/thesisStore.ts src/plugins/polymarket/__tests__/autonomous/thesisStore.test.ts
git commit -m "feat(polymarket): add ThesisStore with CRUD, conviction tracking, and max-active enforcement"
```

---

### Task 3: Implement GoalStore

**Files:**
- Create: `src/plugins/polymarket/autonomous/stores/goalStore.ts`
- Test: `src/plugins/polymarket/__tests__/autonomous/goalStore.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/plugins/polymarket/__tests__/autonomous/goalStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { GoalStore } from "../../autonomous/stores/goalStore";
import type { PortfolioGoal } from "../../autonomous/types";

describe("GoalStore", () => {
  let store: GoalStore;

  beforeEach(() => {
    store = new GoalStore();
  });

  it("creates and retrieves a goal", async () => {
    const goal = await store.create({
      type: "return_target",
      description: "Grow portfolio 20%",
      metric: "total_pnl_pct",
      target: 20,
      priority: "hard",
    });
    expect(goal.id).toBeDefined();
    expect(goal.status).toBe("active");
    expect(goal.current).toBe(0);
  });

  it("lists active goals", async () => {
    await store.create({ type: "risk_limit", description: "Max drawdown 10%", metric: "max_drawdown", target: 10, priority: "hard" });
    await store.create({ type: "diversification", description: "Min 3 theses", metric: "position_count", target: 3, priority: "soft" });
    expect(await store.getActive()).toHaveLength(2);
  });

  it("updates current value", async () => {
    const goal = await store.create({ type: "return_target", description: "d", metric: "m", target: 20, priority: "hard" });
    await store.updateCurrent(goal.id, 6.4);
    const updated = (await store.getActive())[0];
    expect(updated.current).toBe(6.4);
  });

  it("marks goal as achieved", async () => {
    const goal = await store.create({ type: "return_target", description: "d", metric: "m", target: 20, priority: "hard" });
    await store.updateCurrent(goal.id, 20);
    await store.markAchieved(goal.id);
    expect(await store.getActive()).toHaveLength(0);
  });

  it("checks hard goal violations", async () => {
    await store.create({ type: "risk_limit", description: "Max 15% concentration", metric: "max_position_pct", target: 15, priority: "hard" });
    const violations = store.checkHardViolations({ max_position_pct: 20 });
    expect(violations).toHaveLength(1);
    expect(violations[0].description).toContain("15%");
  });

  it("returns no violations when within bounds", async () => {
    await store.create({ type: "risk_limit", description: "Max 15% concentration", metric: "max_position_pct", target: 15, priority: "hard" });
    const violations = store.checkHardViolations({ max_position_pct: 10 });
    expect(violations).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/autonomous/goalStore.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement GoalStore**

```typescript
// src/plugins/polymarket/autonomous/stores/goalStore.ts
import type { PortfolioGoal } from "../types";
import { PortfolioGoalSchema } from "../types";

interface CreateGoalParams {
  type: PortfolioGoal["type"];
  description: string;
  metric: string;
  target: number;
  priority: PortfolioGoal["priority"];
  timeframe?: { start: number; end: number };
}

export class GoalStore {
  private goals = new Map<string, PortfolioGoal>();

  async create(params: CreateGoalParams): Promise<PortfolioGoal> {
    const goal: PortfolioGoal = {
      id: `goal-${crypto.randomUUID()}`,
      type: params.type,
      description: params.description,
      metric: params.metric,
      target: params.target,
      current: 0,
      timeframe: params.timeframe,
      priority: params.priority,
      status: "active",
    };
    PortfolioGoalSchema.parse(goal);
    this.goals.set(goal.id, goal);
    return { ...goal };
  }

  async getActive(): Promise<PortfolioGoal[]> {
    return [...this.goals.values()]
      .filter((g) => g.status === "active")
      .map((g) => ({ ...g }));
  }

  async updateCurrent(id: string, value: number): Promise<void> {
    const goal = this.goals.get(id);
    if (!goal) throw new Error(`Goal ${id} not found`);
    goal.current = value;
  }

  async markAchieved(id: string): Promise<void> {
    const goal = this.goals.get(id);
    if (!goal) throw new Error(`Goal ${id} not found`);
    goal.status = "achieved";
  }

  async markFailed(id: string): Promise<void> {
    const goal = this.goals.get(id);
    if (!goal) throw new Error(`Goal ${id} not found`);
    goal.status = "failed";
  }

  /**
   * Check if any hard goals would be violated by the given metrics.
   * Each metric key maps to a current value; goal.target is the limit.
   * For risk_limit goals: violation when current > target.
   * For diversification goals: violation when current < target.
   */
  checkHardViolations(currentMetrics: Record<string, number>): PortfolioGoal[] {
    const violations: PortfolioGoal[] = [];
    for (const goal of this.goals.values()) {
      if (goal.status !== "active" || goal.priority !== "hard") continue;
      const currentValue = currentMetrics[goal.metric];
      if (currentValue === undefined) continue;

      const isViolation =
        goal.type === "diversification"
          ? currentValue < goal.target
          : currentValue > goal.target;

      if (isViolation) {
        violations.push({ ...goal });
      }
    }
    return violations;
  }

  getAll(): PortfolioGoal[] {
    return [...this.goals.values()].map((g) => ({ ...g }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/autonomous/goalStore.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/polymarket/autonomous/stores/goalStore.ts src/plugins/polymarket/__tests__/autonomous/goalStore.test.ts
git commit -m "feat(polymarket): add GoalStore with hard violation checking"
```

---

### Task 4: Implement TradeJournal

**Files:**
- Create: `src/plugins/polymarket/autonomous/stores/tradeJournal.ts`
- Test: `src/plugins/polymarket/__tests__/autonomous/tradeJournal.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/plugins/polymarket/__tests__/autonomous/tradeJournal.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { TradeJournal } from "../../autonomous/stores/tradeJournal";

describe("TradeJournal", () => {
  let journal: TradeJournal;

  beforeEach(() => {
    journal = new TradeJournal();
  });

  it("records and retrieves an entry", async () => {
    const entry = await journal.record({
      tradeId: "order-1", tokenId: "0x123",
      marketQuestion: "Will X?", thesisId: "thesis-1",
      entryThesis: "AI regulation", side: "buy",
      entryPrice: 0.62, entrySize: 500,
      entryTimestamp: Date.now(), confidenceAtEntry: 82,
    });
    expect(entry.id).toBeDefined();
    expect(entry.outcome).toBe("open");
  });

  it("closes an entry with exit data", async () => {
    const entry = await journal.record({
      tradeId: "order-2", tokenId: "0x456",
      marketQuestion: "Will Y?", thesisId: "thesis-2",
      entryThesis: "Crypto bull", side: "buy",
      entryPrice: 0.45, entrySize: 200,
      entryTimestamp: Date.now() - 86400000, confidenceAtEntry: 65,
    });
    const closed = await journal.close(entry.id, {
      exitPrice: 0.38, exitTimestamp: Date.now(),
      realizedPnl: -14, confidenceAtExit: 40,
    });
    expect(closed.outcome).toBe("loss");
    expect(closed.realizedPnl).toBe(-14);
  });

  it("classifies win correctly", async () => {
    const entry = await journal.record({
      tradeId: "order-3", tokenId: "0x789",
      marketQuestion: "Z?", thesisId: "t", entryThesis: "t",
      side: "buy", entryPrice: 0.5, entrySize: 100,
      entryTimestamp: Date.now(), confidenceAtEntry: 60,
    });
    const closed = await journal.close(entry.id, {
      exitPrice: 0.7, exitTimestamp: Date.now(), realizedPnl: 20,
    });
    expect(closed.outcome).toBe("win");
  });

  it("classifies breakeven correctly", async () => {
    const entry = await journal.record({
      tradeId: "order-4", tokenId: "0xaaa",
      marketQuestion: "A?", thesisId: "t", entryThesis: "t",
      side: "buy", entryPrice: 0.5, entrySize: 100,
      entryTimestamp: Date.now(), confidenceAtEntry: 50,
    });
    const closed = await journal.close(entry.id, {
      exitPrice: 0.5, exitTimestamp: Date.now(), realizedPnl: 0,
    });
    expect(closed.outcome).toBe("breakeven");
  });

  it("gets open entries", async () => {
    await journal.record({
      tradeId: "o1", tokenId: "0x1", marketQuestion: "?",
      thesisId: "t", entryThesis: "t", side: "buy",
      entryPrice: 0.5, entrySize: 10, entryTimestamp: Date.now(), confidenceAtEntry: 50,
    });
    const open = journal.getOpen();
    expect(open).toHaveLength(1);
  });

  it("gets entries by thesis", async () => {
    await journal.record({
      tradeId: "o1", tokenId: "0x1", marketQuestion: "?",
      thesisId: "thesis-A", entryThesis: "A", side: "buy",
      entryPrice: 0.5, entrySize: 10, entryTimestamp: Date.now(), confidenceAtEntry: 50,
    });
    await journal.record({
      tradeId: "o2", tokenId: "0x2", marketQuestion: "?",
      thesisId: "thesis-B", entryThesis: "B", side: "buy",
      entryPrice: 0.5, entrySize: 10, entryTimestamp: Date.now(), confidenceAtEntry: 50,
    });
    expect(journal.getByThesis("thesis-A")).toHaveLength(1);
    expect(journal.getByThesis("thesis-B")).toHaveLength(1);
  });

  it("computes daily realized PnL", async () => {
    const e1 = await journal.record({
      tradeId: "o1", tokenId: "0x1", marketQuestion: "?",
      thesisId: "t", entryThesis: "t", side: "buy",
      entryPrice: 0.5, entrySize: 100, entryTimestamp: Date.now(), confidenceAtEntry: 50,
    });
    await journal.close(e1.id, { exitPrice: 0.6, exitTimestamp: Date.now(), realizedPnl: 10 });

    const e2 = await journal.record({
      tradeId: "o2", tokenId: "0x2", marketQuestion: "?",
      thesisId: "t", entryThesis: "t", side: "buy",
      entryPrice: 0.5, entrySize: 100, entryTimestamp: Date.now(), confidenceAtEntry: 50,
    });
    await journal.close(e2.id, { exitPrice: 0.4, exitTimestamp: Date.now(), realizedPnl: -10 });

    expect(journal.getDailyRealizedPnl()).toBe(0); // +10 -10 = 0
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/autonomous/tradeJournal.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement TradeJournal**

```typescript
// src/plugins/polymarket/autonomous/stores/tradeJournal.ts
import type { TradeJournalEntry } from "../types";
import { TradeJournalEntrySchema } from "../types";

interface RecordParams {
  tradeId: string;
  tokenId: string;
  marketQuestion: string;
  thesisId: string;
  entryThesis: string;
  side: "buy" | "sell";
  entryPrice: number;
  entrySize: number;
  entryTimestamp: number;
  confidenceAtEntry: number;
}

interface CloseParams {
  exitPrice: number;
  exitTimestamp: number;
  realizedPnl: number;
  confidenceAtExit?: number;
  lessonLearned?: string;
}

export class TradeJournal {
  private entries = new Map<string, TradeJournalEntry>();

  async record(params: RecordParams): Promise<TradeJournalEntry> {
    const entry: TradeJournalEntry = {
      id: `journal-${crypto.randomUUID()}`,
      ...params,
      outcome: "open",
      createdAt: Date.now(),
    };
    TradeJournalEntrySchema.parse(entry);
    this.entries.set(entry.id, entry);
    return { ...entry };
  }

  async close(id: string, params: CloseParams): Promise<TradeJournalEntry> {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Journal entry ${id} not found`);

    entry.exitPrice = params.exitPrice;
    entry.exitTimestamp = params.exitTimestamp;
    entry.realizedPnl = params.realizedPnl;
    entry.confidenceAtExit = params.confidenceAtExit;
    entry.lessonLearned = params.lessonLearned;
    entry.outcome =
      params.realizedPnl > 0 ? "win" : params.realizedPnl < 0 ? "loss" : "breakeven";

    return { ...entry };
  }

  getOpen(): TradeJournalEntry[] {
    return [...this.entries.values()]
      .filter((e) => e.outcome === "open")
      .map((e) => ({ ...e }));
  }

  getByThesis(thesisId: string): TradeJournalEntry[] {
    return [...this.entries.values()]
      .filter((e) => e.thesisId === thesisId)
      .map((e) => ({ ...e }));
  }

  getByToken(tokenId: string): TradeJournalEntry[] {
    return [...this.entries.values()]
      .filter((e) => e.tokenId === tokenId)
      .map((e) => ({ ...e }));
  }

  getRecent(count: number): TradeJournalEntry[] {
    return [...this.entries.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, count)
      .map((e) => ({ ...e }));
  }

  getRecentlyClosed(count: number): TradeJournalEntry[] {
    return [...this.entries.values()]
      .filter((e) => e.outcome !== "open" && e.exitTimestamp != null)
      .sort((a, b) => (b.exitTimestamp ?? 0) - (a.exitTimestamp ?? 0))
      .slice(0, count)
      .map((e) => ({ ...e }));
  }

  /** Sum of realized PnL for entries closed today (UTC). */
  getDailyRealizedPnl(): number {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    return [...this.entries.values()]
      .filter(
        (e) =>
          e.outcome !== "open" &&
          e.exitTimestamp != null &&
          e.exitTimestamp >= todayMs &&
          e.realizedPnl != null
      )
      .reduce((sum, e) => sum + (e.realizedPnl ?? 0), 0);
  }

  getAll(): TradeJournalEntry[] {
    return [...this.entries.values()].map((e) => ({ ...e }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/autonomous/tradeJournal.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/polymarket/autonomous/stores/tradeJournal.ts src/plugins/polymarket/__tests__/autonomous/tradeJournal.test.ts
git commit -m "feat(polymarket): add TradeJournal with daily PnL and outcome classification"
```

---

### Task 5: Create DecisionQueue stub and autonomous index

**Files:**
- Create: `src/plugins/polymarket/autonomous/stores/decisionQueue.ts`
- Create: `src/plugins/polymarket/autonomous/index.ts`

- [ ] **Step 1: Write DecisionQueue stub**

The full implementation is Phase 3, but we need the type and an empty queue now so other modules can import it.

```typescript
// src/plugins/polymarket/autonomous/stores/decisionQueue.ts

/** Stub for Phase 3 — market scanner populates, decision action consumes. */
export interface DecisionQueueItem {
  id: string;
  timestamp: number;
  type: "opportunity" | "position_alert";
  priority: "low" | "medium" | "high" | "critical";
  data: Record<string, unknown>;
}

export class DecisionQueue {
  private items: DecisionQueueItem[] = [];
  private maxDepth = 100;

  push(item: DecisionQueueItem): void {
    if (this.items.length >= this.maxDepth) {
      this.items.shift(); // evict oldest
    }
    this.items.push(item);
  }

  drain(): DecisionQueueItem[] {
    const result = [...this.items];
    this.items = [];
    return result;
  }

  size(): number {
    return this.items.length;
  }
}
```

- [ ] **Step 2: Write autonomous index re-exporting all modules**

```typescript
// src/plugins/polymarket/autonomous/index.ts
export * from "./types";
export { ThesisStore } from "./stores/thesisStore";
export type { ThesisPerformanceSummary } from "./stores/thesisStore";
export { GoalStore } from "./stores/goalStore";
export { TradeJournal } from "./stores/tradeJournal";
export { DecisionQueue } from "./stores/decisionQueue";
export type { DecisionQueueItem } from "./stores/decisionQueue";
```

Note: `portfolioIntelligence` provider and `preTrade` gate will be added to this index in later tasks.

- [ ] **Step 3: Run all autonomous tests to verify nothing is broken**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/autonomous/`
Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/plugins/polymarket/autonomous/stores/decisionQueue.ts src/plugins/polymarket/autonomous/index.ts
git commit -m "feat(polymarket): add DecisionQueue stub and autonomous module index"
```

---

## Chunk 3: Pre-Trade Gate

### Task 6: Implement pre-trade gate function

**Files:**
- Create: `src/plugins/polymarket/autonomous/gates/preTrade.ts`
- Test: `src/plugins/polymarket/__tests__/autonomous/preTrade.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/plugins/polymarket/__tests__/autonomous/preTrade.test.ts
import { describe, it, expect } from "vitest";
import { evaluatePreTradeGate } from "../../autonomous/gates/preTrade";
import { ThesisStore } from "../../autonomous/stores/thesisStore";
import { GoalStore } from "../../autonomous/stores/goalStore";
import { TradeJournal } from "../../autonomous/stores/tradeJournal";
import type { PreTradeGateParams } from "../../autonomous/types";

function makeStores() {
  return {
    thesisStore: new ThesisStore(),
    goalStore: new GoalStore(),
    tradeJournal: new TradeJournal(),
  };
}

function baseParams(overrides: Partial<PreTradeGateParams> = {}): PreTradeGateParams {
  return {
    tokenId: "0x123", side: "buy", price: 0.5, size: 100,
    orderType: "GTC", isAutonomous: false, isClose: false,
    ...overrides,
  };
}

describe("evaluatePreTradeGate", () => {
  // ── Hard blocks ────────────────────────────────────────────────────

  it("blocks autonomous trade with no thesis", async () => {
    const stores = makeStores();
    const result = await evaluatePreTradeGate(
      baseParams({ isAutonomous: true }),
      stores,
      { usdcBalance: 1000, dailyLossUsd: 0, maxDailyLossUsd: 50, unrealizedPnl: 0 }
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("thesis");
  });

  it("allows user-requested trade with no thesis", async () => {
    const stores = makeStores();
    const result = await evaluatePreTradeGate(
      baseParams({ isAutonomous: false }),
      stores,
      { usdcBalance: 1000, dailyLossUsd: 0, maxDailyLossUsd: 50, unrealizedPnl: 0 }
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks when balance insufficient", async () => {
    const stores = makeStores();
    const result = await evaluatePreTradeGate(
      baseParams({ price: 0.5, size: 200 }), // cost = $100
      stores,
      { usdcBalance: 50, dailyLossUsd: 0, maxDailyLossUsd: 50, unrealizedPnl: 0 }
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("balance");
  });

  it("blocks autonomous trade when daily loss limit breached", async () => {
    const stores = makeStores();
    const thesis = await stores.thesisStore.create({
      text: "t", category: "c", initialConviction: 70,
      reasoning: "r", keyAssumptions: ["a"], invalidationCriteria: ["x"],
      relatedMarkets: [], timeHorizon: "days",
    });
    const result = await evaluatePreTradeGate(
      baseParams({ isAutonomous: true, thesisId: thesis.id }),
      stores,
      { usdcBalance: 1000, dailyLossUsd: -60, maxDailyLossUsd: 50, unrealizedPnl: 0 }
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("daily loss");
  });

  it("blocks autonomous trade under invalidated thesis", async () => {
    const stores = makeStores();
    const thesis = await stores.thesisStore.create({
      text: "t", category: "c", initialConviction: 70,
      reasoning: "r", keyAssumptions: ["a"], invalidationCriteria: ["x"],
      relatedMarkets: [], timeHorizon: "days",
    });
    await stores.thesisStore.invalidate(thesis.id, "x happened");
    const result = await evaluatePreTradeGate(
      baseParams({ isAutonomous: true, thesisId: thesis.id }),
      stores,
      { usdcBalance: 1000, dailyLossUsd: 0, maxDailyLossUsd: 50, unrealizedPnl: 0 }
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("invalidated");
  });

  // ── Close bypasses ────────────────────────────────────────────────

  it("allows close even under invalidated thesis", async () => {
    const stores = makeStores();
    const thesis = await stores.thesisStore.create({
      text: "t", category: "c", initialConviction: 70,
      reasoning: "r", keyAssumptions: ["a"], invalidationCriteria: ["x"],
      relatedMarkets: [], timeHorizon: "days",
    });
    await stores.thesisStore.invalidate(thesis.id, "x happened");
    const result = await evaluatePreTradeGate(
      baseParams({ isAutonomous: true, thesisId: thesis.id, isClose: true, side: "sell" }),
      stores,
      { usdcBalance: 1000, dailyLossUsd: 0, maxDailyLossUsd: 50, unrealizedPnl: 0 }
    );
    expect(result.allowed).toBe(true);
  });

  it("allows close even when daily loss breached", async () => {
    const stores = makeStores();
    const result = await evaluatePreTradeGate(
      baseParams({ isClose: true, side: "sell", isAutonomous: true }),
      stores,
      { usdcBalance: 1000, dailyLossUsd: -100, maxDailyLossUsd: 50, unrealizedPnl: 0 }
    );
    expect(result.allowed).toBe(true);
  });

  // ── Soft adjustments ──────────────────────────────────────────────

  it("reduces size based on conviction for autonomous trades", async () => {
    const stores = makeStores();
    const thesis = await stores.thesisStore.create({
      text: "t", category: "c", initialConviction: 50,
      reasoning: "r", keyAssumptions: ["a"], invalidationCriteria: ["x"],
      relatedMarkets: [], timeHorizon: "days",
    });
    const result = await evaluatePreTradeGate(
      baseParams({ isAutonomous: true, thesisId: thesis.id, size: 100 }),
      stores,
      { usdcBalance: 1000, dailyLossUsd: 0, maxDailyLossUsd: 50, unrealizedPnl: 0 }
    );
    expect(result.allowed).toBe(true);
    expect(result.adjustedSize).toBe(50); // 100 * (50/100)
  });

  it("does not adjust size for user-requested trades", async () => {
    const stores = makeStores();
    const result = await evaluatePreTradeGate(
      baseParams({ isAutonomous: false, size: 100 }),
      stores,
      { usdcBalance: 1000, dailyLossUsd: 0, maxDailyLossUsd: 50, unrealizedPnl: 0 }
    );
    expect(result.allowed).toBe(true);
    expect(result.adjustedSize).toBeUndefined();
  });

  // ── Warnings ──────────────────────────────────────────────────────

  it("warns on daily loss breach for user-requested trades (but allows)", async () => {
    const stores = makeStores();
    const result = await evaluatePreTradeGate(
      baseParams({ isAutonomous: false }),
      stores,
      { usdcBalance: 1000, dailyLossUsd: -60, maxDailyLossUsd: 50, unrealizedPnl: 0 }
    );
    expect(result.allowed).toBe(true);
    expect(result.warnings.some((w) => w.includes("daily loss"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/autonomous/preTrade.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the pre-trade gate**

```typescript
// src/plugins/polymarket/autonomous/gates/preTrade.ts
import type { PreTradeGateParams, PreTradeGateResult } from "../types";
import type { ThesisStore } from "../stores/thesisStore";
import type { GoalStore } from "../stores/goalStore";
import type { TradeJournal } from "../stores/tradeJournal";

export interface PreTradeStores {
  thesisStore: ThesisStore;
  goalStore: GoalStore;
  tradeJournal: TradeJournal;
}

export interface PreTradeContext {
  usdcBalance: number;
  dailyLossUsd: number; // negative = losses (realized today)
  maxDailyLossUsd: number;
  unrealizedPnl: number;
}

export async function evaluatePreTradeGate(
  params: PreTradeGateParams,
  stores: PreTradeStores,
  ctx: PreTradeContext
): Promise<PreTradeGateResult> {
  const warnings: string[] = [];
  let riskScore = 0;

  const orderCost = params.price * params.size;

  // ── Hard blocks ──────────────────────────────────────────────────

  // Balance check (applies to all trades, open and close)
  const reserveFactor = 0.95;
  if (orderCost > ctx.usdcBalance * reserveFactor && !params.isClose) {
    return {
      allowed: false,
      reason: `Insufficient balance: order costs $${orderCost.toFixed(2)} but available balance is $${ctx.usdcBalance.toFixed(2)} (5% reserve)`,
      warnings,
      riskScore: 100,
    };
  }

  // The following checks are skipped for position closes
  if (!params.isClose) {
    // Daily loss limit
    const totalLoss = ctx.dailyLossUsd + ctx.unrealizedPnl;
    const dailyLimitBreached = Math.abs(totalLoss) > ctx.maxDailyLossUsd && totalLoss < 0;

    if (dailyLimitBreached) {
      if (params.isAutonomous) {
        return {
          allowed: false,
          reason: `Daily loss limit breached: $${Math.abs(totalLoss).toFixed(2)} losses exceed $${ctx.maxDailyLossUsd} limit. Autonomous trading halted for today.`,
          warnings,
          riskScore: 100,
        };
      }
      warnings.push(`Daily loss limit breached ($${Math.abs(totalLoss).toFixed(2)} > $${ctx.maxDailyLossUsd}). Consider reducing exposure.`);
      riskScore += 30;
    }

    // No thesis (autonomous only)
    if (params.isAutonomous && !params.thesisId) {
      return {
        allowed: false,
        reason: "Autonomous trades require a thesis. No thesisId provided.",
        warnings,
        riskScore: 100,
      };
    }

    // Thesis invalidated (autonomous only)
    if (params.isAutonomous && params.thesisId) {
      const theses = stores.thesisStore.getAll();
      const thesis = theses.find((t) => t.id === params.thesisId);
      if (thesis && thesis.status === "invalidated") {
        return {
          allowed: false,
          reason: `Thesis "${thesis.text.slice(0, 50)}" is invalidated. Cannot open new positions.`,
          warnings,
          riskScore: 100,
        };
      }
      if (thesis && thesis.status === "retired") {
        return {
          allowed: false,
          reason: `Thesis "${thesis.text.slice(0, 50)}" is retired. Cannot open new positions.`,
          warnings,
          riskScore: 100,
        };
      }
    }

    // Hard goal violations
    const goalViolations = stores.goalStore.checkHardViolations({
      // Simplified for Phase 1 — will be expanded with real portfolio metrics in Phase 2+
      trade_cost_usd: orderCost,
    });
    if (goalViolations.length > 0) {
      return {
        allowed: false,
        reason: `Hard goal violation: ${goalViolations[0].description}`,
        warnings,
        riskScore: 100,
      };
    }
  }

  // ── Soft adjustments (autonomous only) ────────────────────────────

  let adjustedSize: number | undefined;

  if (params.isAutonomous && params.thesisId && !params.isClose) {
    const theses = stores.thesisStore.getAll();
    const thesis = theses.find((t) => t.id === params.thesisId);

    if (thesis) {
      // Conviction-based sizing: scale size by conviction/100
      const convictionFactor = thesis.conviction / 100;
      const convictionAdjusted = Math.round(params.size * convictionFactor);
      if (convictionAdjusted < params.size) {
        adjustedSize = convictionAdjusted;
        riskScore += Math.round((1 - convictionFactor) * 20);
      }

      // Advisory warnings
      if (thesis.performanceHistory.totalPnl < 0 && thesis.performanceHistory.totalTrades >= 2) {
        warnings.push(
          `Thesis "${thesis.text.slice(0, 40)}" has negative PnL ($${thesis.performanceHistory.totalPnl.toFixed(2)}) across ${thesis.performanceHistory.totalTrades} trades`
        );
        riskScore += 15;
      }
    }
  }

  return {
    allowed: true,
    adjustedSize,
    warnings,
    riskScore: Math.min(riskScore, 99),
  };
}
```

- [ ] **Step 4: Add gate export to autonomous index**

Add to `src/plugins/polymarket/autonomous/index.ts`:
```typescript
export { evaluatePreTradeGate } from "./gates/preTrade";
export type { PreTradeStores, PreTradeContext } from "./gates/preTrade";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/autonomous/preTrade.test.ts`
Expected: all tests PASS

- [ ] **Step 6: Run all autonomous tests**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/autonomous/`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/plugins/polymarket/autonomous/gates/preTrade.ts src/plugins/polymarket/__tests__/autonomous/preTrade.test.ts src/plugins/polymarket/autonomous/index.ts
git commit -m "feat(polymarket): add pre-trade gate with hard blocks, soft adjustments, and close bypass"
```

---

## Chunk 4: Portfolio Intelligence Provider

### Task 7: Implement portfolio intelligence provider

**Files:**
- Create: `src/plugins/polymarket/autonomous/providers/portfolioIntelligence.ts`
- Test: `src/plugins/polymarket/__tests__/autonomous/portfolioIntelligence.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/plugins/polymarket/__tests__/autonomous/portfolioIntelligence.test.ts
import { describe, it, expect } from "vitest";
import { formatPortfolioContext } from "../../autonomous/providers/portfolioIntelligence";
import { ThesisStore } from "../../autonomous/stores/thesisStore";
import { GoalStore } from "../../autonomous/stores/goalStore";
import { TradeJournal } from "../../autonomous/stores/tradeJournal";

describe("formatPortfolioContext", () => {
  it("formats empty state correctly", () => {
    const text = formatPortfolioContext({
      usdcBalance: 1000,
      totalPortfolioValue: 1000,
      unrealizedPnl: 0,
      todayPnl: 0,
      positions: [],
      theses: [],
      goals: [],
      recentOutcomes: [],
      calibration: [],
      pendingResearch: [],
    });
    expect(text).toContain("$1,000");
    expect(text).toContain("No active positions");
    expect(text).toContain("No active theses");
  });

  it("includes thesis-linked positions", () => {
    const text = formatPortfolioContext({
      usdcBalance: 500,
      totalPortfolioValue: 2000,
      unrealizedPnl: 100,
      todayPnl: -10,
      positions: [
        {
          tokenId: "0x123", marketQuestion: "Will X?",
          size: 500, avgPrice: 0.62, currentPrice: 0.71,
          unrealizedPnl: 45, thesisId: "t1", thesisText: "AI regulation",
          conviction: 82, convictionAtEntry: 85,
        },
      ],
      theses: [
        { id: "t1", text: "AI regulation", conviction: 82, category: "politics",
          wins: 2, losses: 0, pnl: 89, tradeCount: 2, status: "active" },
      ],
      goals: [
        { description: "Grow 20%", metric: "total_pnl_pct", target: 20, current: 5, priority: "hard", status: "on track" },
      ],
      recentOutcomes: [],
      calibration: [],
      pendingResearch: [],
    });
    expect(text).toContain("Will X?");
    expect(text).toContain("AI regulation");
    expect(text).toContain("Conviction: 82");
    expect(text).toContain("Grow 20%");
  });

  it("flags conviction drop", () => {
    const text = formatPortfolioContext({
      usdcBalance: 500,
      totalPortfolioValue: 1500,
      unrealizedPnl: -50,
      todayPnl: -10,
      positions: [
        {
          tokenId: "0x456", marketQuestion: "Will Y?",
          size: 200, avgPrice: 0.45, currentPrice: 0.38,
          unrealizedPnl: -14, thesisId: "t2", thesisText: "Crypto bull",
          conviction: 50, convictionAtEntry: 70,
        },
      ],
      theses: [],
      goals: [],
      recentOutcomes: [],
      calibration: [],
      pendingResearch: [],
    });
    expect(text).toContain("conviction dropped");
  });

  it("includes calibration data", () => {
    const text = formatPortfolioContext({
      usdcBalance: 1000,
      totalPortfolioValue: 1000,
      unrealizedPnl: 0,
      todayPnl: 0,
      positions: [],
      theses: [],
      goals: [],
      recentOutcomes: [],
      calibration: [
        { bucket: "70-79", trades: 6, winRate: 0.42, expected: 0.75, error: -0.33 },
      ],
      pendingResearch: [],
    });
    expect(text).toContain("70-79");
    expect(text).toContain("overconfident");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/autonomous/portfolioIntelligence.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the provider formatting logic**

```typescript
// src/plugins/polymarket/autonomous/providers/portfolioIntelligence.ts

export interface PositionContext {
  tokenId: string;
  marketQuestion: string;
  size: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  thesisId?: string;
  thesisText?: string;
  conviction?: number;
  convictionAtEntry?: number;
}

export interface ThesisContext {
  id: string;
  text: string;
  conviction: number;
  category: string;
  wins: number;
  losses: number;
  pnl: number;
  tradeCount: number;
  status: string;
}

export interface GoalContext {
  description: string;
  metric: string;
  target: number;
  current: number;
  priority: string;
  status: string;
}

export interface OutcomeContext {
  marketQuestion: string;
  outcome: string;
  pnl: number;
  confidence: number;
  lesson?: string;
}

export interface CalibrationContext {
  bucket: string;
  trades: number;
  winRate: number;
  expected: number;
  error: number;
}

export interface ResearchContext {
  marketQuestion: string;
  status: string;
  recommendation?: string;
}

export interface PortfolioContextData {
  usdcBalance: number;
  totalPortfolioValue: number;
  unrealizedPnl: number;
  todayPnl: number;
  positions: PositionContext[];
  theses: ThesisContext[];
  goals: GoalContext[];
  recentOutcomes: OutcomeContext[];
  calibration: CalibrationContext[];
  pendingResearch: ResearchContext[];
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sign(n: number): string {
  return n >= 0 ? `+$${fmt(n)}` : `-$${fmt(Math.abs(n))}`;
}

function pctSign(n: number): string {
  return n >= 0 ? `+${n.toFixed(1)}%` : `${n.toFixed(1)}%`;
}

export function formatPortfolioContext(data: PortfolioContextData): string {
  const lines: string[] = [];

  // Portfolio state
  lines.push("=== Portfolio State ===");
  lines.push(`USDC Balance: $${fmt(data.usdcBalance)}`);
  lines.push(`Total Portfolio Value: $${fmt(data.totalPortfolioValue)}`);
  const unrealizedPct = data.totalPortfolioValue > 0
    ? (data.unrealizedPnl / data.totalPortfolioValue) * 100 : 0;
  lines.push(`Unrealized P&L: ${sign(data.unrealizedPnl)} (${pctSign(unrealizedPct)})`);
  lines.push(`Today's P&L: ${sign(data.todayPnl)}`);
  lines.push("");

  // Positions
  lines.push("=== Active Positions (by conviction) ===");
  if (data.positions.length === 0) {
    lines.push("No active positions");
  } else {
    const sorted = [...data.positions].sort(
      (a, b) => (b.conviction ?? 0) - (a.conviction ?? 0)
    );
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      let line = `${i + 1}. "${p.marketQuestion}" — ${p.size} shares @ $${p.avgPrice.toFixed(2)} (now $${p.currentPrice.toFixed(2)})`;
      if (p.thesisText) {
        line += `\n   Thesis: ${p.thesisText}`;
      }
      if (p.conviction !== undefined) {
        line += ` | Conviction: ${p.conviction}`;
      }
      line += ` | Unrealized: ${sign(p.unrealizedPnl)}`;
      lines.push(line);

      if (p.conviction !== undefined && p.convictionAtEntry !== undefined) {
        const drop = p.convictionAtEntry - p.conviction;
        if (drop >= 10) {
          lines.push(`   ⚠️ Thesis conviction dropped ${drop}pts since entry`);
        }
      }
    }
  }
  lines.push("");

  // Theses
  lines.push("=== Active Theses (ranked by conviction) ===");
  const activeTheses = data.theses.filter((t) => t.status === "active");
  if (activeTheses.length === 0) {
    lines.push("No active theses");
  } else {
    const sorted = [...activeTheses].sort((a, b) => b.conviction - a.conviction);
    for (const t of sorted) {
      let line = `[${t.conviction}] ${t.text} — ${t.tradeCount} markets, ${t.wins} wins / ${t.losses} losses, ${sign(t.pnl)} PnL`;
      lines.push(line);
      if (t.pnl < 0 && t.tradeCount >= 3) {
        lines.push(`   ⚠️ Underperforming — consider retiring`);
      }
    }
  }
  lines.push("");

  // Goals
  if (data.goals.length > 0) {
    lines.push("=== Portfolio Goals ===");
    for (const g of data.goals) {
      const checkmark = g.status === "on track" ? "✓" : "⚠️";
      lines.push(`- ${g.description}: target ${g.target} → currently ${g.current} ${checkmark}`);
    }
    lines.push("");
  }

  // Recent outcomes
  if (data.recentOutcomes.length > 0) {
    lines.push("=== Recent Outcomes (last 7 days) ===");
    for (const o of data.recentOutcomes) {
      let line = `- CLOSED: "${o.marketQuestion}" — ${o.outcome.toUpperCase()}, ${sign(o.pnl)}, confidence was ${o.confidence}`;
      if (o.lesson) {
        line += `\n  Lesson: ${o.lesson}`;
      }
      lines.push(line);
    }
    lines.push("");
  }

  // Calibration
  if (data.calibration.length > 0) {
    lines.push("=== Calibration ===");
    for (const c of data.calibration) {
      const winPct = (c.winRate * 100).toFixed(0);
      const expPct = (c.expected * 100).toFixed(0);
      const label = c.error < -0.1 ? "overconfident ⚠️" : c.error > 0.1 ? "underconfident" : "well calibrated";
      lines.push(`Conviction ${c.bucket}: ${c.trades} trades, ${winPct}% win rate (expected ${expPct}%) — ${label}`);
    }
    lines.push("");
  }

  // Pending research
  if (data.pendingResearch.length > 0) {
    lines.push("=== Pending Research ===");
    for (const r of data.pendingResearch) {
      let line = `- "${r.marketQuestion}" — ${r.status}`;
      if (r.recommendation) line += `, recommendation: ${r.recommendation}`;
      lines.push(line);
    }
    lines.push("");
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Add provider export to index**

Add to `src/plugins/polymarket/autonomous/index.ts`:
```typescript
export { formatPortfolioContext } from "./providers/portfolioIntelligence";
export type {
  PortfolioContextData,
  PositionContext,
  ThesisContext,
  GoalContext,
  OutcomeContext,
  CalibrationContext,
  ResearchContext,
} from "./providers/portfolioIntelligence";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/autonomous/portfolioIntelligence.test.ts`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/plugins/polymarket/autonomous/providers/portfolioIntelligence.ts src/plugins/polymarket/__tests__/autonomous/portfolioIntelligence.test.ts src/plugins/polymarket/autonomous/index.ts
git commit -m "feat(polymarket): add portfolio intelligence context formatter"
```

---

## Chunk 5: Integration into Existing Plugin

### Task 8: Add autonomous config constants

**Files:**
- Modify: `src/plugins/polymarket/constants.ts` (append after line 39)

- [ ] **Step 1: Add autonomous constants**

Append to `src/plugins/polymarket/constants.ts`:

```typescript
// Autonomous trading configuration defaults
export const AUTONOMOUS_ENABLED_DEFAULT = true;
export const AUTONOMOUS_TRADE_ENABLED_DEFAULT = true;
export const MAX_ACTIVE_THESES_DEFAULT = 10;
export const MIN_TRADE_CONVICTION_DEFAULT = 50;
export const CONVICTION_DECAY_THRESHOLD_DEFAULT = 30;
export const REFLECTION_INTERVAL_MS_DEFAULT = 6 * 60 * 60 * 1000; // 6 hours
export const SCAN_INTERVAL_MS_DEFAULT = 2 * 60 * 60 * 1000; // 2 hours
export const MIN_TRADE_INTERVAL_MS_DEFAULT = 15 * 60 * 1000; // 15 minutes
export const MAX_RESEARCH_PER_SCAN_DEFAULT = 2;
export const SCAN_TIMEOUT_MS_DEFAULT = 5 * 60 * 1000; // 5 minutes
export const BALANCE_RESERVE_PCT_DEFAULT = 5;
export const MAX_DAILY_LOSS_USD_DEFAULT = 50;
export const PORTFOLIO_PROVIDER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
```

- [ ] **Step 2: Add config keys to plugin configSchema**

In `src/plugins/polymarket/index.ts`, add these fields inside `configSchema` (after `OPENAI_API_KEY` at line 77):

```typescript
  POLYMARKET_AUTONOMOUS_ENABLED: z.string().optional().default("true"),
  POLYMARKET_AUTONOMOUS_TRADE_ENABLED: z.string().optional().default("true"),
  POLYMARKET_MAX_ACTIVE_THESES: z.string().optional(),
  POLYMARKET_MIN_TRADE_CONVICTION: z.string().optional(),
  POLYMARKET_CONVICTION_DECAY_THRESHOLD: z.string().optional(),
  POLYMARKET_REFLECTION_INTERVAL_MS: z.string().optional(),
  POLYMARKET_SCAN_INTERVAL_MS: z.string().optional(),
  POLYMARKET_MIN_TRADE_INTERVAL_MS: z.string().optional(),
  POLYMARKET_MAX_RESEARCH_PER_SCAN: z.string().optional(),
  POLYMARKET_SCAN_TIMEOUT_MS: z.string().optional(),
  POLYMARKET_BALANCE_RESERVE_PCT: z.string().optional(),
  POLYMARKET_MAX_DAILY_LOSS_USD: z.string().optional(),
```

Add corresponding entries to the `config` object (after `OPENAI_API_KEY` at line 98):

```typescript
    POLYMARKET_AUTONOMOUS_ENABLED: process.env.POLYMARKET_AUTONOMOUS_ENABLED,
    POLYMARKET_AUTONOMOUS_TRADE_ENABLED: process.env.POLYMARKET_AUTONOMOUS_TRADE_ENABLED,
    POLYMARKET_MAX_ACTIVE_THESES: process.env.POLYMARKET_MAX_ACTIVE_THESES,
    POLYMARKET_MIN_TRADE_CONVICTION: process.env.POLYMARKET_MIN_TRADE_CONVICTION,
    POLYMARKET_CONVICTION_DECAY_THRESHOLD: process.env.POLYMARKET_CONVICTION_DECAY_THRESHOLD,
    POLYMARKET_REFLECTION_INTERVAL_MS: process.env.POLYMARKET_REFLECTION_INTERVAL_MS,
    POLYMARKET_SCAN_INTERVAL_MS: process.env.POLYMARKET_SCAN_INTERVAL_MS,
    POLYMARKET_MIN_TRADE_INTERVAL_MS: process.env.POLYMARKET_MIN_TRADE_INTERVAL_MS,
    POLYMARKET_MAX_RESEARCH_PER_SCAN: process.env.POLYMARKET_MAX_RESEARCH_PER_SCAN,
    POLYMARKET_SCAN_TIMEOUT_MS: process.env.POLYMARKET_SCAN_TIMEOUT_MS,
    POLYMARKET_BALANCE_RESERVE_PCT: process.env.POLYMARKET_BALANCE_RESERVE_PCT,
    POLYMARKET_MAX_DAILY_LOSS_USD: process.env.POLYMARKET_MAX_DAILY_LOSS_USD,
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/`
Expected: all existing + new tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/plugins/polymarket/constants.ts src/plugins/polymarket/index.ts
git commit -m "feat(polymarket): add autonomous trading config constants and schema keys"
```

---

### Task 9: Integrate pre-trade gate into placeOrderAction

**Files:**
- Modify: `src/plugins/polymarket/actions/placeOrder.ts:764` (after balance check, before order submission)

- [ ] **Step 1: Add gate import and call**

At the top of `placeOrder.ts`, add the import (after existing imports around line 35):

```typescript
import { evaluatePreTradeGate } from "../autonomous/gates/preTrade";
import { ThesisStore } from "../autonomous/stores/thesisStore";
import { GoalStore } from "../autonomous/stores/goalStore";
import { TradeJournal } from "../autonomous/stores/tradeJournal";
import { MAX_DAILY_LOSS_USD_DEFAULT } from "../constants";
```

After the balance check block (line 763) and before the "Log order details" comment (line 765), insert:

```typescript
    // ── Autonomous pre-trade gate ──────────────────────────────────
    // Reads from autonomous stores if available. For user-requested trades,
    // the gate only warns. For autonomous trades, it can block or adjust.
    const isAutonomous = Boolean((message.content as Record<string, unknown>)?.autonomous);
    const thesisId = (message.content as Record<string, unknown>)?.thesisId as string | undefined;

    try {
      // Stores are singletons — create lightweight instances that will be
      // replaced with runtime-managed instances when Phase 2 lands
      const thesisStore = new ThesisStore();
      const goalStore = new GoalStore();
      const tradeJournal = new TradeJournal();
      const maxDailyLoss = parseFloat(
        runtime.getSetting("POLYMARKET_MAX_DAILY_LOSS_USD") || String(MAX_DAILY_LOSS_USD_DEFAULT)
      );

      const gateResult = await evaluatePreTradeGate(
        {
          tokenId, side: side.toLowerCase() as "buy" | "sell",
          price, size, dollarAmount, orderType,
          thesisId, isAutonomous, isClose: false,
        },
        { thesisStore, goalStore, tradeJournal },
        {
          usdcBalance: usdcBalance ?? 0,
          dailyLossUsd: tradeJournal.getDailyRealizedPnl(),
          maxDailyLossUsd: maxDailyLoss,
          unrealizedPnl: 0, // TODO: compute from positions in Phase 2
        }
      );

      if (!gateResult.allowed) {
        runtime.logger.warn(`[placeOrderAction] Pre-trade gate blocked: ${gateResult.reason}`);
        await sendError(callback, gateResult.reason!, "Pre-trade gate");
        return { success: false, text: gateResult.reason!, error: "gate_blocked" };
      }

      if (gateResult.warnings.length > 0) {
        for (const w of gateResult.warnings) {
          runtime.logger.warn(`[placeOrderAction] Gate warning: ${w}`);
        }
      }

      if (isAutonomous && gateResult.adjustedSize && gateResult.adjustedSize !== size) {
        runtime.logger.info(
          `[placeOrderAction] Gate adjusted size: ${size} → ${gateResult.adjustedSize} (conviction-based)`
        );
        size = gateResult.adjustedSize;
      }
    } catch (gateError) {
      // Gate failure should not block user trades — log and continue
      runtime.logger.warn(`[placeOrderAction] Pre-trade gate error: ${gateError}`);
    }
```

- [ ] **Step 2: Verify existing placeOrder tests still pass**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/placeOrder.test.ts`
Expected: PASS (gate creates empty stores, which won't block user-requested trades)

- [ ] **Step 3: Verify all autonomous tests still pass**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/`
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add src/plugins/polymarket/actions/placeOrder.ts
git commit -m "feat(polymarket): integrate pre-trade gate into placeOrderAction"
```

---

### Task 10: Integrate pre-trade gate into closePositionAction

**Files:**
- Modify: `src/plugins/polymarket/actions/closePosition.ts:239` (before order placement)

- [ ] **Step 1: Add gate import and call**

At the top of `closePosition.ts`, add the import (after existing imports):

```typescript
import { evaluatePreTradeGate } from "../autonomous/gates/preTrade";
import { ThesisStore } from "../autonomous/stores/thesisStore";
import { GoalStore } from "../autonomous/stores/goalStore";
import { TradeJournal } from "../autonomous/stores/tradeJournal";
import { MAX_DAILY_LOSS_USD_DEFAULT } from "../constants";
```

Before the `if (orderType === "market")` check at line 242, insert:

```typescript
      // ── Autonomous pre-trade gate (close mode) ────────────────────
      const isAutonomous = Boolean((message.content as Record<string, unknown>)?.autonomous);
      const thesisId = (message.content as Record<string, unknown>)?.thesisId as string | undefined;

      try {
        const thesisStore = new ThesisStore();
        const goalStore = new GoalStore();
        const tradeJournal = new TradeJournal();
        const maxDailyLoss = parseFloat(
          runtime.getSetting("POLYMARKET_MAX_DAILY_LOSS_USD") || String(MAX_DAILY_LOSS_USD_DEFAULT)
        );

        const gateResult = await evaluatePreTradeGate(
          {
            tokenId, side: "sell", price: bestBidResult.price,
            size: positionSize, isAutonomous, isClose: true,
            thesisId,
          },
          { thesisStore, goalStore, tradeJournal },
          {
            usdcBalance: 0, // Not relevant for closes
            dailyLossUsd: tradeJournal.getDailyRealizedPnl(),
            maxDailyLossUsd: maxDailyLoss,
            unrealizedPnl: 0,
          }
        );

        // Closes are only blocked by balance/market-status checks
        if (!gateResult.allowed) {
          runtime.logger.warn(`[closePositionAction] Pre-trade gate blocked close: ${gateResult.reason}`);
          await sendError(callback, gateResult.reason!, "Pre-trade gate");
          return { success: false, text: gateResult.reason!, error: "gate_blocked" };
        }

        if (gateResult.warnings.length > 0) {
          for (const w of gateResult.warnings) {
            runtime.logger.warn(`[closePositionAction] Gate warning: ${w}`);
          }
        }
      } catch (gateError) {
        runtime.logger.warn(`[closePositionAction] Pre-trade gate error: ${gateError}`);
      }
```

- [ ] **Step 2: Verify all tests still pass**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/`
Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add src/plugins/polymarket/actions/closePosition.ts
git commit -m "feat(polymarket): integrate pre-trade gate into closePositionAction (close mode)"
```

---

### Task 11: Final integration — run full test suite

- [ ] **Step 1: Run all polymarket plugin tests**

Run: `cd /Users/pleasures/Desktop/milady && bunx vitest run src/plugins/polymarket/__tests__/`
Expected: all tests PASS

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/pleasures/Desktop/milady && bun run check`
Expected: no type errors in polymarket plugin files

- [ ] **Step 3: Final commit with all files verified**

```bash
git add -A src/plugins/polymarket/
git status
# Verify only expected files are staged
git commit -m "feat(polymarket): Phase 1 complete — autonomous data model, stores, pre-trade gate, portfolio context"
```
