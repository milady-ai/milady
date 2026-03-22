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
