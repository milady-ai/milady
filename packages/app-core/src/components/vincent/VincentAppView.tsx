/**
 * VincentAppView — full-screen overlay app for Vincent DeFi vault management.
 *
 * Layout:
 *   - Header with back button and connection status badge
 *   - VincentConnectionCard (OAuth connect/disconnect)
 *   - VaultStatusCard (vault health, addresses, balances) — when connected
 *   - TradingStrategyPanel (strategy config + start/stop) — when connected
 *   - TradingProfileCard (P&L analytics) — when connected
 *   - Tab section: Transaction History | Approval Queue — when connected
 *
 * Implements the OverlayApp Component contract.
 */

import type { OverlayAppContext } from "../apps/overlay-app-api";
import { Button, PagePanel, SegmentedControl, Spinner } from "@miladyai/ui";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { useApp } from "../../state";
import { ApprovalQueue } from "../steward/ApprovalQueue";
import { TransactionHistory } from "../steward/TransactionHistory";
import { TradingProfileCard } from "./TradingProfileCard";
import { TradingStrategyPanel } from "./TradingStrategyPanel";
import { VaultStatusCard } from "./VaultStatusCard";
import { VincentConnectionCard } from "./VincentConnectionCard";
import { useVincentDashboard } from "./useVincentDashboard";

type VincentTab = "history" | "approvals";

const TAB_ITEMS: Array<{ value: VincentTab; label: string }> = [
  { value: "history", label: "Transaction History" },
  { value: "approvals", label: "Approval Queue" },
];

export function VincentAppView({ exitToApps, t }: OverlayAppContext) {
  const {
    setActionNotice,
    getStewardHistory,
    getStewardPending,
    approveStewardTx,
    rejectStewardTx,
    copyToClipboard,
  } = useApp();

  const {
    vincentConnected,
    stewardStatus,
    vaultStatus,
    strategy,
    tradingProfile,
    loading,
    error,
    refresh,
  } = useVincentDashboard();

  const [activeTab, setActiveTab] = useState<VincentTab>("history");
  const [pendingCount, setPendingCount] = useState(0);

  const handlePendingCountChange = useCallback((count: number) => {
    setPendingCount(count);
  }, []);

  const tabItems = TAB_ITEMS.map((item) => ({
    ...item,
    badge:
      item.value === "approvals" && pendingCount > 0 ? (
        <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 py-0.5 text-[10px] font-bold text-accent-fg">
          {pendingCount}
        </span>
      ) : undefined,
  }));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg h-[100vh] overflow-hidden supports-[height:100dvh]:h-[100dvh]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/20 bg-bg/80 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl text-muted hover:text-txt"
            onClick={exitToApps}
            aria-label={t("nav.back", { defaultValue: "Back" })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-base font-semibold text-txt">Vincent</h1>
            <p className="text-[11px] text-muted leading-none">
              DeFi vault management &amp; autotrading
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Connection status pill */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              vincentConnected
                ? "border-ok/35 bg-ok/12 text-ok"
                : "border-border bg-bg-accent text-muted"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${vincentConnected ? "bg-ok" : "bg-muted"}`}
            />
            {vincentConnected
              ? t("vincent.connected", { defaultValue: "Connected" })
              : t("vincent.disconnected", { defaultValue: "Disconnected" })}
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl text-muted hover:text-txt"
            onClick={refresh}
            disabled={loading}
            aria-label={t("actions.refresh", { defaultValue: "Refresh" })}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="chat-native-scrollbar flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Error banner */}
          {error && (
            <PagePanel.Notice tone="danger">{error}</PagePanel.Notice>
          )}

          {/* Initial loading state */}
          {loading && !vincentConnected && stewardStatus === null && (
            <div className="flex items-center justify-center py-16">
              <Spinner className="h-5 w-5 text-muted" />
              <span className="ml-3 text-sm text-muted">Loading…</span>
            </div>
          )}

          {/* Connection card — always visible */}
          <VincentConnectionCard
            setActionNotice={setActionNotice}
            t={t}
          />

          {/* Cards below only render when connected */}
          {vincentConnected && (
            <>
              <VaultStatusCard
                stewardStatus={stewardStatus}
                vaultStatus={vaultStatus}
                setActionNotice={setActionNotice}
              />

              <TradingStrategyPanel
                strategy={strategy}
                onStrategyChange={refresh}
                setActionNotice={setActionNotice}
              />

              <TradingProfileCard tradingProfile={tradingProfile} />

              {/* Tab section */}
              <div className="rounded-[28px] border border-border/18 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_92%,transparent),color-mix(in_srgb,var(--bg)_98%,transparent))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden">
                {/* Tab bar */}
                <div className="flex items-center border-b border-border/20 px-5 pt-4 pb-0">
                  <SegmentedControl
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as VincentTab)}
                    items={tabItems}
                    className="border-0 bg-transparent p-0"
                    buttonClassName="text-xs"
                  />
                </div>

                {/* Tab content */}
                <div className="px-5 py-4">
                  {activeTab === "history" && (
                    <TransactionHistory
                      getStewardHistory={getStewardHistory}
                      copyToClipboard={copyToClipboard}
                      setActionNotice={setActionNotice}
                      embedded
                    />
                  )}
                  {activeTab === "approvals" && (
                    <ApprovalQueue
                      getStewardPending={getStewardPending}
                      approveStewardTx={approveStewardTx}
                      rejectStewardTx={rejectStewardTx}
                      copyToClipboard={copyToClipboard}
                      setActionNotice={setActionNotice}
                      onPendingCountChange={handlePendingCountChange}
                      embedded
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {/* Not-connected informational card */}
          {!vincentConnected && !loading && (
            <div className="rounded-[28px] border border-border/18 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_92%,transparent),color-mix(in_srgb,var(--bg)_98%,transparent))] px-5 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <p className="text-sm font-medium text-txt">
                {t("vincent.connectPrompt", {
                  defaultValue: "Connect your Vincent account to get started",
                })}
              </p>
              <p className="mx-auto mt-2 max-w-sm text-xs text-muted leading-relaxed">
                {t("vincent.connectPromptDetail", {
                  defaultValue:
                    "Once connected, you'll see your vault health, trading strategy, P&L analytics, and transaction history here.",
                })}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
