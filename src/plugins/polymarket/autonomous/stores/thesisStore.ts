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
