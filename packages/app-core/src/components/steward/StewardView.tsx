/**
 * StewardView — unified transaction history + approval queue panel.
 * Renders inside the Wallets tab as a sub-section or alongside inventory.
 */

import type { StewardStatusResponse } from "@miladyai/shared/contracts/wallet";
import {
  PageLayout,
  PagePanel,
  Sidebar,
  SidebarContent,
  SidebarPanel,
} from "@miladyai/ui";
import { FileText, Shield } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../state";
import { ApprovalQueue } from "./ApprovalQueue";
import { StewardLogo } from "./StewardLogo";
import { StewardVaultOverview } from "./StewardVaultOverview";
import { resolveStewardUiState } from "./steward-ui-state";
import { TransactionHistory } from "./TransactionHistory";

type StewardTab = "overview" | "history" | "approvals";

export function StewardView() {
  const {
    walletConfig,
    wallets,
    getStewardStatus,
    getStewardAddresses,
    getStewardBalance,
    getStewardTokens,
    getStewardWebhookEvents,
    getStewardHistory,
    getStewardPending,
    approveStewardTx,
    rejectStewardTx,
    copyToClipboard,
    setActionNotice,
  } = useApp();

  const [activeTab, setActiveTab] = useState<StewardTab>("overview");
  const [stewardStatus, setStewardStatus] =
    useState<StewardStatusResponse | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (typeof getStewardStatus !== "function") return;
    let cancelled = false;
    getStewardStatus()
      .then((s) => {
        if (!cancelled) setStewardStatus(s);
      })
      .catch(() => {
        /* steward not available */
      });
    return () => {
      cancelled = true;
    };
  }, [getStewardStatus]);

  const handlePendingCountChange = useCallback((count: number) => {
    setPendingCount(count);
  }, []);

  const stewardUi = resolveStewardUiState({
    stewardStatus,
    walletConfig,
    wallets,
  });

  // If steward isn't configured, show a placeholder
  if (stewardStatus && !stewardStatus.connected) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <PagePanel
          variant="surface"
          className="mx-4 w-full max-w-xl px-6 py-10 text-center"
        >
          <StewardLogo size={40} className="mx-auto opacity-40" />
          <h2 className="mt-4 text-lg font-semibold text-txt-strong">
            {stewardUi.title}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted leading-relaxed">
            {stewardUi.description}
          </p>
          {stewardStatus.error && (
            <p className="mt-3 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
              {stewardStatus.error}
            </p>
          )}
        </PagePanel>
      </div>
    );
  }

  const stewardSidebar = (
    <Sidebar testId="steward-sidebar">
      <SidebarPanel>
        <SidebarContent.SectionLabel>Steward</SidebarContent.SectionLabel>
        <div className="mt-1.5 text-xs text-muted">
          {stewardStatus?.connected ? "Vault management" : "Connecting…"}
        </div>

        <nav className="mt-4 space-y-1.5">
          <SidebarContent.Item
            active={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
          >
            <SidebarContent.ItemIcon active={activeTab === "overview"}>
              <Shield className="h-4 w-4" />
            </SidebarContent.ItemIcon>
            <SidebarContent.ItemBody>
              <SidebarContent.ItemTitle>Vault</SidebarContent.ItemTitle>
              <SidebarContent.ItemDescription>
                Addresses, balances, events
              </SidebarContent.ItemDescription>
            </SidebarContent.ItemBody>
          </SidebarContent.Item>

          <SidebarContent.Item
            active={activeTab === "approvals"}
            onClick={() => setActiveTab("approvals")}
          >
            <SidebarContent.ItemIcon
              active={activeTab === "approvals"}
              className="relative"
            >
              <StewardLogo size={16} />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger px-1 text-3xs font-bold text-[var(--destructive-foreground)]">
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </SidebarContent.ItemIcon>
            <SidebarContent.ItemBody>
              <SidebarContent.ItemTitle>Approvals</SidebarContent.ItemTitle>
              <SidebarContent.ItemDescription>
                {pendingCount > 0 ? `${pendingCount} pending` : "None pending"}
              </SidebarContent.ItemDescription>
            </SidebarContent.ItemBody>
          </SidebarContent.Item>

          <SidebarContent.Item
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
          >
            <SidebarContent.ItemIcon active={activeTab === "history"}>
              <FileText className="h-4 w-4" />
            </SidebarContent.ItemIcon>
            <SidebarContent.ItemBody>
              <SidebarContent.ItemTitle>History</SidebarContent.ItemTitle>
              <SidebarContent.ItemDescription>
                All transactions
              </SidebarContent.ItemDescription>
            </SidebarContent.ItemBody>
          </SidebarContent.Item>
        </nav>

        {/* Steward status */}
        {stewardStatus?.connected && (
          <div className="mt-auto pt-4">
            <div className="inline-flex items-center gap-1.5 rounded-2xl border border-accent/25 bg-accent/10 px-3 py-2 text-xs-tight text-accent-fg">
              <StewardLogo size={12} />
              <span>Connected</span>
            </div>
            {stewardStatus.evmAddress && (
              <p className="mt-1.5 font-mono text-2xs text-muted/60">
                {stewardStatus.evmAddress.slice(0, 6)}…
                {stewardStatus.evmAddress.slice(-4)}
              </p>
            )}
          </div>
        )}
      </SidebarPanel>
    </Sidebar>
  );

  return (
    <PageLayout sidebar={stewardSidebar}>
      <div className="mx-auto max-w-[76rem]">
        {/* Header */}
        <PagePanel variant="surface" className="px-5 py-5 sm:px-6">
          <div className="text-xs-tight font-semibold uppercase tracking-[0.16em] text-muted">
            Steward
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-txt-strong">
            {activeTab === "overview"
              ? "Vault Overview"
              : activeTab === "approvals"
                ? "Approvals"
                : "Transaction History"}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            {activeTab === "overview"
              ? "Everything Steward is managing on this device, including addresses, balances, and recent vault activity."
              : activeTab === "approvals"
                ? "Transactions that need your sign-off."
                : "All signed and broadcast transactions from the vault."}
          </p>
        </PagePanel>

        {/* Content */}
        <div className="mt-4">
          {activeTab === "overview" && stewardStatus ? (
            <StewardVaultOverview
              stewardStatus={stewardStatus}
              getStewardAddresses={getStewardAddresses}
              getStewardBalance={getStewardBalance}
              getStewardTokens={getStewardTokens}
              getStewardWebhookEvents={getStewardWebhookEvents}
              copyToClipboard={copyToClipboard}
              setActionNotice={setActionNotice}
            />
          ) : activeTab === "approvals" ? (
            <ApprovalQueue
              getStewardPending={getStewardPending}
              approveStewardTx={approveStewardTx}
              rejectStewardTx={rejectStewardTx}
              copyToClipboard={copyToClipboard}
              setActionNotice={setActionNotice}
              onPendingCountChange={handlePendingCountChange}
            />
          ) : (
            <TransactionHistory
              getStewardHistory={getStewardHistory}
              copyToClipboard={copyToClipboard}
              setActionNotice={setActionNotice}
            />
          )}
        </div>
      </div>
    </PageLayout>
  );
}
