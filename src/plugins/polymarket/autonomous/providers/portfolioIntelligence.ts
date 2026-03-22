// src/plugins/polymarket/autonomous/providers/portfolioIntelligence.ts

export interface PositionContext {
  tokenId: string;
  marketQuestion: string;
  size: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  thesisId?: string;
  thesisText?: string;
  conviction?: number;
  convictionAtEntry?: number;
}

export interface ThesisContext {
  id: string;
  text: string;
  conviction: number;
  category: string;
  wins: number;
  losses: number;
  pnl: number;
  tradeCount: number;
  status: string;
}

export interface GoalContext {
  description: string;
  metric: string;
  target: number;
  current: number;
  priority: string;
  status: string;
}

export interface OutcomeContext {
  marketQuestion: string;
  outcome: string;
  pnl: number;
  confidence: number;
  lesson?: string;
}

export interface CalibrationContext {
  bucket: string;
  trades: number;
  winRate: number;
  expected: number;
  error: number;
}

export interface ResearchContext {
  marketQuestion: string;
  status: string;
  recommendation?: string;
}

export interface PortfolioContextData {
  usdcBalance: number;
  totalPortfolioValue: number;
  unrealizedPnl: number;
  todayPnl: number;
  positions: PositionContext[];
  theses: ThesisContext[];
  goals: GoalContext[];
  recentOutcomes: OutcomeContext[];
  calibration: CalibrationContext[];
  pendingResearch: ResearchContext[];
}

function fmt(n: number): string {
  const fixed = n.toFixed(2);
  const [int, dec] = fixed.split(".");
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${withCommas}.${dec}`;
}

function sign(n: number): string {
  return n >= 0 ? `+$${fmt(n)}` : `-$${fmt(Math.abs(n))}`;
}

function pctSign(n: number): string {
  return n >= 0 ? `+${n.toFixed(1)}%` : `${n.toFixed(1)}%`;
}

export function formatPortfolioContext(data: PortfolioContextData): string {
  const lines: string[] = [];

  // Portfolio state
  lines.push("=== Portfolio State ===");
  lines.push(`USDC Balance: $${fmt(data.usdcBalance)}`);
  lines.push(`Total Portfolio Value: $${fmt(data.totalPortfolioValue)}`);
  const unrealizedPct = data.totalPortfolioValue > 0
    ? (data.unrealizedPnl / data.totalPortfolioValue) * 100 : 0;
  lines.push(`Unrealized P&L: ${sign(data.unrealizedPnl)} (${pctSign(unrealizedPct)})`);
  lines.push(`Today's P&L: ${sign(data.todayPnl)}`);
  lines.push("");

  // Positions
  lines.push("=== Active Positions (by conviction) ===");
  if (data.positions.length === 0) {
    lines.push("No active positions");
  } else {
    const sorted = [...data.positions].sort(
      (a, b) => (b.conviction ?? 0) - (a.conviction ?? 0)
    );
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      let line = `${i + 1}. "${p.marketQuestion}" — ${p.size} shares @ $${p.avgPrice.toFixed(2)} (now $${p.currentPrice.toFixed(2)})`;
      if (p.thesisText) {
        line += `\n   Thesis: ${p.thesisText}`;
      }
      if (p.conviction !== undefined) {
        line += ` | Conviction: ${p.conviction}`;
      }
      line += ` | Unrealized: ${sign(p.unrealizedPnl)}`;
      lines.push(line);

      if (p.conviction !== undefined && p.convictionAtEntry !== undefined) {
        const drop = p.convictionAtEntry - p.conviction;
        if (drop >= 10) {
          lines.push(`   ⚠️ Thesis conviction dropped ${drop}pts since entry`);
        }
      }
    }
  }
  lines.push("");

  // Theses
  lines.push("=== Active Theses (ranked by conviction) ===");
  const activeTheses = data.theses.filter((t) => t.status === "active");
  if (activeTheses.length === 0) {
    lines.push("No active theses");
  } else {
    const sorted = [...activeTheses].sort((a, b) => b.conviction - a.conviction);
    for (const t of sorted) {
      let line = `[${t.conviction}] ${t.text} — ${t.tradeCount} markets, ${t.wins} wins / ${t.losses} losses, ${sign(t.pnl)} PnL`;
      lines.push(line);
      if (t.pnl < 0 && t.tradeCount >= 3) {
        lines.push(`   ⚠️ Underperforming — consider retiring`);
      }
    }
  }
  lines.push("");

  // Goals
  if (data.goals.length > 0) {
    lines.push("=== Portfolio Goals ===");
    for (const g of data.goals) {
      const checkmark = g.status === "on track" ? "✓" : "⚠️";
      lines.push(`- ${g.description}: target ${g.target} → currently ${g.current} ${checkmark}`);
    }
    lines.push("");
  }

  // Recent outcomes
  if (data.recentOutcomes.length > 0) {
    lines.push("=== Recent Outcomes (last 7 days) ===");
    for (const o of data.recentOutcomes) {
      let line = `- CLOSED: "${o.marketQuestion}" — ${o.outcome.toUpperCase()}, ${sign(o.pnl)}, confidence was ${o.confidence}`;
      if (o.lesson) {
        line += `\n  Lesson: ${o.lesson}`;
      }
      lines.push(line);
    }
    lines.push("");
  }

  // Calibration
  if (data.calibration.length > 0) {
    lines.push("=== Calibration ===");
    for (const c of data.calibration) {
      const winPct = (c.winRate * 100).toFixed(0);
      const expPct = (c.expected * 100).toFixed(0);
      const label = c.error < -0.1 ? "overconfident ⚠️" : c.error > 0.1 ? "underconfident" : "well calibrated";
      lines.push(`Conviction ${c.bucket}: ${c.trades} trades, ${winPct}% win rate (expected ${expPct}%) — ${label}`);
    }
    lines.push("");
  }

  // Pending research
  if (data.pendingResearch.length > 0) {
    lines.push("=== Pending Research ===");
    for (const r of data.pendingResearch) {
      let line = `- "${r.marketQuestion}" — ${r.status}`;
      if (r.recommendation) line += `, recommendation: ${r.recommendation}`;
      lines.push(line);
    }
    lines.push("");
  }

  return lines.join("\n");
}
