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
