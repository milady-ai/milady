import { Badge } from "@miladyai/ui";
import { Activity } from "lucide-react";
import { useApp } from "@miladyai/app-core/state";
import { WidgetSection } from "../chat/widgets/shared";
import type { ReactNode } from "react";

type StatusTone = "emerald" | "sky" | "violet" | "amber" | "rose";

const STATUS_DOT_CLASSES: Record<StatusTone, string> = {
  emerald: "bg-emerald-400",
  sky: "bg-sky-400",
  violet: "bg-violet-400",
  amber: "bg-amber-400",
  rose: "bg-rose-400",
};

const STATUS_BADGE_CLASSES: Record<StatusTone, string> = {
  emerald: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  sky: "border-sky-500/30 bg-sky-500/15 text-sky-300",
  violet: "border-violet-500/30 bg-violet-500/15 text-violet-300",
  amber: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  rose: "border-rose-500/30 bg-rose-500/15 text-rose-300",
};

function StatusCard({
  title,
  summary,
  badge,
  timestamp,
  children,
  footer,
  tone = "sky",
}: {
  title: string;
  summary: string;
  badge?: string;
  timestamp: string;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: StatusTone;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-[#111114] p-3">
      <div className="flex items-start gap-2">
        <span
          className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASSES[tone]}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="min-w-0 truncate text-xs font-semibold text-txt">
              {title}
            </span>
            {badge ? (
              <Badge
                variant="secondary"
                className={`text-[9px] ${STATUS_BADGE_CLASSES[tone]}`}
              >
                {badge}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
            {summary}
          </p>
          {children ? <div className="mt-3">{children}</div> : null}
          <div className="mt-3 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.08em] text-muted/70">
            <div className="min-w-0">{footer}</div>
            <span className="shrink-0">{timestamp}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignatureAlertCard() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-amber-500/24 bg-[#111114] p-3">
      <div
        className="absolute right-3 top-3 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-bg"
        data-testid="wallet-status-signature-alert-badge"
      >
        6
      </div>
      <div className="pr-12">
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-[0.08em] text-amber-300">
            Needs signature
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-5 text-muted">
          Placeholder: one message is waiting to be signed before it can move
          forward.
        </p>
        <div className="mt-3 flex justify-end text-[10px] uppercase tracking-[0.08em] text-muted/70">
          09:18
        </div>
      </div>
    </div>
  );
}

export function WalletStatusRail({ className }: { className?: string }) {
  const { walletLoading, walletError, walletAddresses, t } = useApp();

  const hasWalletAddress = Boolean(
    walletAddresses?.evmAddress ||
      walletAddresses?.solanaAddress ||
      walletAddresses?.evm ||
      walletAddresses?.solana,
  );

  return (
    <aside
      className={`flex h-full min-h-0 w-full flex-col overflow-hidden border-border bg-bg lg:w-[22rem] lg:shrink-0 lg:border-l ${className ?? ""}`}
      data-testid="wallet-status-rail"
    >
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-bg-hover text-muted">
          <Activity className="h-4 w-4" />
        </span>
        <span className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          {t("wallet.status.title", { defaultValue: "Agent Activity" })}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        <WidgetSection
          title="Monitor"
          icon={<Activity className="h-4 w-4" />}
          testId="wallet-widget-status"
        >
          <div className="flex flex-col gap-2.5">
            <StatusCard
              title="Auto-Trading"
              summary={
                walletLoading
                  ? "Refreshing trading state."
                  : "Routing live crypto entries from the current signal set."
              }
              badge="LIVE"
              timestamp="09:12"
              tone="emerald"
              footer={
                <button
                  type="button"
                  className="rounded-full border border-rose-500/30 bg-rose-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-rose-200"
                >
                  Stop now
                </button>
              }
            />
            <StatusCard
              title="Opening Short on BTC"
              summary={
                walletError
                  ? "Reviewing wallet error and recovery steps."
                  : "Applying leverage where policy permits and flow stays clean."
              }
              badge="Leverage"
              timestamp="09:14"
              tone="sky"
              footer={
                <div className="flex flex-wrap gap-2">
                  {["20x", "50x", "100x"].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="rounded-full border border-border/60 bg-bg-hover px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-txt"
                    >
                      {value}
                    </button>
                  ))}
                </div>
              }
            />
            <StatusCard
              title="Edging"
              summary={
                hasWalletAddress
                  ? "Capping exposure at 20% of available capital."
                  : "Waiting for wallet connection before position sizing."
              }
              badge="Butterfly"
              timestamp="09:16"
              tone="violet"
            />
            <StatusCard
              title="Stop Trading"
              summary="Halting new orders until risk or signature clears."
              badge="HALT"
              timestamp="09:18"
              tone="rose"
            />
            <SignatureAlertCard />
          </div>
        </WidgetSection>
      </div>
    </aside>
  );
}
