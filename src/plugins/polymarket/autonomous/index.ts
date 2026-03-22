// src/plugins/polymarket/autonomous/index.ts
export * from "./types";
export { ThesisStore } from "./stores/thesisStore";
export type { ThesisPerformanceSummary } from "./stores/thesisStore";
export { GoalStore } from "./stores/goalStore";
export { TradeJournal } from "./stores/tradeJournal";
export { DecisionQueue } from "./stores/decisionQueue";
export type { DecisionQueueItem } from "./stores/decisionQueue";
export {
  initializeStores,
  getThesisStore,
  getGoalStore,
  getTradeJournal,
  getDecisionQueue,
  storesInitialized,
  resetStores,
} from "./stores/registry";
export type { StoreRegistryOptions } from "./stores/registry";
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
