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

const PRESET_AMOUNTS = [10, 25, 50, 100];

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
  const [activeTab, setActiveTab] = useState<"usage" | "history">("usage");

  // Purchase flow
  const [topUpAmount, setTopUpAmount] = useState("25");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

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

  const isLowBalance = balance != null && balance < dailyBurn * 3;
  const isCriticalBalance = balance != null && balance < dailyBurn;

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
          <span className="font-mono text-xs text-status-stopped">
            $ credits --status [FAILED]
          </span>
        </div>
        <div className="p-6 text-center">
          <p className="font-mono text-xs text-status-stopped mb-3">{error}</p>
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
      {/* ── Balance Hero ────────────────────────────────────────── */}
      <div
        className={`p-6 border ${
          isCriticalBalance
            ? "border-status-stopped/30 bg-status-stopped/5"
            : isLowBalance
              ? "border-brand/30 bg-brand/5"
              : "border-border bg-surface"
        }`}
      >
        <div className="flex items-start justify-between mb-1">
          <p className="font-mono text-[10px] tracking-[0.15em] text-text-subtle">
            CURRENT BALANCE
          </p>
          {isCriticalBalance && (
            <span className="font-mono text-[9px] tracking-wider px-2 py-0.5 bg-status-stopped/10 text-status-stopped border border-status-stopped/20">
              CRITICAL
            </span>
          )}
          {isLowBalance && !isCriticalBalance && (
            <span className="font-mono text-[9px] tracking-wider px-2 py-0.5 bg-brand/10 text-brand border border-brand/20">
              LOW
            </span>
          )}
        </div>
        <p
          className={`font-mono text-4xl font-semibold tabular-nums tracking-tight ${
            isCriticalBalance
              ? "text-status-stopped"
              : isLowBalance
                ? "text-brand"
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

        {daysRemaining != null && (
          <p
            className={`font-mono text-xs mt-3 ${
              daysRemaining < 1
                ? "text-status-stopped"
                : daysRemaining < 7
                  ? "text-brand"
                  : "text-text-subtle"
            }`}
          >
            {daysRemaining < 1
              ? "Less than 1 day remaining at current usage"
              : daysRemaining === 1
                ? "~1 day remaining at current usage"
                : `~${daysRemaining} days remaining at current usage`}
          </p>
        )}
      </div>

      {/* ── Low balance warning ─────────────────────────────────── */}
      {isLowBalance && (
        <div
          className={`flex items-center gap-3 px-4 py-3 border ${
            isCriticalBalance
              ? "border-status-stopped/30 bg-status-stopped/5"
              : "border-brand/30 bg-brand/5"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${isCriticalBalance ? "bg-status-stopped animate-pulse" : "bg-brand"}`}
          />
          <p
            className={`font-mono text-xs ${isCriticalBalance ? "text-status-stopped" : "text-brand"}`}
          >
            {isCriticalBalance
              ? "Balance critically low — agents may be suspended soon. Top up now."
              : "Balance running low — consider adding credits to avoid interruption."}
          </p>
        </div>
      )}

      {/* ── Add Funds ───────────────────────────────────────────── */}
      <div className="border border-border bg-surface">
        <div className="px-4 py-2.5 bg-dark-secondary border-b border-border flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-wider text-text-subtle">
            ADD FUNDS
          </span>
          <span className="font-mono text-[10px] tracking-wider text-text-subtle">
            $ milady credits --buy
          </span>
        </div>
        <div className="p-5 space-y-4">
          {/* Preset amounts */}
          <div className="flex gap-2 flex-wrap">
            {PRESET_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setTopUpAmount(String(amt))}
                className={`px-4 py-1.5 font-mono text-xs tracking-wider border transition-all
                  ${
                    topUpAmount === String(amt)
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border-subtle bg-dark text-text-muted hover:border-text-muted/40 hover:text-text-light"
                  }`}
              >
                ${amt}
              </button>
            ))}
          </div>

          {/* Custom amount input */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-text-muted pointer-events-none">
                $
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                className="w-full pl-7 pr-3 py-2 font-mono text-sm bg-dark border border-border text-text-light
                  focus:outline-none focus:border-brand transition-colors"
                placeholder="25"
              />
            </div>
            <span className="font-mono text-xs text-text-subtle">USD</span>
          </div>

          {/* Error */}
          {checkoutError && (
            <p className="font-mono text-xs text-red-400">{checkoutError}</p>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 flex-wrap pt-1">
            <button
              type="button"
              disabled={checkoutBusy}
              onClick={async () => {
                setCheckoutError(null);
                const amountUsd = Number(topUpAmount);
                const minAmt = pricing?.minimumTopUp ?? 1;
                if (!Number.isFinite(amountUsd) || amountUsd < minAmt) {
                  setCheckoutError(`Minimum deposit is $${minAmt.toFixed(2)}`);
                  return;
                }
                setCheckoutBusy(true);
                try {
                  if (!token) return;
                  const cc = new CloudClient(token);
                  const res = await cc.createBillingCheckout(amountUsd);
                  const url = res.checkoutUrl ?? res.url;
                  if (url) {
                    window.open(url, "_blank", "noopener,noreferrer");
                  } else {
                    setCheckoutError("No checkout URL returned — try again.");
                  }
                } catch (err) {
                  setCheckoutError(
                    err instanceof Error ? err.message : "Checkout failed.",
                  );
                } finally {
                  setCheckoutBusy(false);
                }
              }}
              className="px-5 py-2 font-mono text-xs tracking-wider bg-brand text-dark font-medium
                hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {checkoutBusy ? "OPENING..." : "PAY WITH CARD"}
            </button>

            <button
              type="button"
              onClick={() => {
                window.open(
                  "https://www.elizacloud.ai/dashboard/settings?tab=billing",
                  "_blank",
                  "noopener,noreferrer",
                );
              }}
              className="px-5 py-2 font-mono text-xs tracking-wider border border-border-subtle bg-dark
                text-text-muted hover:border-text-muted/40 hover:text-text-light transition-all"
            >
              PAY WITH CRYPTO
            </button>
          </div>

          {pricing?.minimumTopUp != null && (
            <p className="font-mono text-[10px] text-text-subtle">
              Minimum deposit: ${pricing.minimumTopUp.toFixed(2)}
            </p>
          )}
        </div>
      </div>

      {/* ── Tab navigation ──────────────────────────────────────── */}
      <div className="flex border-b border-border">
        {(
          [
            { key: "usage", label: "USAGE" },
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

      {/* ── Tab: Usage ───────────────────────────────────────────── */}
      {activeTab === "usage" && (
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

          {/* Burn rate */}
          <div className="border border-border bg-surface">
            <div className="px-4 py-2 bg-dark-secondary border-b border-border">
              <span className="font-mono text-[10px] tracking-wider text-text-subtle">
                BURN RATE
              </span>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs text-text-muted">
                  Hourly
                </span>
                <span className="font-mono text-lg font-semibold text-text-light tabular-nums">
                  ${hourlyBurn.toFixed(4)}
                  <span className="text-xs font-normal text-text-muted">
                    /hr
                  </span>
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
                  <span className="text-xs font-normal text-text-muted">
                    /mo
                  </span>
                </span>
              </div>
              <div className="pt-3 border-t border-border-subtle space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-text-subtle">
                  <span>
                    {runningAgents.length} running × {PRICE_RUNNING_PER_HR}/hr
                  </span>
                  <span>
                    $
                    {(runningAgents.length * PRICE_RUNNING_HR_VALUE).toFixed(4)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-text-subtle">
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
                    <span className="w-2 h-2 rounded-full bg-status-running" />
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
                    <span className="w-2 h-2 rounded-full bg-brand" />
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
                      ? "text-status-running bg-status-running/10 border border-status-running/20"
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
                        : "text-status-stopped"
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
                            isRunning
                              ? "text-status-running"
                              : "text-text-muted"
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
