import { useEffect, useMemo, useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import {
  type BillingSettingsResponse,
  type CreditsSummaryResponse,
  formatMoney,
} from "../../lib/billing-types";
import { CloudClient, type CreditBalance } from "../../lib/cloud-api";
import { useAuth } from "../../lib/useAuth";

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

  const totalHourly = useMemo(
    () =>
      cloudAgents.reduce(
        (sum, agent) => sum + (agent.billing?.costPerHour ?? 0),
        0,
      ),
    [cloudAgents],
  );

  if (!authed) {
    return (
      <div className="border border-border bg-surface animate-[fade-up_0.4s_ease-out_both]">
        <div className="px-4 py-2.5 bg-dark-secondary border-b border-border">
          <span className="font-mono text-xs text-text-muted">
            $ credits --status
          </span>
        </div>
        <div className="p-8 text-center">
          <h3 className="font-mono text-sm text-text-light mb-2">
            NOT AUTHENTICATED
          </h3>
          <p className="font-mono text-xs text-text-muted">
            Sign in with Eliza Cloud to view credits.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-border bg-surface p-8 text-center">
        <p className="font-mono text-xs text-red-400">{error}</p>
      </div>
    );
  }

  const autoTopUp = billingSettings?.settings?.autoTopUp;
  const org = creditsSummary?.organization;
  const agentSummary = creditsSummary?.agentsSummary;
  const pricing = creditsSummary?.pricing;

  return (
    <div className="space-y-6 max-w-5xl animate-[fade-up_0.4s_ease-out_both]">
      {/* Header */}
      <div>
        <h2 className="font-mono text-lg font-medium text-text-light tracking-wide">
          CREDITS
        </h2>
        <p className="font-mono text-xs text-text-muted mt-1">
          Balance, usage, and billing configuration
        </p>
      </div>

      {/* Balance hero */}
      <div className="border border-brand/20 bg-brand/5 p-6">
        <p className="font-mono text-[10px] tracking-[0.15em] text-text-subtle mb-1">
          BALANCE
        </p>
        <p className="font-mono text-4xl font-semibold text-brand tabular-nums tracking-tight">
          {credits?.balance?.toLocaleString() ??
            org?.creditBalance?.toLocaleString() ??
            "—"}
        </p>
        <p className="font-mono text-xs text-text-muted mt-1">
          {credits?.currency ?? "credits"}
        </p>
      </div>

      {/* Pricing breakdown */}
      <div className="border border-border bg-surface">
        <div className="px-4 py-2 bg-dark-secondary border-b border-border flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-wider text-text-subtle">
            PRICING
          </span>
          <span className="font-mono text-[10px] tracking-wider text-text-subtle">
            $ milady pricing --show
          </span>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1.5">
                RUNNING AGENT
              </p>
              <p className="font-mono text-lg font-semibold text-brand tabular-nums">
                $0.01
                <span className="text-xs font-normal text-text-muted">/hr</span>
              </p>
              <p className="font-mono text-[10px] text-text-subtle mt-0.5">
                ≈ $7.20/month
              </p>
            </div>
            <div>
              <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1.5">
                IDLE AGENT
              </p>
              <p className="font-mono text-lg font-semibold text-text-light tabular-nums">
                $0.0025
                <span className="text-xs font-normal text-text-muted">/hr</span>
              </p>
              <p className="font-mono text-[10px] text-text-subtle mt-0.5">
                ≈ $1.80/month
              </p>
            </div>
          </div>

          <div className="border-t border-border-subtle" />

          <div>
            <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-3">
              CREDIT PACKS
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="border border-border-subtle bg-dark p-3">
                <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1">
                  SMALL
                </p>
                <p className="font-mono text-sm font-semibold text-text-light tabular-nums">
                  $5
                </p>
                <p className="font-mono text-[10px] text-text-subtle mt-0.5">
                  500 credits
                </p>
              </div>
              <div className="border border-brand/20 bg-brand/5 p-3">
                <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1">
                  MEDIUM
                </p>
                <p className="font-mono text-sm font-semibold text-text-light tabular-nums">
                  $13
                </p>
                <p className="font-mono text-[10px] text-brand mt-0.5">
                  $15 value <span className="text-emerald-400">+15%</span>
                </p>
              </div>
              <div className="border border-brand/20 bg-brand/5 p-3">
                <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1">
                  LARGE
                </p>
                <p className="font-mono text-sm font-semibold text-text-light tabular-nums">
                  $40
                </p>
                <p className="font-mono text-[10px] text-brand mt-0.5">
                  $50 value <span className="text-emerald-400">+25%</span>
                </p>
              </div>
            </div>
          </div>

          <p className="font-mono text-[10px] text-text-subtle pt-1">
            Minimum deposit: $5.00
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
        <DataCell
          label="CLOUD AGENTS"
          value={String(cloudAgents.length)}
          sub={
            totalHourly > 0 ? `$${totalHourly.toFixed(2)}/hr` : "no hourly rate"
          }
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
              ? `${pricing.creditsPerDollar} credits/USD`
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

      {/* Billing settings */}
      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="border border-border bg-surface">
          <div className="px-4 py-2 bg-dark-secondary border-b border-border flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-wider text-text-subtle">
              AUTO TOP-UP
            </span>
            <span
              className={`font-mono text-[10px] tracking-wider ${
                autoTopUp?.enabled || org?.autoTopUpEnabled
                  ? "text-emerald-400"
                  : "text-text-subtle"
              }`}
            >
              {autoTopUp?.enabled || org?.autoTopUpEnabled
                ? "ENABLED"
                : "DISABLED"}
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
                    : "text-text-subtle"
                }`}
              >
                {autoTopUp?.hasPaymentMethod || org?.hasPaymentMethod
                  ? "ON FILE"
                  : "NONE"}
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
                Range: {formatMoney(billingSettings.settings.limits.minAmount)}{" "}
                to {formatMoney(billingSettings.settings.limits.maxAmount)}
              </p>
            )}
          </div>
        </div>

        <div className="border border-border bg-surface">
          <div className="px-4 py-2 bg-dark-secondary border-b border-border">
            <span className="font-mono text-[10px] tracking-wider text-text-subtle">
              SUMMARY
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
          </div>
        </div>
      </div>
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
