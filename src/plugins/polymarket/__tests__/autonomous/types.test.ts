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
