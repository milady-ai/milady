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
