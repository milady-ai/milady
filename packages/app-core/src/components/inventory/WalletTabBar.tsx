/**
 * Horizontal sub-tab bar for the Wallets view.
 * Switches between Balances, Transactions, and Approvals.
 */

import { FileText, Wallet } from "lucide-react";
import { StewardLogo } from "../steward/StewardLogo";

export type WalletSubTab = "balances" | "transactions" | "approvals";

interface WalletTabBarProps {
  activeTab: WalletSubTab;
  onTabChange: (tab: WalletSubTab) => void;
  pendingCount?: number;
}

const TABS: Array<{
  key: WalletSubTab;
  label: string;
  icon?: typeof Wallet;
  useStewardLogo?: boolean;
}> = [
  { key: "balances", label: "Balances", icon: Wallet },
  { key: "transactions", label: "Transactions", icon: FileText },
  { key: "approvals", label: "Approvals", useStewardLogo: true },
];

export function WalletTabBar({
  activeTab,
  onTabChange,
  pendingCount = 0,
}: WalletTabBarProps) {
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-border/30 bg-card/40 p-1 backdrop-blur-sm">
      {TABS.map(({ key, label, icon: Icon, useStewardLogo }) => {
        const isActive = activeTab === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            className={`relative inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              isActive
                ? "border border-accent/26 bg-accent/14 text-txt shadow-sm"
                : "border border-transparent text-muted hover:bg-card/60 hover:text-txt"
            }`}
          >
            {useStewardLogo ? (
              <StewardLogo size={14} className="opacity-80" />
            ) : Icon ? (
              <Icon className="h-3.5 w-3.5" />
            ) : null}
            {label}
            {key === "approvals" && pendingCount > 0 && (
              <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-status-danger px-1 text-[9px] font-bold text-[var(--destructive-foreground)]">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
