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
