// src/plugins/polymarket/autonomous/types.ts
import { z } from "zod";

// ── Performance History ──────────────────────────────────────────────
export const PerformanceHistorySchema = z.object({
  totalTrades: z.number().int().min(0),
  wins: z.number().int().min(0),
  losses: z.number().int().min(0),
  totalPnl: z.number(),
  avgConfidenceAtEntry: z.number().min(0).max(100),
});
export type PerformanceHistory = z.infer<typeof PerformanceHistorySchema>;

// ── Trading Thesis ───────────────────────────────────────────────────
export const TradingThesisSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  category: z.string().min(1),
  conviction: z.number().min(0).max(100),
  createdAt: z.number(),
  updatedAt: z.number(),
  supportingEvidence: z.array(z.string()),
  contradictingEvidence: z.array(z.string()),
  relatedMarketIds: z.array(z.string()),
  status: z.enum(["active", "retired", "invalidated"]),
  keyAssumptions: z.array(z.string()),
  invalidationCriteria: z.array(z.string()),
  timeHorizon: z.enum(["days", "weeks", "months"]),
  performanceHistory: PerformanceHistorySchema,
});
export type TradingThesis = z.infer<typeof TradingThesisSchema>;

// ── Portfolio Goal ───────────────────────────────────────────────────
export const PortfolioGoalSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["return_target", "risk_limit", "diversification", "thesis_allocation"]),
  description: z.string().min(1),
  metric: z.string().min(1),
  target: z.number(),
  current: z.number(),
  timeframe: z.object({ start: z.number(), end: z.number() }).optional(),
  priority: z.enum(["hard", "soft"]),
  status: z.enum(["active", "achieved", "failed", "expired"]),
});
export type PortfolioGoal = z.infer<typeof PortfolioGoalSchema>;

// ── Trade Journal Entry ──────────────────────────────────────────────
export const TradeJournalEntrySchema = z.object({
  id: z.string().min(1),
  tradeId: z.string().min(1),
  tokenId: z.string().min(1),
  marketQuestion: z.string(),
  thesisId: z.string(),
  entryThesis: z.string(),
  side: z.enum(["buy", "sell"]),
  entryPrice: z.number().min(0).max(1),
  entrySize: z.number().positive(),
  entryTimestamp: z.number(),
  exitPrice: z.number().min(0).max(1).optional(),
  exitTimestamp: z.number().optional(),
  realizedPnl: z.number().optional(),
  outcome: z.enum(["win", "loss", "breakeven", "open"]).optional(),
  lessonLearned: z.string().optional(),
  confidenceAtEntry: z.number().min(0).max(100),
  confidenceAtExit: z.number().min(0).max(100).optional(),
  createdAt: z.number(),
});
export type TradeJournalEntry = z.infer<typeof TradeJournalEntrySchema>;

// ── Conviction Update ────────────────────────────────────────────────
export const ConvictionUpdateSchema = z.object({
  thesisId: z.string().min(1),
  previousConviction: z.number().min(0).max(100),
  newConviction: z.number().min(0).max(100),
  reason: z.string().min(1),
  evidence: z.string(),
  timestamp: z.number(),
});
export type ConvictionUpdate = z.infer<typeof ConvictionUpdateSchema>;

// ── Calibration Record ───────────────────────────────────────────────
const VALID_BUCKETS = [50, 60, 70, 80, 90] as const;
export const CalibrationRecordSchema = z.object({
  convictionBucket: z.number().refine(
    (v) => (VALID_BUCKETS as readonly number[]).includes(v),
    { message: "convictionBucket must be one of 50, 60, 70, 80, 90" }
  ),
  totalTrades: z.number().int().min(0),
  wins: z.number().int().min(0),
  expectedWinRate: z.number().min(0).max(1),
  actualWinRate: z.number().min(0).max(1),
  calibrationError: z.number(),
});
export type CalibrationRecord = z.infer<typeof CalibrationRecordSchema>;

// ── Pre-Trade Gate ───────────────────────────────────────────────────
export const PreTradeGateParamsSchema = z.object({
  tokenId: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  price: z.number().min(0).max(1),
  size: z.number().positive(),
  dollarAmount: z.number().positive().optional(),
  orderType: z.string().optional(),
  thesisId: z.string().optional(),
  isAutonomous: z.boolean(),
  isClose: z.boolean(),
});
export type PreTradeGateParams = z.infer<typeof PreTradeGateParamsSchema>;

export const PreTradeGateResultSchema = z.object({
  allowed: z.boolean(),
  adjustedSize: z.number().positive().optional(),
  adjustedPrice: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
  warnings: z.array(z.string()),
  riskScore: z.number().min(0).max(100),
});
export type PreTradeGateResult = z.infer<typeof PreTradeGateResultSchema>;

// ── Thesis Proposal (LLM output for formation — Phase 2) ────────────
export const ThesisProposalSchema = z.object({
  text: z.string().min(1),
  category: z.string().min(1),
  initialConviction: z.number().min(0).max(100),
  reasoning: z.string().min(1),
  keyAssumptions: z.array(z.string()).min(1),
  invalidationCriteria: z.array(z.string()).min(1),
  relatedMarkets: z.array(z.string()),
  timeHorizon: z.enum(["days", "weeks", "months"]),
});
export type ThesisProposal = z.infer<typeof ThesisProposalSchema>;
