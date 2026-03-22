// src/plugins/polymarket/autonomous/stores/registry.ts
import { ThesisStore } from "./thesisStore";
import { GoalStore } from "./goalStore";
import { TradeJournal } from "./tradeJournal";
import { DecisionQueue } from "./decisionQueue";

let thesisStore: ThesisStore | null = null;
let goalStore: GoalStore | null = null;
let tradeJournal: TradeJournal | null = null;
let decisionQueue: DecisionQueue | null = null;

export interface StoreRegistryOptions {
  maxActiveTheses?: number;
}

/** Call once during plugin init to create singleton store instances. */
export function initializeStores(options?: StoreRegistryOptions): void {
  thesisStore = new ThesisStore({ maxActiveTheses: options?.maxActiveTheses });
  goalStore = new GoalStore();
  tradeJournal = new TradeJournal();
  decisionQueue = new DecisionQueue();
}

/** Get the singleton ThesisStore. Throws if not initialized. */
export function getThesisStore(): ThesisStore {
  if (!thesisStore) throw new Error("Autonomous stores not initialized. Call initializeStores() first.");
  return thesisStore;
}

/** Get the singleton GoalStore. Throws if not initialized. */
export function getGoalStore(): GoalStore {
  if (!goalStore) throw new Error("Autonomous stores not initialized. Call initializeStores() first.");
  return goalStore;
}

/** Get the singleton TradeJournal. Throws if not initialized. */
export function getTradeJournal(): TradeJournal {
  if (!tradeJournal) throw new Error("Autonomous stores not initialized. Call initializeStores() first.");
  return tradeJournal;
}

/** Get the singleton DecisionQueue. Throws if not initialized. */
export function getDecisionQueue(): DecisionQueue {
  if (!decisionQueue) throw new Error("Autonomous stores not initialized. Call initializeStores() first.");
  return decisionQueue;
}

/** Check if stores have been initialized (for graceful fallback in action handlers). */
export function storesInitialized(): boolean {
  return thesisStore !== null;
}

/** Reset all stores (for testing only). */
export function resetStores(): void {
  thesisStore = null;
  goalStore = null;
  tradeJournal = null;
  decisionQueue = null;
}
