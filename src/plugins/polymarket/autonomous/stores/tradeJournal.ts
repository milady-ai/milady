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
