# Polymarket Autonomous Trading Layer — Design Spec

**Date:** 2026-03-22
**Status:** Draft
**Scope:** Add fully autonomous trading capability to the Polymarket plugin, enabling the agent to develop theses, set portfolio goals, proactively discover markets, make independent trading decisions, and learn from outcomes.

---

## 1. Context

### Current State

The Polymarket plugin (`src/plugins/polymarket/`) is a **reactive tool-belt**: 13 actions, cached account state, rate limiting, async research, and post-trade risk evaluation. It works well when a human says "bet $5 on Miami Heat." Phase 1 audit fixes (C1–C6, H1–H11) have landed.

The elizaOS runtime provides:
- **AutonomyService** — 30s thinking loop, calls providers → LLM → actions → evaluators
- **PlanningService** — Multi-step tactical plan creation and execution
- **MemoryService** — Long-term memory extraction (episodic, semantic, procedural)
- **TaskService** — Background task workers (used by research already)
- **AwarenessRegistry** — Runtime self-awareness injected into LLM context
- **Cron plugin** — Scheduled recurring tasks

### The Gap

The autonomy loop exists but has **zero trading context**. No goals, no portfolio state, no thesis, no "what should I focus on." The LLM flies blind on every autonomous tick. The risk evaluator is advisory-only — it warns but never blocks. There is no mechanism for the agent to:
- Develop its own trading thesis
- Set portfolio goals
- Proactively discover and research markets
- Make risk-bounded trading decisions independently
- Learn from outcomes and update beliefs

### Goal

Build a fully autonomous trading agent (autonomy level 3) that develops its own market thesis, manages a portfolio within configurable constraints, and improves through outcome feedback — all using existing elizaOS extension points (providers, evaluators, task workers, actions). No core framework changes required.

### Prior Work

- `docs/superpowers/specs/2026-03-16-polymarket-plugin-audit-design.md` — Threat-model audit, Phase 1 fixes landed
- `docs/superpowers/specs/2026-03-13-plugin-polymarket-improvements-design.md` — API alignment and gap closure

---

## 2. Architecture Overview

```
Market Scanner (S6)          Strategy Evaluator (S5)
  scans every 2h               reflects every 6h
       ↓                              ↓
  Decision Queue              Conviction Updates
       ↓                       Lessons Learned
       ↓                              ↓
Portfolio Intelligence Provider (S2) ← Thesis Store (S4)
  assembles full context              ↑
       ↓                              |
Autonomous Decision Action (S7)       |
  decides: trade/research/wait        |
       ↓                              |
Pre-Trade Gate (S3) ──────────────────┘
  enforces constraints          updates thesis performance
       ↓
Existing placeOrder/closePosition actions
       ↓
Trade Journal (S1) → feeds back to Strategy Evaluator
```

Seven components, each independently useful and testable:

| # | Component | Type | Purpose |
|---|-----------|------|---------|
| S1 | Data Model | Types + Storage | Thesis, goals, trade journal structures |
| S2 | Portfolio Intelligence Provider | Provider | Rich context injection for autonomy loop |
| S3 | Pre-Trade Gate | Validation layer | Blocking constraint enforcement before execution |
| S4 | Thesis System | Service + Store | Thesis lifecycle: form → research → trade → update → retire |
| S5 | Strategy Evaluator | Evaluator | Post-trade journaling, periodic reflection, calibration |
| S6 | Market Scanner | Task Worker | Proactive market discovery aligned to theses |
| S7 | Autonomous Decision Action | Action | Executive decision-making from scanner output + context |

---

## 3. Data Model (S1)

### Trading Thesis

```typescript
interface TradingThesis {
  id: string;
  text: string;                    // "AI regulation will increase, benefiting compliance-focused companies"
  category: string;                // "politics", "crypto", "sports", etc.
  conviction: number;              // 0-100, updated by outcome feedback
  createdAt: number;
  updatedAt: number;
  supportingEvidence: string[];    // Research results, news, observations
  contradictingEvidence: string[]; // Evidence against — tracked for intellectual honesty
  relatedMarketIds: string[];      // Polymarket condition IDs mapped to this thesis
  status: "active" | "retired" | "invalidated";
  keyAssumptions: string[];        // What must be true for thesis to hold
  invalidationCriteria: string[];  // Pre-committed conditions that kill the thesis
  timeHorizon: "days" | "weeks" | "months";
  performanceHistory: {
    totalTrades: number;
    wins: number;
    losses: number;
    totalPnl: number;
    avgConfidenceAtEntry: number;
  };
}
```

### Portfolio Goal

```typescript
interface PortfolioGoal {
  id: string;
  type: "return_target" | "risk_limit" | "diversification" | "thesis_allocation";
  description: string;             // "Grow portfolio 20% this quarter"
  metric: string;                  // "total_pnl_pct" | "max_drawdown" | "position_count" | "thesis_concentration"
  target: number;
  current: number;                 // Live-computed from portfolio state
  timeframe?: { start: number; end: number };
  priority: "hard" | "soft";       // Hard = block trades that violate. Soft = warn only.
  status: "active" | "achieved" | "failed" | "expired";
}
```

### Trade Journal Entry

```typescript
interface TradeJournalEntry {
  id: string;
  tradeId: string;                 // CLOB order ID
  tokenId: string;
  marketQuestion: string;
  thesisId: string;                // Which thesis drove this trade
  entryThesis: string;             // Snapshot of reasoning at entry
  side: "buy" | "sell";
  entryPrice: number;
  entrySize: number;
  exitPrice?: number;
  exitTimestamp?: number;
  realizedPnl?: number;
  outcome?: "win" | "loss" | "breakeven" | "open";
  lessonLearned?: string;          // Agent-generated post-trade reflection
  confidenceAtEntry: number;
  confidenceAtExit?: number;
  createdAt: number;
}
```

### Conviction Update Log

```typescript
interface ConvictionUpdate {
  thesisId: string;
  previousConviction: number;
  newConviction: number;
  reason: string;
  evidence: string;
  timestamp: number;
}
```

### Calibration Record

```typescript
interface CalibrationRecord {
  convictionBucket: number;       // 50-60, 60-70, 70-80, 80-90, 90-100
  totalTrades: number;
  wins: number;
  expectedWinRate: number;        // Midpoint of bucket
  actualWinRate: number;
  calibrationError: number;       // actual - expected
}
```

### Storage

All structures use the elizaOS long-term memory system:
- **Theses and goals:** `SEMANTIC` type — embedded for vector search (find related theses by topic)
- **Journal entries and conviction updates:** `EPISODIC` type — chronological, queryable by tradeId/thesisId
- **Calibration records:** `SEMANTIC` type — rolling, recalculated during reflection
- **Lessons learned:** `PROCEDURAL` type — surfaced in future reflections and thesis formation

Key design choice: Thesis and goals are **agent-owned**, not user-set. The agent creates, updates, and retires them based on its own analysis. The user can view and override, but the default is agent-driven.

---

## 4. Portfolio Intelligence Provider (S2)

Separate from the existing `polymarketProvider` (which stays for reactive/conversational use). This provider targets the autonomy loop — heavier context, runs on the 30s autonomy tick.

### Data Sources

```
polymarketAutonomyProvider
  ├── reads PolymarketService cache (positions, balances, orders)
  ├── reads ThesisStore (active theses, conviction scores)
  ├── reads GoalStore (portfolio goals, progress)
  ├── reads TradeJournal (recent outcomes, lessons)
  ├── reads ResearchStorageService (pending/completed research)
  ├── reads CalibrationRecords (conviction accuracy history)
  ├── computes portfolio metrics (concentration, drawdown, P&L)
  └── formats into structured text for LLM context
```

### Output Format

```
=== Portfolio State ===
USDC Balance: $1,247.33
Total Portfolio Value: $3,891.50 (across 8 positions)
Unrealized P&L: +$234.12 (+6.4%)
Today's P&L: -$18.50 (-0.5%)

=== Active Positions (by conviction) ===
1. "Will AI regulation pass by Q3?" — 500 shares YES @ $0.62 (now $0.71)
   Thesis: AI regulation momentum | Conviction: 82 | Unrealized: +$45.00
2. "Bitcoin above $100k by Dec?" — 200 shares YES @ $0.45 (now $0.38)
   Thesis: Crypto bull cycle | Conviction: 65 | Unrealized: -$14.00
   ⚠️ Thesis conviction dropped 15pts since entry
...

=== Active Theses (ranked by conviction) ===
1. [82] AI regulation momentum — 3 markets, 2 wins / 0 losses, +$89 PnL
2. [65] Crypto bull cycle — 2 markets, 1 win / 1 loss, -$14 PnL
3. [45] Sports underdog value — 4 markets, 1 win / 2 losses, -$31 PnL
   ⚠️ Underperforming — consider retiring

=== Portfolio Goals ===
- Return target: +20% this quarter → currently +6.4% (on track)
- Max single position: 15% of portfolio → largest is 9.1% ✓
- Diversification: min 3 active theses → currently 3 ✓
- Max drawdown: -10% → worst was -3.2% ✓

=== Recent Outcomes (last 7 days) ===
- CLOSED: "Fed rate cut March?" — LOSS, -$22, confidence was 71
  Lesson: Overweighted consensus view, should have hedged
- CLOSED: "Tesla earnings beat?" — WIN, +$38, confidence was 58
  Lesson: Low-confidence contrarian bets paying off this cycle

=== Calibration ===
Conviction 50-60: 4 trades, 50% win rate (expected 55%) — well calibrated
Conviction 70-80: 6 trades, 42% win rate (expected 75%) — overconfident ⚠️

=== Pending Research ===
- "Will EU AI Act enforcement begin Q2?" — in progress (est. 15 min remaining)
- "NBA Finals MVP odds" — complete, recommendation: BUY YES @ $0.35, confidence 74
```

### Design Choices

- **Conviction-ranked positions.** Agent sees highest-conviction positions first. Positions where thesis conviction dropped since entry get flagged.
- **Goal violations surface as warnings.** LLM sees constraint proximity before proposing trades, not after.
- **Recent outcomes with lessons.** Keeps the feedback loop tight — agent sees its own past reasoning and whether it worked.
- **Calibration data.** Agent sees its own accuracy history to self-correct overconfidence.

---

## 5. Pre-Trade Gate (S3)

Replaces the advisory-only `tradeRiskEvaluator` with a blocking validation layer. Hooks into `placeOrderAction` and `closePositionAction` after LLM param extraction, before SDK order submission.

### Integration Point

```typescript
// In placeOrderAction handler, after param extraction:
const gateResult = await preTradeGate.evaluate({
  runtime, tokenId, side, price, size, dollarAmount, orderType,
  thesisId,       // Required for autonomous trades, optional for user-requested
  isAutonomous,   // true = stricter rules
});

if (!gateResult.allowed) {
  // Block trade, write reason to memory, inform callback
  return;
}
// Apply adjustments
if (gateResult.adjustedSize) size = gateResult.adjustedSize;
if (gateResult.adjustedPrice) price = gateResult.adjustedPrice;
// Proceed with existing order flow...
```

### Result Type

```typescript
interface PreTradeGateResult {
  allowed: boolean;
  adjustedSize?: number;        // Gate can reduce size, not just block
  adjustedPrice?: number;       // Gate can tighten price for safety
  reason?: string;              // Why blocked or adjusted
  warnings: string[];           // Advisory warnings even if allowed
  riskScore: number;            // 0-100, logged for every trade
}
```

### Hard Blocks (trade rejected)

| Check | Rule | Rationale |
|---|---|---|
| Balance sufficiency | `orderCost > availableBalance * 0.95` | Never spend last 5% — need gas and flexibility |
| No thesis | Autonomous trades must have a `thesisId` | Prevents random LLM-driven gambling |
| Thesis invalidated | `thesis.status === "invalidated"` | Don't add to positions on dead theses |
| Hard goal violation | Trade would breach a `priority: "hard"` goal | Goals are constraints, not suggestions |
| Market closed/inactive | Market is closed or resolved | Can't trade resolved markets |
| Duplicate position | Already holds >0 shares AND no thesis-based reason to add | Prevents accidental doubling |

### Soft Adjustments (trade modified)

| Check | Adjustment | Rationale |
|---|---|---|
| Conviction-based sizing | `maxSize = baseSize * (conviction / 100)` | Low conviction = small position |
| Concentration limit | Cap position at `maxPositionPct` of portfolio | Diversification enforcement |
| Spread too wide | Reduce to limit order at midpoint instead of market order | Don't pay wide spreads on illiquid markets |
| Drawdown proximity | Scale down size as drawdown approaches max | Progressive risk reduction |
| Calibration discount | Adjust conviction using historical calibration data | If agent is overconfident at 80%, size as 62% |

### Advisory Warnings (trade proceeds, warning logged)

| Check | Warning |
|---|---|
| Conviction dropped since last add | "Thesis conviction down 20pts since your last entry" |
| Negative thesis performance | "This thesis has -$50 P&L across 3 trades" |
| Correlated positions | "You already have 3 positions under this thesis" |
| Time decay risk | "Market resolves in <24h, limited time to exit if wrong" |

### Autonomy vs User-Requested

User-requested trades have a softer gate than autonomous trades. If a human says "bet $50 on X," the gate warns but doesn't block (unless it's a hard goal violation). When the agent trades autonomously, the gate is strict — no thesis = no trade, low conviction = reduced size. This prevents the LLM from YOLO-ing the portfolio while respecting human agency.

---

## 6. Thesis System (S4)

### Thesis Lifecycle

```
DISCOVER → FORM → RESEARCH → TRADE → OBSERVE → UPDATE → (repeat or RETIRE)
```

**Stage 1: Discovery.** Agent encounters a market or topic through: autonomous market scanning (S6), user conversation, research results mentioning adjacent topics, or market metadata changes (volume spikes, price moves).

**Stage 2: Formation.** Agent drafts a thesis via LLM call with structured output:

```typescript
interface ThesisFormationContext {
  trigger: string;              // What prompted this thesis
  marketData: string;           // Relevant markets, prices, volumes
  existingTheses: string;       // Agent's current theses (avoid duplicates/contradictions)
  recentLessons: string;        // What the agent learned recently
  portfolioState: string;       // Current exposure and goals
}

interface ThesisProposal {
  text: string;                 // The thesis statement
  category: string;
  initialConviction: number;    // 0-100, must justify
  reasoning: string;            // Why the agent believes this
  keyAssumptions: string[];     // What must be true
  invalidationCriteria: string[]; // What would kill this thesis
  relatedMarkets: string[];     // Markets to trade under this thesis
  timeHorizon: "days" | "weeks" | "months";
}
```

Key design choice: Agent must state `invalidationCriteria` upfront. Forces pre-commitment to "I'll stop believing this if X happens." Without this, theses become unfalsifiable and the agent never learns.

**Stage 3: Research.** Agent queues research tasks for related markets using existing `researchTaskWorker`. Results attach as `supportingEvidence` or `contradictingEvidence`.

**Stage 4: Trade.** Thesis reaches sufficient conviction → agent trades via the pre-trade gate. Journal entry records `thesisId` and `entryThesis` snapshot.

**Stage 5: Observe.** Periodic evaluation checks: market price movement, invalidation criteria, related market resolutions, new information availability.

**Stage 6: Update.** Conviction changes are logged with full audit trail. Agent can see its own conviction trajectory over time.

**Stage 7: Retirement.** Thesis moves to `retired` (played out, no more markets) or `invalidated` (invalidation criterion met). Positions under invalidated theses are closed. Lessons extracted first.

### Thesis Store Interface

```typescript
interface ThesisStore {
  create(proposal: ThesisProposal): Promise<TradingThesis>;
  update(id: string, update: Partial<TradingThesis>): Promise<void>;
  updateConviction(update: ConvictionUpdate): Promise<void>;
  retire(id: string, reason: string): Promise<void>;
  invalidate(id: string, criterion: string): Promise<void>;
  getActive(): Promise<TradingThesis[]>;
  getByCategory(category: string): Promise<TradingThesis[]>;
  getByMarket(marketId: string): Promise<TradingThesis[]>;
  getPerformanceSummary(): Promise<ThesisPerformanceSummary>;
}
```

Backed by elizaOS long-term memory (`SEMANTIC` type). Thesis text embedded for vector search — "do I already have a thesis about this?"

### Constraints

- **Max active theses:** Configurable, default 10. Agent must retire before creating new.
- **Min conviction to trade:** 50 by default. Below that, thesis exists but doesn't drive trades.
- **Contradiction detection:** LLM checks new thesis against existing theses during formation. Contradictory theses can't both be active.
- **Conviction decay:** If conviction drops below 30 and stays there for 7 days, auto-flagged for review.

---

## 7. Strategy Evaluator (S5)

Closes the gap between "agent that trades" and "agent that gets better at trading." Two modes: post-trade (immediate) and periodic reflection.

### Post-Trade Evaluation

Triggers immediately after every order fill. Records journal entry, updates thesis trade count, snapshots portfolio metrics.

On position close or market resolution, additionally captures: exit price, realized P&L, outcome classification, confidence at exit. Updates thesis performance history (wins, losses, total P&L).

### Periodic Reflection

Runs every 6 hours via the autonomy loop. LLM receives:
- Open positions and current P&L
- Trades closed since last reflection (with entry thesis and what happened)
- Active theses and performance
- Previous reflection summary
- Calibration data

Structured output:

```typescript
interface ReflectionResult {
  tradeLessons: {
    tradeId: string;
    lesson: string;
    wasThesisCorrect: boolean;    // Separate from P&L — thesis can be right and lose
    luckFactor: "skill" | "mixed" | "luck";
  }[];
  convictionUpdates: ConvictionUpdate[];
  thesisRetirements: { thesisId: string; reason: string }[];
  thesisInvalidations: { thesisId: string; criterion: string }[];
  newThesisProposals: string[];   // Brief descriptions, full formation separate
  selfAssessment: {
    overconfidenceBias: number;   // -1 to 1
    recentEdge: string;           // "Event-driven theses outperforming macro"
    blindSpots: string[];
  };
  nextReflectionFocus: string;
}
```

### Calibration Tracking

Builds over time: for each conviction bucket (50–60, 60–70, etc.), tracks total trades, wins, expected vs actual win rate. Surfaces in portfolio intelligence provider. Pre-trade gate can use calibration data to discount conviction for position sizing.

### Memory Storage

| Data | Memory Type | Retention |
|---|---|---|
| Trade journal entries | `EPISODIC` | Permanent |
| Conviction updates | `EPISODIC` | Permanent |
| Reflection results | `SEMANTIC` | Permanent |
| Calibration records | `SEMANTIC` | Rolling (recalculated) |
| Lessons learned | `PROCEDURAL` | Permanent, surfaced in future reflections |

---

## 8. Market Scanner (S6)

Background task worker running every 2 hours. Three scan modes per cycle.

### Mode 1: Thesis-Aligned Scan

For each active thesis, extract search terms from thesis text + key assumptions, search Gamma API, filter out already-tracked markets, score relevance.

### Mode 2: Opportunity Scan

Look for market inefficiencies regardless of thesis:
- New markets with high volume (attracting attention)
- Markets where price moved >10% in 24h (something happened)
- Markets with wide spreads but high volume (LP opportunity)
- Markets resolving within 7 days (time-sensitive)

### Mode 3: Portfolio Health Scan

Monitor existing positions:
- Significant price moves since last check
- Markets approaching resolution date
- Positions with deteriorating liquidity (order book thinning)
- Markets where new information may affect thesis

### Scanner Output → Decision Queue

Scanner produces a prioritized queue consumed by the autonomous decision action (S7):

```typescript
interface ScannerResult {
  timestamp: number;
  opportunities: {
    market: SimplifiedMarket;
    relevanceScore: number;       // 0-100
    matchedThesisId?: string;
    matchReason: string;
    suggestedAction: "research" | "watch" | "trade";
    urgency: "low" | "medium" | "high";
  }[];
  positionAlerts: {
    tokenId: string;
    alertType: "price_move" | "near_resolution" | "liquidity_drop" | "thesis_invalidation";
    severity: "info" | "warning" | "critical";
    detail: string;
    suggestedAction: "hold" | "add" | "reduce" | "close" | "research";
  }[];
}
```

Auto-triggers: research for relevance >80 opportunities; urgent queue push for critical-severity position alerts. Never auto-trades — all execution goes through the autonomous decision action.

### Rate Limiting & Cost Control

| Constraint | Default | Rationale |
|---|---|---|
| Max scans per day | 12 (every 2h) | Stay within Gamma rate limits |
| Max search queries per scan | 15 | ~5 per active thesis × 3 theses |
| Max new markets evaluated per scan | 30 | Don't flood decision queue |
| Max research triggers per scan | 2 | Research is expensive (OpenAI deep research) |
| LLM calls per scan | ~5–8 | Search term extraction + relevance scoring |
| Scan timeout | 5 minutes | Kill if API slow, try next cycle |

Respects existing `TokenBucketRateLimiter`. Runs at low priority — user-initiated actions take precedence over scanner API calls.

### Scheduling

Registered as recurring task during plugin init:

```typescript
runtime.registerTaskWorker(marketScannerWorker);
await runtime.createTask({
  name: "POLYMARKET_MARKET_SCANNER",
  recurring: true,
  intervalMs: 2 * 60 * 60 * 1000, // 2 hours
});
```

---

## 9. Autonomous Decision Action (S7)

The executive. Called by the autonomy loop when the LLM decides to act.

### Cadence Control

Not every 30s tick should produce action. Internal minimum intervals:

| Decision type | Min interval | Rationale |
|---|---|---|
| Execute trade | 15 minutes | Don't rapid-fire trades |
| Trigger research | 1 hour | Research is expensive |
| Form new thesis | 6 hours | Theses need thought, not impulse |
| Retire/invalidate thesis | No limit | Cutting losses shouldn't wait |
| Close position (critical alert) | No limit | Risk management is immediate |
| Adjust conviction | 1 hour | Prevent oscillation |

### Decision Prompt

LLM receives full portfolio intelligence provider output plus the decision queue from the scanner. Prompted to decide for each queue item: act, defer, or dismiss.

### Structured Output

```typescript
interface AutonomousDecision {
  reasoning: string;              // 2-3 sentences overall thinking
  actions: DecisionAction[];
  deferred: { queueItemId: string; reason: string; revisitAfter: number }[];
  dismissed: { queueItemId: string; reason: string }[];
  doNothing?: string;             // If no actions: why waiting is correct
}

type DecisionAction =
  | { type: "close_position"; tokenId: string; reason: string; urgency: "immediate" | "limit_at_bid" }
  | { type: "place_trade"; tokenId: string; thesisId: string; side: "buy" | "sell";
      dollarAmount: number; sizingReason: string; priceType: "market" | "limit"; limitPrice?: number }
  | { type: "queue_research"; marketQuestion: string; relatedThesisId?: string }
  | { type: "form_thesis"; description: string; trigger: string }
  | { type: "update_conviction"; thesisId: string; newConviction: number; reason: string }
  | { type: "retire_thesis"; thesisId: string; reason: string }
  | { type: "invalidate_thesis"; thesisId: string; criterion: string }
```

### Execution Pipeline

Dispatches to existing actions (which go through the pre-trade gate):
- `close_position` → `POLYMARKET_CLOSE_POSITION`
- `place_trade` → `POLYMARKET_PLACE_ORDER` (through pre-trade gate)
- `queue_research` → `POLYMARKET_RESEARCH_MARKET`
- `form_thesis` → ThesisStore.create (via thesis formation LLM flow)
- `update_conviction` → ThesisStore.updateConviction
- `retire_thesis` / `invalidate_thesis` → Close all positions under thesis, then ThesisStore.retire/invalidate

### Decision Logging

Every decision logged to memory (`polymarket_decisions` table) — actions taken, deferrals, dismissals, and explicit "do nothing" decisions with reasoning. This feeds the strategy evaluator's reflection cycle.

### Kill Switch

```typescript
POLYMARKET_AUTONOMOUS_ENABLED: z.string().optional().default("true"),
POLYMARKET_AUTONOMOUS_TRADE_ENABLED: z.string().optional().default("true"),
```

- `AUTONOMOUS_ENABLED=false` → Scanner still runs, decisions still logged, but NO execution
- `AUTONOMOUS_TRADE_ENABLED=false` → Scanner, research, thesis management work, but NO trades placed
- User can toggle via conversation: "stop trading autonomously"

---

## 10. Implementation Phases

Each phase is independently useful and testable.

### Phase 1: Portfolio Intelligence + Pre-Trade Gate

**Delivers:** Rich autonomy context + blocking constraint enforcement.

- Data model types (S1) — all interfaces
- ThesisStore and GoalStore with in-memory + long-term memory backing
- TradeJournal store
- Portfolio intelligence provider (S2)
- Pre-trade gate (S3) integrated into placeOrderAction and closePositionAction
- Configuration keys for all thresholds

**Value:** Agent stops being blind in autonomy loop. Trades have guardrails. Foundation for everything else.

### Phase 2: Thesis System + Strategy Evaluator

**Delivers:** The agent's brain and learning loop.

- Thesis formation flow with LLM (S4 stages 1–2)
- Thesis store CRUD operations
- Conviction update logging
- Post-trade journal recording (S5 post-trade mode)
- Periodic reflection evaluator (S5 reflection mode)
- Calibration tracking
- Conviction decay detection

**Value:** Agent can form beliefs, track their performance, and learn from outcomes.

### Phase 3: Market Scanner + Autonomous Decision Action

**Delivers:** Full autonomy.

- Market scanner task worker with 3 scan modes (S6)
- Decision queue
- Autonomous decision action (S7)
- Cadence control
- Decision logging
- Kill switch configuration
- Cron scheduling

**Value:** Agent proactively discovers opportunity and acts on it.

### Phase 4: Polish + Hardening

**Delivers:** Production readiness.

- Integration tests for full autonomous cycle (scan → decide → trade → reflect)
- Calibration discount in pre-trade gate
- Contradiction detection in thesis formation
- Portfolio health alerts escalation
- User-facing commands: "show me your theses", "what are you thinking about trading?", "stop trading"
- Metrics/observability: decision rate, win rate, calibration error, thesis lifecycle stats

---

## 11. New Files

```
src/plugins/polymarket/autonomous/
  ├── types.ts                    # TradingThesis, PortfolioGoal, TradeJournalEntry, etc.
  ├── stores/
  │   ├── thesisStore.ts          # ThesisStore — CRUD backed by long-term memory
  │   ├── goalStore.ts            # GoalStore — portfolio goal management
  │   ├── tradeJournal.ts         # TradeJournal — trade entry/exit recording
  │   └── decisionQueue.ts        # DecisionQueue — scanner output buffer
  ├── providers/
  │   └── portfolioIntelligence.ts # Autonomy-loop provider (S2)
  ├── gates/
  │   └── preTrade.ts             # Pre-trade gate (S3)
  ├── thesis/
  │   └── formation.ts            # Thesis formation LLM flow (S4)
  ├── evaluators/
  │   └── strategyEvaluator.ts    # Post-trade + periodic reflection (S5)
  ├── workers/
  │   └── marketScanner.ts        # Market scanner task worker (S6)
  ├── actions/
  │   └── autonomousDecision.ts   # Autonomous decision action (S7)
  └── index.ts                    # Registers all autonomous components
```

### Modified Files

| File | Changes |
|------|---------|
| `src/plugins/polymarket/index.ts` | Import and register autonomous components, add config keys |
| `src/plugins/polymarket/actions/placeOrder.ts` | Integrate pre-trade gate call |
| `src/plugins/polymarket/actions/closePosition.ts` | Integrate pre-trade gate call |
| `src/plugins/polymarket/types.ts` | Export new autonomous types |
| `src/plugins/polymarket/constants.ts` | Add new config key names and defaults |

---

## 12. Configuration

New environment variables (all optional with sensible defaults):

| Variable | Default | Purpose |
|---|---|---|
| `POLYMARKET_AUTONOMOUS_ENABLED` | `true` | Master switch for autonomous features |
| `POLYMARKET_AUTONOMOUS_TRADE_ENABLED` | `true` | Allow autonomous trade execution |
| `POLYMARKET_MAX_ACTIVE_THESES` | `10` | Max concurrent active theses |
| `POLYMARKET_MIN_TRADE_CONVICTION` | `50` | Min thesis conviction to place trade |
| `POLYMARKET_CONVICTION_DECAY_THRESHOLD` | `30` | Below this for 7 days = auto-flag |
| `POLYMARKET_REFLECTION_INTERVAL_MS` | `21600000` | Reflection cycle (default 6h) |
| `POLYMARKET_SCAN_INTERVAL_MS` | `7200000` | Scanner cycle (default 2h) |
| `POLYMARKET_MIN_TRADE_INTERVAL_MS` | `900000` | Min gap between autonomous trades (15m) |
| `POLYMARKET_MAX_RESEARCH_PER_SCAN` | `2` | Max research triggers per scan |
| `POLYMARKET_SCAN_TIMEOUT_MS` | `300000` | Scanner timeout (5m) |
| `POLYMARKET_BALANCE_RESERVE_PCT` | `5` | % of balance to always reserve |

---

## 13. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| LLM hallucinated thesis leads to bad trades | Pre-trade gate requires thesis with invalidation criteria. Conviction-based sizing limits exposure on new theses. |
| Runaway trading in volatile markets | Cadence control (min 15m between trades). Kill switch. Max drawdown goal as hard constraint. |
| Research costs (OpenAI) accumulate | Max 2 research triggers per scan. Scanner budget configurable. |
| Thesis sprawl (too many unfocused theses) | Max active theses cap. Contradiction detection. Conviction decay auto-flagging. |
| Agent becomes overconfident | Calibration tracking discounts conviction for position sizing. Self-assessment in reflection. |
| Stale data in autonomy context | Portfolio provider reads fresh cache from PolymarketService (30m TTL). Scanner refreshes market data every 2h. |
| Agent can't exit positions fast enough | Critical alerts skip cadence control. Invalidation → immediate close attempt. Fallback from market to limit order. |
