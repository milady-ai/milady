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
    expect(result.reason).toContain("Daily loss");
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
    expect(result.warnings.some((w) => w.includes("Daily loss"))).toBe(true);
  });
});
