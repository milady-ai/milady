import { useEffect, useMemo, useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import {
  type BillingSettingsResponse,
  type CreditsSummaryResponse,
  formatMoney,
} from "../../lib/billing-types";
import { CloudClient, type CreditBalance } from "../../lib/cloud-api";
import {
  MIN_DEPOSIT_DISPLAY,
  PRICE_IDLE_HR_VALUE,
  PRICE_IDLE_PER_HR,
  PRICE_RUNNING_HR_VALUE,
  PRICE_RUNNING_PER_HR,
} from "../../lib/pricing-constants";
import { useAuth } from "../../lib/useAuth";

/* ── Credit pack definitions ─────────────────────────────────────────── */

interface CreditPack {
  name: string;
  price: number;
  credits: number;
  bonus: number; // percentage bonus (0 = no bonus)
  highlight?: boolean;
}

const CREDIT_PACKS: CreditPack[] = [
  { name: "STARTER", price: 5, credits: 500, bonus: 0 },
  { name: "STANDARD", price: 13, credits: 1500, bonus: 15, highlight: true },
  { name: "PRO", price: 40, credits: 5000, bonus: 25 },
  { name: "BULK", price: 100, credits: 15000, bonus: 50 },
];

/* ── Component ───────────────────────────────────────────────────────── */

export function CreditsPanel() {
  const { isAuthenticated: authed, token } = useAuth();
  const { agents } = useAgents();
  const cloudAgents = agents.filter((a) => a.source === "cloud");

  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [session, setSession] = useState<{
    credits?: number;
    requests?: number;
    tokens?: number;
  } | null>(null);
  const [billingSettings, setBillingSettings] =
    useState<BillingSettingsResponse | null>(null);
  const [creditsSummary, setCreditsSummary] =
    useState<CreditsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "purchase" | "history"
  >("overview");

  useEffect(() => {
    if (!authed || !token) {
      setCredits(null);
      setSession(null);
      setBillingSettings(null);
      setCreditsSummary(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const cc = new CloudClient(token);
    Promise.all([
      cc.getCreditsBalance().catch(() => null),
      cc.getCurrentSession().catch(() => null),
      cc.getBillingSettings().catch(() => null),
      cc.getCreditsSummary().catch(() => null),
    ])
      .then(([creds, sess, settings, summary]) => {
        if (creds) setCredits(creds);
        if (sess) setSession(sess);
        if (settings) setBillingSettings(settings as BillingSettingsResponse);
        if (summary) setCreditsSummary(summary as CreditsSummaryResponse);
        if (!creds && !settings && !summary) {
          setError("Could not load credit data");
        }
      })
      .finally(() => setLoading(false));
  }, [authed, token]);

  /* ── Derived usage stats ────────────────────────────────────────── */

  // Memoize these filter results so the hourlyBurn useMemo has stable dependencies
  const runningAgents = useMemo(
    () =>
      cloudAgents.filter(
        (a) => a.status === "running" || a.status === "provisioning",
      ),
    [cloudAgents],
  );
  const idleAgents = useMemo(
    () =>
      cloudAgents.filter(
        (a) => a.status === "paused" || a.status === "stopped",
      ),
    [cloudAgents],
  );

  const hourlyBurn = useMemo(() => {
    const runningCost = runningAgents.reduce(
      (sum, a) => sum + (a.billing?.costPerHour ?? PRICE_RUNNING_HR_VALUE),
      0,
    );
    const idleCost = idleAgents.reduce(
      (sum, a) => sum + (a.billing?.costPerHour ?? PRICE_IDLE_HR_VALUE),
      0,
    );
    return runningCost + idleCost;
  }, [runningAgents, idleAgents]);

  const dailyBurn = hourlyBurn * 24;
  const monthlyBurn = dailyBurn * 30;

  const balance =
    credits?.balance ?? creditsSummary?.organization?.creditBalance ?? null;

  const daysRemaining = useMemo(() => {
    if (balance == null || dailyBurn <= 0) return null;
    return Math.floor(balance / dailyBurn);
  }, [balance, dailyBurn]);

  const isLowBalance = balance != null && balance < dailyBurn * 3; // less than 3 days
  const isCriticalBalance = balance != null && balance < dailyBurn; // less than 1 day

  const autoTopUp = billingSettings?.settings?.autoTopUp;
  const org = creditsSummary?.organization;
  const agentSummary = creditsSummary?.agentsSummary;
  const pricing = creditsSummary?.pricing;

  /* ── Unauthenticated state ─────────────────────────────────────── */

  if (!authed) {
    return (
      <div className="border border-border bg-surface animate-[fade-up_0.4s_ease-out_both]">
        <div className="px-4 py-2.5 bg-dark-secondary border-b border-border">
          <span className="font-mono text-xs text-text-muted">
            $ credits --status
          </span>
        </div>
        <div className="p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 border border-border-subtle bg-dark mb-4">
            <span className="font-mono text-2xl text-text-subtle">$</span>
          </div>
          <h3 className="font-mono text-sm text-text-light mb-2">
            NOT AUTHENTICATED
          </h3>
          <p className="font-mono text-xs text-text-muted max-w-sm mx-auto">
            Sign in with Eliza Cloud to view credits, usage, and billing.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-[fade-up_0.4s_ease-out_both]">
        <div className="h-8 w-32 bg-surface animate-[shimmer_1.8s_ease-in-out_infinite] bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface-elevated)_40%,var(--color-surface)_80%)] bg-[length:200%_100%]" />
        <div className="h-40 bg-surface animate-[shimmer_1.8s_ease-in-out_infinite] bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface-elevated)_40%,var(--color-surface)_80%)] bg-[length:200%_100%]" />
        <div className="grid grid-cols-4 gap-px">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 bg-surface animate-[shimmer_1.8s_ease-in-out_infinite] bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface-elevated)_40%,var(--color-surface)_80%)] bg-[length:200%_100%]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-border bg-surface animate-[fade-up_0.4s_ease-out_both]">
        <div className="px-4 py-2.5 bg-dark-secondary border-b border-border">
          <span className="font-mono text-xs text-red-400">
            $ credits --status [FAILED]
          </span>
        </div>
        <div className="p-6 text-center">
          <p className="font-mono text-xs text-red-400 mb-3">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="font-mono text-xs text-text-muted hover:text-text-light transition-colors"
          >
            [retry]
          </button>
        </div>
      </div>
    );
  }

  /* ── Main panel ────────────────────────────────────────────────── */

  return (
    <div className="space-y-6 max-w-5xl animate-[fade-up_0.4s_ease-out_both]">
      {/* Header */}
      <div>
        <h2 className="font-mono text-lg font-medium text-text-light tracking-wide">
          CREDITS &amp; BILLING
        </h2>
        <p className="font-mono text-xs text-text-muted mt-1">
          Balance, usage estimates, and billing configuration
        </p>
      </div>

      {/* ── Balance Hero + Burn Rate ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-px bg-border">
        {/* Balance */}
        <div
          className={`p-6 ${
            isCriticalBalance
              ? "bg-red-500/5 border-r border-red-500/20"
              : isLowBalance
                ? "bg-amber-500/5 border-r border-amber-500/20"
                : "bg-brand/5 border-r border-brand/20"
          }`}
        >
          <div className="flex items-start justify-between mb-1">
            <p className="font-mono text-[10px] tracking-[0.15em] text-text-subtle">
              CURRENT BALANCE
            </p>
            {isCriticalBalance && (
              <span className="font-mono text-[9px] tracking-wider px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20">
                CRITICAL
              </span>
            )}
            {isLowBalance && !isCriticalBalance && (
              <span className="font-mono text-[9px] tracking-wider px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20">
                LOW
              </span>
            )}
          </div>
          <p
            className={`font-mono text-4xl font-semibold tabular-nums tracking-tight ${
              isCriticalBalance
                ? "text-red-400"
                : isLowBalance
                  ? "text-amber-400"
                  : "text-brand"
            }`}
          >
            {balance?.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) ?? "—"}
          </p>
          <p className="font-mono text-xs text-text-muted mt-1">
            {credits?.currency ?? "credits"}
          </p>

          {/* Balance duration estimate */}
          {daysRemaining != null && (
            <div className="mt-4 pt-3 border-t border-border-subtle">
              <p className="font-mono text-[10px] text-text-subtle">
                AT CURRENT USAGE
              </p>
              <p
                className={`font-mono text-sm font-medium mt-0.5 ${
                  daysRemaining < 1
                    ? "text-red-400"
                    : daysRemaining < 7
                      ? "text-amber-400"
                      : "text-emerald-400"
                }`}
              >
                {daysRemaining < 1
                  ? "Less than 1 day remaining"
                  : daysRemaining === 1
                    ? "~1 day remaining"
                    : `~${daysRemaining} days remaining`}
              </p>
            </div>
          )}
        </div>

        {/* Burn rate */}
        <div className="bg-surface p-6">
          <p className="font-mono text-[10px] tracking-[0.15em] text-text-subtle mb-3">
            BURN RATE
          </p>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs text-text-muted">Hourly</span>
              <span className="font-mono text-lg font-semibold text-text-light tabular-nums">
                ${hourlyBurn.toFixed(4)}
                <span className="text-xs font-normal text-text-muted">/hr</span>
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs text-text-muted">Daily</span>
              <span className="font-mono text-sm text-text-light tabular-nums">
                ${dailyBurn.toFixed(2)}
                <span className="text-xs font-normal text-text-muted">
                  /day
                </span>
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs text-text-muted">
                Monthly (est.)
              </span>
              <span className="font-mono text-sm text-text-light tabular-nums">
                ${monthlyBurn.toFixed(2)}
                <span className="text-xs font-normal text-text-muted">/mo</span>
              </span>
            </div>
          </div>

          {/* Agent breakdown */}
          <div className="mt-4 pt-3 border-t border-border-subtle">
            <div className="flex items-center justify-between text-[10px] font-mono text-text-subtle">
              <span>
                {runningAgents.length} running × {PRICE_RUNNING_PER_HR}/hr
              </span>
              <span>
                ${(runningAgents.length * PRICE_RUNNING_HR_VALUE).toFixed(4)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-text-subtle mt-1">
              <span>
                {idleAgents.length} idle × {PRICE_IDLE_PER_HR}/hr
              </span>
              <span>
                ${(idleAgents.length * PRICE_IDLE_HR_VALUE).toFixed(4)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Low balance warning ─────────────────────────────────── */}
      {isLowBalance && (
        <div
          className={`flex items-center gap-3 px-4 py-3 border ${
            isCriticalBalance
              ? "border-red-500/30 bg-red-500/5"
              : "border-amber-500/30 bg-amber-500/5"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${isCriticalBalance ? "bg-red-500 animate-pulse" : "bg-amber-500"}`}
          />
          <p
            className={`font-mono text-xs ${isCriticalBalance ? "text-red-400" : "text-amber-400"}`}
          >
            {isCriticalBalance
              ? "Balance critically low — agents may be suspended soon. Top up now."
              : "Balance running low — consider adding credits to avoid interruption."}
          </p>
        </div>
      )}

      {/* ── Tab navigation ──────────────────────────────────────── */}
      <div className="flex border-b border-border">
        {(
          [
            { key: "overview", label: "OVERVIEW" },
            { key: "purchase", label: "PURCHASE" },
            { key: "history", label: "HISTORY" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2.5 font-mono text-[11px] tracking-wider transition-all
              ${
                activeTab === tab.key
                  ? "text-brand border-b-2 border-brand -mb-px"
                  : "text-text-muted hover:text-text-light"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Stats grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
            <DataCell
              label="CLOUD AGENTS"
              value={String(cloudAgents.length)}
              sub={`${runningAgents.length} running, ${idleAgents.length} idle`}
            />
            <DataCell
              label="ALLOCATED"
              value={formatMoney(agentSummary?.totalAllocated)}
              sub={`${agentSummary?.withBudget ?? 0} with budgets`}
            />
            <DataCell
              label="SPENT"
              value={formatMoney(agentSummary?.totalSpent)}
              sub={`${agentSummary?.paused ?? 0} paused`}
            />
            <DataCell
              label="AVAILABLE"
              value={formatMoney(agentSummary?.totalAvailable)}
              sub={
                pricing?.creditsPerDollar
                  ? `${pricing.creditsPerDollar} credits/$`
                  : undefined
              }
            />
          </div>

          {/* Session stats */}
          {session && (
            <div className="border border-border bg-surface">
              <div className="px-4 py-2 bg-dark-secondary border-b border-border">
                <span className="font-mono text-[10px] tracking-wider text-text-subtle">
                  CURRENT SESSION
                </span>
              </div>
              <div className="grid grid-cols-3 gap-px bg-border">
                <MiniDataCell label="REQUESTS" value={session.requests} />
                <MiniDataCell label="TOKENS" value={session.tokens} />
                <MiniDataCell label="CREDITS USED" value={session.credits} />
              </div>
            </div>
          )}

          {/* Pricing reference */}
          <div className="border border-border bg-surface">
            <div className="px-4 py-2 bg-dark-secondary border-b border-border flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-wider text-text-subtle">
                PRICING
              </span>
              <span className="font-mono text-[10px] tracking-wider text-text-subtle">
                $ milady pricing --show
              </span>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-border-subtle bg-dark p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <p className="font-mono text-[9px] tracking-wider text-text-subtle">
                      RUNNING AGENT
                    </p>
                  </div>
                  <p className="font-mono text-xl font-semibold text-brand tabular-nums">
                    {PRICE_RUNNING_PER_HR}
                    <span className="text-xs font-normal text-text-muted">
                      /hr
                    </span>
                  </p>
                  <p className="font-mono text-[10px] text-text-subtle mt-1">
                    ≈ ${(PRICE_RUNNING_HR_VALUE * 24 * 30).toFixed(2)}/month
                  </p>
                </div>
                <div className="border border-border-subtle bg-dark p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <p className="font-mono text-[9px] tracking-wider text-text-subtle">
                      IDLE AGENT
                    </p>
                  </div>
                  <p className="font-mono text-xl font-semibold text-text-light tabular-nums">
                    {PRICE_IDLE_PER_HR}
                    <span className="text-xs font-normal text-text-muted">
                      /hr
                    </span>
                  </p>
                  <p className="font-mono text-[10px] text-text-subtle mt-1">
                    ≈ ${(PRICE_IDLE_HR_VALUE * 24 * 30).toFixed(2)}/month
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Auto top-up & billing */}
          <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="border border-border bg-surface">
              <div className="px-4 py-2 bg-dark-secondary border-b border-border flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-wider text-text-subtle">
                  AUTO TOP-UP
                </span>
                <span
                  className={`font-mono text-[10px] tracking-wider px-2 py-0.5 ${
                    autoTopUp?.enabled || org?.autoTopUpEnabled
                      ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                      : "text-text-subtle bg-dark border border-border-subtle"
                  }`}
                >
                  {autoTopUp?.enabled || org?.autoTopUpEnabled
                    ? "● ENABLED"
                    : "○ DISABLED"}
                </span>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-text-muted">
                    Payment method
                  </span>
                  <span
                    className={`font-mono text-xs ${
                      autoTopUp?.hasPaymentMethod || org?.hasPaymentMethod
                        ? "text-brand"
                        : "text-red-400"
                    }`}
                  >
                    {autoTopUp?.hasPaymentMethod || org?.hasPaymentMethod
                      ? "✓ ON FILE"
                      : "✗ NONE"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1">
                      THRESHOLD
                    </p>
                    <p className="font-mono text-sm text-text-light tabular-nums">
                      {formatMoney(
                        autoTopUp?.threshold ??
                          org?.autoTopUpThreshold ??
                          undefined,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1">
                      AMOUNT
                    </p>
                    <p className="font-mono text-sm text-text-light tabular-nums">
                      {formatMoney(
                        autoTopUp?.amount ?? org?.autoTopUpAmount ?? undefined,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1">
                      MIN TOP-UP
                    </p>
                    <p className="font-mono text-sm text-text-light tabular-nums">
                      {formatMoney(pricing?.minimumTopUp)}
                    </p>
                  </div>
                </div>
                {billingSettings?.settings?.limits && (
                  <p className="font-mono text-[10px] text-text-subtle pt-2 border-t border-border-subtle">
                    Range:{" "}
                    {formatMoney(billingSettings.settings.limits.minAmount)} to{" "}
                    {formatMoney(billingSettings.settings.limits.maxAmount)}
                  </p>
                )}
              </div>
            </div>

            <div className="border border-border bg-surface">
              <div className="px-4 py-2 bg-dark-secondary border-b border-border">
                <span className="font-mono text-[10px] tracking-wider text-text-subtle">
                  ACCOUNT
                </span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-text-muted">
                    Credits / USD
                  </span>
                  <span className="font-mono text-xs text-text-light tabular-nums">
                    {pricing?.creditsPerDollar ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-text-muted">
                    Tracked agents
                  </span>
                  <span className="font-mono text-xs text-text-light tabular-nums">
                    {agentSummary?.total ?? cloudAgents.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-text-muted">
                    Min deposit
                  </span>
                  <span className="font-mono text-xs text-text-light tabular-nums">
                    {pricing?.minimumTopUp != null
                      ? `$${pricing.minimumTopUp.toFixed(2)}`
                      : MIN_DEPOSIT_DISPLAY}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Purchase ────────────────────────────────────────── */}
      {activeTab === "purchase" && (
        <div className="space-y-6">
          {/* Credit packs */}
          <div className="border border-border bg-surface">
            <div className="px-4 py-2.5 bg-dark-secondary border-b border-border flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-wider text-text-subtle">
                CREDIT PACKS
              </span>
              <span className="font-mono text-[10px] tracking-wider text-text-subtle">
                $ milady credits --buy
              </span>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {CREDIT_PACKS.map((pack) => (
                  <CreditPackCard key={pack.name} pack={pack} />
                ))}
              </div>

              <p className="font-mono text-[10px] text-text-subtle mt-5 pt-3 border-t border-border-subtle">
                Minimum deposit:{" "}
                {pricing?.minimumTopUp != null
                  ? `$${pricing.minimumTopUp.toFixed(2)}`
                  : MIN_DEPOSIT_DISPLAY}{" "}
                • Credits are non-refundable • Prices in USD
              </p>
            </div>
          </div>

          {/* Cost calculator */}
          <div className="border border-border bg-surface">
            <div className="px-4 py-2.5 bg-dark-secondary border-b border-border">
              <span className="font-mono text-[10px] tracking-wider text-text-subtle">
                COST CALCULATOR
              </span>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <CostEstimate
                  label="1 AGENT"
                  sublabel="running 24/7"
                  monthly={PRICE_RUNNING_HR_VALUE * 24 * 30}
                />
                <CostEstimate
                  label="3 AGENTS"
                  sublabel="running 24/7"
                  monthly={PRICE_RUNNING_HR_VALUE * 24 * 30 * 3}
                />
                <CostEstimate
                  label="5 AGENTS"
                  sublabel="2 running + 3 idle"
                  monthly={
                    PRICE_RUNNING_HR_VALUE * 24 * 30 * 2 +
                    PRICE_IDLE_HR_VALUE * 24 * 30 * 3
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: History ─────────────────────────────────────────── */}
      {activeTab === "history" && (
        <div className="space-y-6">
          {/* Session usage */}
          {session && (
            <div className="border border-border bg-surface">
              <div className="px-4 py-2 bg-dark-secondary border-b border-border">
                <span className="font-mono text-[10px] tracking-wider text-text-subtle">
                  CURRENT SESSION
                </span>
              </div>
              <div className="grid grid-cols-3 gap-px bg-border">
                <MiniDataCell label="REQUESTS" value={session.requests} />
                <MiniDataCell label="TOKENS" value={session.tokens} />
                <MiniDataCell label="CREDITS USED" value={session.credits} />
              </div>
            </div>
          )}

          {/* Transaction history / per-agent breakdown */}
          <div className="border border-border bg-surface">
            <div className="px-4 py-2.5 bg-dark-secondary border-b border-border flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-wider text-text-subtle">
                RECENT TRANSACTIONS
              </span>
              <span className="font-mono text-[10px] tracking-wider text-text-subtle">
                $ milady credits --history
              </span>
            </div>
            <div className="p-5">
              {cloudAgents.length > 0 ? (
                <div className="space-y-0">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 pb-2 border-b border-border-subtle mb-2">
                    <span className="font-mono text-[9px] tracking-wider text-text-subtle">
                      AGENT
                    </span>
                    <span className="font-mono text-[9px] tracking-wider text-text-subtle text-right">
                      STATUS
                    </span>
                    <span className="font-mono text-[9px] tracking-wider text-text-subtle text-right">
                      RATE
                    </span>
                    <span className="font-mono text-[9px] tracking-wider text-text-subtle text-right">
                      ACCRUED
                    </span>
                  </div>
                  {cloudAgents.map((agent) => {
                    const isRunning =
                      agent.status === "running" ||
                      agent.status === "provisioning";
                    const rate =
                      agent.billing?.costPerHour ??
                      (isRunning
                        ? PRICE_RUNNING_HR_VALUE
                        : PRICE_IDLE_HR_VALUE);
                    return (
                      <div
                        key={agent.id}
                        className="grid grid-cols-[1fr_auto_auto_auto] gap-4 py-2 border-b border-border-subtle/50 last:border-0"
                      >
                        <span className="font-mono text-xs text-text-light truncate">
                          {agent.name}
                        </span>
                        <span
                          className={`font-mono text-[10px] tabular-nums text-right ${
                            isRunning ? "text-emerald-400" : "text-text-muted"
                          }`}
                        >
                          {isRunning
                            ? "LIVE"
                            : (agent.status?.toUpperCase() ?? "—")}
                        </span>
                        <span className="font-mono text-xs text-text-muted tabular-nums text-right">
                          ${rate.toFixed(4)}/hr
                        </span>
                        <span className="font-mono text-xs text-text-light tabular-nums text-right">
                          {agent.billing?.totalCost != null
                            ? `$${agent.billing.totalCost.toFixed(2)}`
                            : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="font-mono text-xs text-text-subtle">
                    No cloud agents — no charges accrued.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────── */

function CreditPackCard({ pack }: { pack: CreditPack }) {
  return (
    <div
      className={`relative border p-5 transition-all duration-200 cursor-pointer group
        ${
          pack.highlight
            ? "border-brand/30 bg-brand/5 hover:border-brand/50"
            : "border-border-subtle bg-dark hover:border-text-muted/30"
        }`}
    >
      {pack.highlight && (
        <div className="absolute -top-px left-0 right-0 h-px bg-brand" />
      )}
      {pack.bonus > 0 && (
        <span className="absolute top-3 right-3 font-mono text-[9px] tracking-wider px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          +{pack.bonus}%
        </span>
      )}
      <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-2">
        {pack.name}
      </p>
      <p className="font-mono text-2xl font-semibold text-text-light tabular-nums mb-1">
        ${pack.price}
      </p>
      <p className="font-mono text-xs text-text-muted tabular-nums">
        {pack.credits.toLocaleString()} credits
      </p>
      {pack.bonus > 0 && (
        <p className="font-mono text-[10px] text-brand mt-2">
          ${Math.round(pack.price * (1 + pack.bonus / 100))} value
        </p>
      )}
      <button
        type="button"
        disabled
        title="Payment integration coming soon"
        className={`mt-4 w-full py-2 font-mono text-[11px] tracking-wider font-medium
          opacity-50 cursor-not-allowed
          ${
            pack.highlight
              ? "bg-brand text-dark"
              : "bg-surface border border-border text-text-muted"
          }`}
      >
        PURCHASE
      </button>
    </div>
  );
}

function CostEstimate({
  label,
  sublabel,
  monthly,
}: {
  label: string;
  sublabel: string;
  monthly: number;
}) {
  return (
    <div className="border border-border-subtle bg-dark p-4">
      <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-0.5">
        {label}
      </p>
      <p className="font-mono text-[10px] text-text-muted mb-3">{sublabel}</p>
      <p className="font-mono text-lg font-semibold text-text-light tabular-nums">
        ${monthly.toFixed(2)}
        <span className="text-xs font-normal text-text-muted">/mo</span>
      </p>
      <p className="font-mono text-[10px] text-text-subtle mt-1">
        ${(monthly / 30).toFixed(2)}/day
      </p>
    </div>
  );
}

function DataCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-surface p-4">
      <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1">
        {label}
      </p>
      <p className="font-mono text-2xl font-semibold text-text-light tabular-nums">
        {value}
      </p>
      {sub && (
        <p className="font-mono text-[10px] text-text-subtle mt-1">{sub}</p>
      )}
    </div>
  );
}

function MiniDataCell({ label, value }: { label: string; value?: number }) {
  return (
    <div className="bg-surface p-3">
      <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1">
        {label}
      </p>
      <p className="font-mono text-xl font-semibold text-text-light tabular-nums">
        {value?.toLocaleString() ?? "—"}
      </p>
    </div>
  );
}
