// src/plugins/polymarket/autonomous/gates/preTrade.ts
import type { PreTradeGateParams, PreTradeGateResult } from "../types";
import type { ThesisStore } from "../stores/thesisStore";
import type { GoalStore } from "../stores/goalStore";
import type { TradeJournal } from "../stores/tradeJournal";

export interface PreTradeStores {
  thesisStore: ThesisStore;
  goalStore: GoalStore;
  tradeJournal: TradeJournal;
}

export interface PreTradeContext {
  usdcBalance: number;
  dailyLossUsd: number; // negative = losses (realized today)
  maxDailyLossUsd: number;
  unrealizedPnl: number;
}

export async function evaluatePreTradeGate(
  params: PreTradeGateParams,
  stores: PreTradeStores,
  ctx: PreTradeContext
): Promise<PreTradeGateResult> {
  const warnings: string[] = [];
  let riskScore = 0;

  const orderCost = params.price * params.size;

  // ── Hard blocks ──────────────────────────────────────────────────

  // Balance check (applies to all trades, open and close)
  const reserveFactor = 0.95;
  if (orderCost > ctx.usdcBalance * reserveFactor && !params.isClose) {
    return {
      allowed: false,
      reason: `Insufficient balance: order costs $${orderCost.toFixed(2)} but available balance is $${ctx.usdcBalance.toFixed(2)} (5% reserve)`,
      warnings,
      riskScore: 100,
    };
  }

  // The following checks are skipped for position closes
  if (!params.isClose) {
    // Daily loss limit
    const totalLoss = ctx.dailyLossUsd + ctx.unrealizedPnl;
    const dailyLimitBreached = Math.abs(totalLoss) > ctx.maxDailyLossUsd && totalLoss < 0;

    if (dailyLimitBreached) {
      if (params.isAutonomous) {
        return {
          allowed: false,
          reason: `Daily loss limit breached: $${Math.abs(totalLoss).toFixed(2)} losses exceed $${ctx.maxDailyLossUsd} limit. Autonomous trading halted for today.`,
          warnings,
          riskScore: 100,
        };
      }
      warnings.push(`Daily loss limit breached ($${Math.abs(totalLoss).toFixed(2)} > $${ctx.maxDailyLossUsd}). Consider reducing exposure.`);
      riskScore += 30;
    }

    // No thesis (autonomous only)
    if (params.isAutonomous && !params.thesisId) {
      return {
        allowed: false,
        reason: "Autonomous trades require a thesis. No thesisId provided.",
        warnings,
        riskScore: 100,
      };
    }

    // Thesis invalidated (autonomous only)
    if (params.isAutonomous && params.thesisId) {
      const theses = stores.thesisStore.getAll();
      const thesis = theses.find((t) => t.id === params.thesisId);
      if (thesis && thesis.status === "invalidated") {
        return {
          allowed: false,
          reason: `Thesis "${thesis.text.slice(0, 50)}" is invalidated. Cannot open new positions.`,
          warnings,
          riskScore: 100,
        };
      }
      if (thesis && thesis.status === "retired") {
        return {
          allowed: false,
          reason: `Thesis "${thesis.text.slice(0, 50)}" is retired. Cannot open new positions.`,
          warnings,
          riskScore: 100,
        };
      }
    }

    // Hard goal violations
    const goalViolations = stores.goalStore.checkHardViolations({
      // Simplified for Phase 1 — will be expanded with real portfolio metrics in Phase 2+
      trade_cost_usd: orderCost,
    });
    if (goalViolations.length > 0) {
      return {
        allowed: false,
        reason: `Hard goal violation: ${goalViolations[0].description}`,
        warnings,
        riskScore: 100,
      };
    }
  }

  // ── Soft adjustments (autonomous only) ────────────────────────────

  let adjustedSize: number | undefined;

  if (params.isAutonomous && params.thesisId && !params.isClose) {
    const theses = stores.thesisStore.getAll();
    const thesis = theses.find((t) => t.id === params.thesisId);

    if (thesis) {
      // Conviction-based sizing: scale size by conviction/100
      const convictionFactor = thesis.conviction / 100;
      const convictionAdjusted = Math.round(params.size * convictionFactor);
      if (convictionAdjusted < params.size) {
        adjustedSize = convictionAdjusted;
        riskScore += Math.round((1 - convictionFactor) * 20);
      }

      // Advisory warnings
      if (thesis.performanceHistory.totalPnl < 0 && thesis.performanceHistory.totalTrades >= 2) {
        warnings.push(
          `Thesis "${thesis.text.slice(0, 40)}" has negative PnL ($${thesis.performanceHistory.totalPnl.toFixed(2)}) across ${thesis.performanceHistory.totalTrades} trades`
        );
        riskScore += 15;
      }
    }
  }

  return {
    allowed: true,
    adjustedSize,
    warnings,
    riskScore: Math.min(riskScore, 99),
  };
}
