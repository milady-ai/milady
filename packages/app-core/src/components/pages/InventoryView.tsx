/**
 * Inventory view — unified wallet balances, NFTs, and scoped BSC trading.
 *
 * Thin coordinator that delegates rendering to sub-components
 * in the ./inventory/ directory.
 */

import type { StewardStatusResponse } from "@miladyai/app-core/api";
import { useApp } from "@miladyai/app-core/state";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  PageLayout,
  PagePanel,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarPanel,
  SidebarScrollRegion,
} from "@miladyai/ui";
import {
  AlertTriangle,
  ChevronDown,
  Copy,
  EllipsisVertical,
  Link,
  RefreshCw,
  Settings,
  Shield,
  SlidersHorizontal,
  Unlink,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BSC_GAS_READY_THRESHOLD,
  loadTrackedBscTokens,
  loadTrackedTokens,
  saveTrackedTokens,
  type TrackedToken,
} from "../inventory";
import { TradePanel } from "../inventory/BscTradePanel";
import { ChainIcon } from "../inventory/ChainIcon";
import {
  CHAIN_CONFIGS,
  type ChainKey,
  chainKeyToWalletRpcChain,
  getNativeLogoUrl,
  resolveChainKey,
} from "../inventory/chainConfig";
import { useInventoryData } from "../inventory/useInventoryData";
import { PolicyControlsView } from "../settings/PolicyControlsView";
import { ChatView } from "./ChatView";
import { ConfigPageView } from "./ConfigPageView";

/* ── Component ─────────────────────────────────────────────────────── */

/* ── Wallet Settings Popup Components ────────────────────────────────── */

function SettingsCopyableAddress({
  label,
  address,
}: {
  label: string;
  address: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [address]);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-bg/50 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-muted">{label}</div>
        <div className="mt-0.5 truncate font-mono text-xs text-txt">
          {address}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted hover:text-txt"
        onClick={handleCopy}
        aria-label={`Copy ${label} address`}
      >
        {copied ? (
          <span className="text-ok text-xs">✓</span>
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}

function WalletLogoStack() {
  const logos = [
    { src: getNativeLogoUrl("ethereum"), alt: "Ethereum" },
    { src: getNativeLogoUrl("base"), alt: "Base" },
    { src: getNativeLogoUrl("bsc"), alt: "BNB Chain" },
    { src: getNativeLogoUrl("solana"), alt: "Solana" },
  ].filter((item): item is { src: string; alt: string } => Boolean(item.src));

  return (
    <div
      data-testid="wallet-rpc-logo-stack"
      className="flex items-center"
      aria-hidden="true"
    >
      {logos.map((logo, index) => (
        <span
          key={logo.alt}
          className={`-ml-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-card shadow-sm first:ml-0 ${
            index === 0
              ? "z-30"
              : index === 1
                ? "z-20"
                : index === 2
                  ? "z-10"
                  : "z-0"
          }`}
        >
          <img
            src={logo.src}
            alt=""
            className="h-4 w-4 rounded-full object-cover"
          />
        </span>
      ))}
    </div>
  );
}

export function WalletChatBadges() {
  const accountBadges = [
    { chain: "ethereum", ring: "border-[#f2b86a]/35 bg-[rgba(242,184,106,0.08)]" },
    { chain: "base", ring: "border-[#60a5fa]/35 bg-[rgba(96,165,250,0.08)]" },
    { chain: "bsc", ring: "border-[#f59e0b]/35 bg-[rgba(245,158,11,0.08)]" },
    { chain: "solana", ring: "border-[#2dd4ff]/35 bg-[rgba(45,212,255,0.08)]" },
    { chain: "avax", ring: "border-[#ff6b8b]/30 bg-[rgba(255,107,139,0.08)]" },
    { chain: "mainnet", ring: "border-[#c4b5fd]/30 bg-[rgba(196,181,253,0.08)]" },
  ];

  const badgeShell =
    "rounded-[16px] border border-border/32 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_88%,transparent),color-mix(in_srgb,var(--bg)_96%,transparent))] text-txt shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_12px_18px_-18px_rgba(15,23,42,0.12)] backdrop-blur-sm transition-[border-color,background-color,box-shadow] duration-200 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_22px_-18px_rgba(0,0,0,0.24)]";
  const badgeLabelClass =
    "relative z-10 text-center text-[12px] font-semibold tracking-wide text-muted-strong";
  const badgeValueClass =
    "relative z-10 mt-0.5 text-center text-[18px] font-light leading-none text-txt";

  return (
    <div
      data-testid="wallet-chat-badges"
      className="flex flex-wrap items-start justify-start gap-2.5"
    >
      <div
        className="relative flex h-[66px] w-[220px] max-w-full flex-col items-center justify-center overflow-hidden px-4 text-center"
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 220 66"
          preserveAspectRatio="none"
        >
          <path
            d="M28 0H220V66H0V28Z"
            fill="var(--card)"
            stroke="var(--border)"
            strokeWidth="1"
          />
        </svg>
        <span className={badgeLabelClass}>Token</span>
        <span className={badgeValueClass}>Trades</span>
      </div>

      <div className={`${badgeShell} flex h-[66px] w-[132px] max-w-full flex-col items-center justify-center px-3 text-center`}>
        <span className={badgeLabelClass}>APY</span>
        <span className={badgeValueClass}>8.54%</span>
      </div>

      <div className={`${badgeShell} flex h-[66px] w-[150px] max-w-full flex-col items-center justify-center px-3 text-center`}>
        <span className={badgeLabelClass}>TVL</span>
        <span className={badgeValueClass}>$30.93M</span>
      </div>

      <div className={`${badgeShell} flex h-[66px] w-[170px] max-w-full flex-col items-center justify-center px-3 text-center`}>
        <span className={badgeLabelClass}>Accounts</span>
        <div className="mt-1 flex items-center justify-center">
          {accountBadges.map((badge, index) => (
            <span
              key={badge.chain}
              className={`-ml-1.5 flex h-5.5 w-5.5 items-center justify-center rounded-full border shadow-sm first:ml-0 ${badge.ring} ${index === 0 ? "z-30" : index === 1 ? "z-20" : index === 2 ? "z-10" : "z-0"}`}
            >
              <ChainIcon chain={badge.chain} size="sm" className="h-3.5 w-3.5" />
            </span>
          ))}
        </div>
      </div>

      <div className={`${badgeShell} flex h-[66px] w-[194px] max-w-full flex-col items-center justify-center px-3 text-center`}>
        <span className={badgeLabelClass}>Daily Returns</span>
        <span className={badgeValueClass}>1.31 ETH</span>
      </div>
    </div>
  );
}

type SidebarTokenRow = {
  name: string;
  symbol: string;
  chain: "ethereum" | "base" | "solana" | "bsc" | "avax";
  value: string;
  amount: string;
  changePct: string;
  changeTone: "up" | "down" | "flat";
  avatar:
    | { kind: "chain"; chain: "ethereum" | "base" | "solana" | "bsc" | "avax" }
    | { kind: "name"; label: string; className: string };
};

const SIDEBAR_TOKEN_ROWS: SidebarTokenRow[] = [
  {
    name: "USD Coin",
    symbol: "USDC",
    chain: "base",
    value: "$0.03",
    amount: "0.0336 USDC",
    changePct: "+0.02%",
    changeTone: "up",
    avatar: { kind: "chain", chain: "base" },
  },
  {
    name: "Rin",
    symbol: "RIN",
    chain: "base",
    value: "<$0.01",
    amount: "375 RIN",
    changePct: "+2.89%",
    changeTone: "up",
    avatar: {
      kind: "name",
      label: "R",
      className:
        "bg-[radial-gradient(circle_at_30%_30%,#d9f0ff,#4f8dff_60%,#23316b)] text-white",
    },
  },
  {
    name: "Chen",
    symbol: "CHEN",
    chain: "ethereum",
    value: "<$0.01",
    amount: "8.401 CHEN",
    changePct: "-35.65%",
    changeTone: "down",
    avatar: {
      kind: "name",
      label: "C",
      className:
        "bg-[radial-gradient(circle_at_30%_30%,#ffe0ef,#ff6aa8_55%,#5c1634)] text-white",
    },
  },
  {
    name: "Momo",
    symbol: "MOMO",
    chain: "solana",
    value: "<$0.01",
    amount: "1 MOMO",
    changePct: "+41.01%",
    changeTone: "up",
    avatar: {
      kind: "name",
      label: "M",
      className:
        "bg-[radial-gradient(circle_at_30%_30%,#fff1b8,#ffb347_55%,#5f3200)] text-white",
    },
  },
  {
    name: "Jin",
    symbol: "JIN",
    chain: "base",
    value: "<$0.01",
    amount: "777 JIN",
    changePct: "+1.59%",
    changeTone: "up",
    avatar: {
      kind: "name",
      label: "J",
      className:
        "bg-[radial-gradient(circle_at_30%_30%,#d8fce7,#34d399_55%,#0f5132)] text-white",
    },
  },
  {
    name: "Yuki",
    symbol: "YUKI",
    chain: "avax",
    value: "<$0.01",
    amount: "0.0100 YUKI",
    changePct: "-4.45%",
    changeTone: "down",
    avatar: {
      kind: "name",
      label: "Y",
      className:
        "bg-[radial-gradient(circle_at_30%_30%,#eef2ff,#8b5cf6_55%,#312e81)] text-white",
    },
  },
  {
    name: "Ethereum",
    symbol: "ETH",
    chain: "ethereum",
    value: "$0.00",
    amount: "0 ETH",
    changePct: "+1.81%",
    changeTone: "up",
    avatar: { kind: "chain", chain: "ethereum" },
  },
];

function SidebarTokenAvatar({ token }: { token: SidebarTokenRow }) {
  return (
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
      <span
        className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border/40 shadow-sm ${
          token.avatar.kind === "chain"
            ? "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_96%,white_4%),color-mix(in_srgb,var(--bg)_88%,black_12%))] text-txt"
            : token.avatar.className
        }`}
      >
        {token.avatar.kind === "chain" ? (
          <ChainIcon chain={token.avatar.chain} size="md" />
        ) : (
          <span className="text-sm font-semibold tracking-[0.02em]">
            {token.avatar.label}
          </span>
        )}
      </span>
      <span className="absolute bottom-0 right-0 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-bg bg-[#0b5cff] text-white shadow-sm">
        <ChainIcon chain={token.chain} size="sm" className="h-2.5 w-2.5" />
      </span>
    </span>
  );
}

function SidebarTokenList({
  inventoryView,
}: {
  inventoryView: "tokens" | "nfts";
}) {
  const walletTabs = [
    { label: "Tokens", active: inventoryView === "tokens" },
    { label: "DeFi", active: false },
    { label: "NFTs", active: false },
    { label: "Activity", active: false },
  ];

  if (inventoryView !== "tokens") {
    return (
      <div className="space-y-3">
        <div
          className="flex items-end gap-5 border-b border-border/30"
          data-testid="wallet-sidebar-tabs"
        >
          {walletTabs.map((tab) => (
            <button
              key={tab.label}
              type="button"
              data-testid={`wallet-sidebar-tab-${tab.label.toLowerCase()}`}
              aria-pressed={tab.active}
              className={`border-b-2 pb-2 text-[15px] font-medium transition-colors ${
                tab.active
                  ? "border-txt text-txt"
                  : "border-transparent text-muted hover:text-txt"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="rounded-2xl border border-border/35 bg-bg/15 px-4 py-3 text-sm text-muted">
          NFT collections will appear here once they&apos;re loaded.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="flex items-end gap-5 border-b border-border/30"
        data-testid="wallet-sidebar-tabs"
      >
        {walletTabs.map((tab) => (
          <button
            key={tab.label}
            type="button"
            data-testid={`wallet-sidebar-tab-${tab.label.toLowerCase()}`}
            aria-pressed={tab.active}
            className={`border-b-2 pb-2 text-[15px] font-medium transition-colors ${
              tab.active
                ? "border-txt text-txt"
                : "border-transparent text-muted hover:text-txt"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className="flex items-center justify-between gap-3"
        data-testid="wallet-sidebar-controls"
      >
        <button
          type="button"
          data-testid="wallet-sidebar-network-filter"
          className="inline-flex items-center gap-2 rounded-xl border border-border/40 bg-bg/20 px-3 py-2 text-[13px] font-medium text-txt transition-colors hover:border-border/60 hover:bg-bg/30"
          aria-label="All popular networks"
        >
          <span>All popular networks</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted" />
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="wallet-sidebar-filter-button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-bg/20 hover:text-txt"
            aria-label="Filter tokens"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <button
            type="button"
            data-testid="wallet-sidebar-more-button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-bg/20 hover:text-txt"
            aria-label="More token options"
          >
            <EllipsisVertical className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        className="space-y-1.5"
        data-testid="wallet-sidebar-token-list"
        aria-label="Token holdings"
      >
        {SIDEBAR_TOKEN_ROWS.map((token) => {
          const changeToneClass =
            token.changeTone === "up"
              ? "text-[#7CFC8A]"
              : token.changeTone === "down"
                ? "text-[#ff6b8b]"
                : "text-muted";

          return (
            <div
              key={`${token.chain}-${token.symbol}`}
              data-testid={`wallet-sidebar-token-${token.symbol.toLowerCase()}`}
              className="flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-bg/20"
            >
              <SidebarTokenAvatar token={token} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-txt">
                  {token.name}
                </div>
                <div className={`text-[11px] font-semibold ${changeToneClass}`}>
                  {token.changePct}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[13px] font-semibold text-txt">
                  {token.value}
                </div>
                <div className="text-[11px] text-muted">{token.amount}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StewardWalletInfoPopup({
  stewardStatus,
  onOpenPolicies,
}: {
  stewardStatus: StewardStatusResponse;
  onOpenPolicies: () => void;
}) {
  const { t } = useApp();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const evmAddress =
    stewardStatus.walletAddresses?.evm ?? stewardStatus.evmAddress ?? null;
  const solanaAddress = stewardStatus.walletAddresses?.solana ?? null;

  return (
    <div className="space-y-4">
      {/* Steward status banner */}
      <div className="flex items-center gap-3 rounded-lg border border-[#3b82f6]/25 bg-[#3b82f6]/10 p-3">
        <Shield className="h-5 w-5 shrink-0 text-[#93c5fd]" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-txt">
            {t("settings.stewardWalletManaged", {
              defaultValue: "Wallet managed by Steward",
            })}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            {stewardStatus.vaultHealth === "ok"
              ? t("settings.stewardVaultHealthy", {
                  defaultValue: "Vault connected and healthy",
                })
              : stewardStatus.vaultHealth === "degraded"
                ? t("settings.stewardVaultDegraded", {
                    defaultValue: "Vault connected - degraded",
                  })
                : t("settings.stewardVaultError", {
                    defaultValue: "Vault connected - error state",
                  })}
          </div>
        </div>
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            stewardStatus.vaultHealth === "ok"
              ? "bg-ok"
              : stewardStatus.vaultHealth === "degraded"
                ? "bg-warn"
                : "bg-danger"
          }`}
        />
      </div>

      {/* Wallet addresses */}
      <div className="space-y-2">
        {evmAddress && (
          <SettingsCopyableAddress label="EVM Address" address={evmAddress} />
        )}
        {solanaAddress && (
          <SettingsCopyableAddress
            label="Solana Address"
            address={solanaAddress}
          />
        )}
        {!evmAddress && !solanaAddress && (
          <div className="rounded-lg border border-border/50 bg-bg/50 px-3 py-2.5 text-xs text-muted">
            {t("settings.stewardNoAddresses", {
              defaultValue: "No vault addresses yet",
            })}
          </div>
        )}
      </div>

      {/* Link to Wallet Policies */}
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-center gap-2 text-xs"
        onClick={onOpenPolicies}
      >
        <Shield className="h-3.5 w-3.5" />
        {t("settings.viewWalletPolicies", {
          defaultValue: "View Wallet Policies",
        })}
      </Button>

      {/* RPC configuration */}
      <div className="border-t border-border/50 pt-4">
        <div className="text-xs font-semibold text-txt mb-2">
          {t("settings.rpcConfiguration", {
            defaultValue: "RPC Configuration",
          })}
        </div>
        <ConfigPageView embedded />
      </div>

      {/* Advanced: show local key import */}
      <div className="border-t border-border/50 pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between text-xs text-muted hover:text-txt"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {t("settings.showAdvancedKeyManagement", {
            defaultValue: "Advanced key management",
          })}
        </Button>
        {showAdvanced && (
          <div className="mt-3 rounded-lg border border-warn/20 bg-warn/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] text-warn">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("settings.advancedKeyWarning", {
                defaultValue: "Not needed with Steward. Use with caution.",
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function InventoryView() {
  const {
    walletConfig,
    walletAddresses,
    walletBalances,
    walletNfts,
    walletLoading,
    walletNftsLoading,
    inventoryView,
    inventorySort,
    inventorySortDirection,
    inventoryChainFilters,
    walletError,
    loadBalances,
    loadNfts,
    elizaCloudConnected,
    setState,
    setActionNotice,
    executeBscTrade,
    getBscTradePreflight,
    getBscTradeQuote,
    getBscTradeTxStatus,
    getStewardStatus,
    copyToClipboard,
    vincentConnected,
    vincentLoginBusy,
    vincentLoginError,
    handleVincentLogin,
    handleVincentDisconnect,
    t,
  } = useApp();

  // ── Tracked tokens state ──────────────────────────────────────────
  const [trackedTokens, setTrackedTokens] = useState<TrackedToken[]>(() =>
    loadTrackedTokens(),
  );
  const [trackedBscTokens, _setTrackedBscTokens] =
    useState(loadTrackedBscTokens);

  const accountLabel = "Account 1";

  // ── Wallet settings popup state ──────────────────────────────────
  const [walletRpcOpen, setWalletRpcOpen] = useState(false);
  const [walletPoliciesOpen, setWalletPoliciesOpen] = useState(false);
  const autoLoadedInventoryViewRef = useRef<"tokens" | "nfts" | null>(null);

  // ── Steward status ────────────────────────────────────────────────
  const [stewardStatus, setStewardStatus] =
    useState<StewardStatusResponse | null>(null);

  useEffect(() => {
    if (typeof getStewardStatus !== "function") {
      return;
    }

    let cancelled = false;
    getStewardStatus()
      .then((s) => {
        if (!cancelled) setStewardStatus(s);
      })
      .catch(() => {
        /* steward not available — ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [getStewardStatus]);

  useEffect(() => {
    if (autoLoadedInventoryViewRef.current === inventoryView) {
      return;
    }
    autoLoadedInventoryViewRef.current = inventoryView;

    if (inventoryView === "tokens") {
      if (!walletBalances && !walletLoading) {
        void loadBalances();
      }
      return;
    }

    if (!walletNfts && !walletNftsLoading) {
      void loadNfts();
    }
  }, [
    inventoryView,
    loadBalances,
    loadNfts,
    walletBalances,
    walletLoading,
    walletNfts,
    walletNftsLoading,
  ]);

  // ── RPC + wallet readiness ───────────────────────────────────────
  const cfg = walletConfig;
  const hasManagedBscRpc = Boolean(cfg?.managedBscRpcReady);
  const cloudManagedAccess = Boolean(
    cfg?.cloudManagedAccess || elizaCloudConnected,
  );

  const goToRpcSettings = useCallback(() => {
    setWalletRpcOpen(true);
  }, []);

  // ── Derived data (hook) ───────────────────────────────────────────
  const {
    singleChainFocus,
    focusedChainError,
    focusedChainName,
    focusedNativeBalance,
  } = useInventoryData({
    walletBalances,
    walletAddresses,
    walletConfig,
    walletNfts,
    inventorySort,
    inventorySortDirection,
    inventoryChainFilters,
    trackedBscTokens,
    trackedTokens,
  });

  const evmAddr = walletAddresses?.evmAddress ?? walletConfig?.evmAddress;
  const solAddr = walletAddresses?.solanaAddress ?? walletConfig?.solanaAddress;
  const loadedEvmChainKeys = new Set(
    (walletBalances?.evm?.chains ?? [])
      .filter((chain) => !chain.error)
      .map((chain) => resolveChainKey(chain.chain))
      .filter((chainKey): chainKey is ChainKey => chainKey !== null),
  );
  const evmChainErrors = new Map(
    (walletBalances?.evm?.chains ?? [])
      .map((chain) => [resolveChainKey(chain.chain), chain.error] as const)
      .filter((entry): entry is [ChainKey, string | null] => entry[0] !== null),
  );
  const ethereumReady = Boolean(
    evmAddr &&
      !evmChainErrors.get("ethereum") &&
      (loadedEvmChainKeys.has("ethereum") ||
        cfg?.ethereumBalanceReady ||
        cfg?.alchemyKeySet ||
        cloudManagedAccess),
  );
  const baseReady = Boolean(
    evmAddr &&
      !evmChainErrors.get("base") &&
      (loadedEvmChainKeys.has("base") ||
        cfg?.baseBalanceReady ||
        cfg?.alchemyKeySet ||
        cloudManagedAccess),
  );
  const bscReady = Boolean(
    evmAddr &&
      !evmChainErrors.get("bsc") &&
      (loadedEvmChainKeys.has("bsc") ||
        cfg?.bscBalanceReady ||
        cfg?.ankrKeySet ||
        hasManagedBscRpc),
  );
  const avaxReady = Boolean(
    evmAddr &&
      !evmChainErrors.get("avax") &&
      (loadedEvmChainKeys.has("avax") ||
        cfg?.avalancheBalanceReady ||
        cfg?.alchemyKeySet ||
        cloudManagedAccess),
  );
  const solanaReady = Boolean(
    solAddr &&
      (Boolean(walletBalances?.solana) ||
        cfg?.solanaBalanceReady ||
        cfg?.heliusKeySet ||
        cloudManagedAccess),
  );
  const bnbBalance = Number.parseFloat(focusedNativeBalance ?? "0") || 0;
  const tradeReady =
    singleChainFocus === "bsc" ? bnbBalance >= BSC_GAS_READY_THRESHOLD : true;
  // When steward is connected, use steward addresses for copy buttons
  const stewardEvmAddr = stewardStatus?.connected
    ? (stewardStatus.walletAddresses?.evm ?? stewardStatus.evmAddress ?? null)
    : null;
  const stewardSolAddr = stewardStatus?.connected
    ? (stewardStatus.walletAddresses?.solana ?? null)
    : null;
  const displayEvmAddr = stewardEvmAddr ?? evmAddr;
  const displaySolAddr = stewardSolAddr ?? solAddr;
  const focusedChainLabel =
    focusedChainName ??
    (singleChainFocus
      ? (CHAIN_CONFIGS[singleChainFocus as keyof typeof CHAIN_CONFIGS]?.name ??
        singleChainFocus)
      : null);
  const inlineError =
    singleChainFocus && focusedChainError
      ? {
          message: `${focusedChainLabel ?? "Chain"}: ${focusedChainError}`,
          retryTitle: `Retry fetching ${focusedChainLabel ?? "chain"} balances`,
        }
      : null;

  const legacyRpcChain = singleChainFocus
    ? chainKeyToWalletRpcChain(singleChainFocus)
    : null;
  const headerWarning =
    singleChainFocus &&
    legacyRpcChain !== null &&
    cfg?.legacyCustomChains?.includes(legacyRpcChain)
      ? {
          title: `${
            focusedChainLabel ??
            (singleChainFocus === "bsc"
              ? "BSC"
              : singleChainFocus === "solana"
                ? "Solana"
                : "EVM")
          } is using legacy raw RPC config.`,
          body: "Re-save a supported provider in Settings to migrate fully.",
          actionLabel: t("wallet.setup.configureRpc"),
        }
      : singleChainFocus === "bsc" && evmAddr && !bscReady
        ? {
            title: t("wallet.setup.rpcNotConfigured"),
            body: t("portfolioheader.ConnectViaElizaCl"),
            actionLabel: t("wallet.setup.configureRpc"),
          }
        : singleChainFocus === "solana" && solAddr && !solanaReady
          ? {
              title: "Solana RPC is not configured.",
              body: "Connect via Eliza Cloud or configure HELIUS_API_KEY / SOLANA_RPC_URL in Settings to load Solana balances.",
              actionLabel: t("wallet.setup.configureRpc"),
            }
          : singleChainFocus &&
              singleChainFocus !== "bsc" &&
              singleChainFocus !== "solana" &&
              evmAddr &&
              !(singleChainFocus === "ethereum"
                ? ethereumReady
                : singleChainFocus === "base"
                  ? baseReady
                  : singleChainFocus === "avax"
                    ? avaxReady
                    : false)
            ? {
                title: `${focusedChainLabel ?? "Chain"} access is not configured.`,
                body: `Connect via Eliza Cloud or configure ${focusedChainLabel ?? "this chain"} RPC access in Settings to load balances.`,
                actionLabel: t("wallet.setup.configureRpc"),
              }
            : null;

  // ── Tracked token handlers ────────────────────────────────────────
  const handleAddToken = useCallback(
    (token: TrackedToken) => {
      const updated = [...trackedTokens, token];
      setTrackedTokens(updated);
      saveTrackedTokens(updated);
    },
    [trackedTokens],
  );

  const handleCopyAddress = useCallback(
    async (address: string) => {
      await copyToClipboard(address);
      setActionNotice(t("wallet.addressCopied"), "success", 2000);
    },
    [copyToClipboard, setActionNotice, t],
  );

  const walletSidebar = (
    <Sidebar
      testId="wallets-sidebar"
      contentIdentity={`wallets:${inventoryView}`}
      header={
        <SidebarHeader className="space-y-3">
          <div className="flex flex-col gap-1.5 rounded-2xl border border-border/40 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_90%,transparent),color-mix(in_srgb,var(--bg)_96%,transparent))] px-3 py-2 shadow-sm">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium text-txt">
                {accountLabel}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1 rounded-full border border-border/30 bg-bg/40 px-1.5 py-0.5">
                  <WalletLogoStack />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 shrink-0 rounded-sm text-muted hover:text-txt"
                    data-testid="wallet-header-copy-address"
                    onClick={() => {
                      const target = displayEvmAddr ?? displaySolAddr;
                      if (target) void handleCopyAddress(target);
                    }}
                    aria-label="Copy wallet address"
                  >
                    <Copy className="h-2.5 w-2.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </SidebarHeader>
      }
      footer={
        <div className="flex w-full flex-col gap-2">
          <div className="space-y-2 border-t border-border/30 pt-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                data-testid="wallet-rpc-popup"
                className="h-11 flex-1 justify-start rounded-xl px-3 text-xs font-semibold shadow-sm"
                onClick={() => setWalletRpcOpen(true)}
                aria-label={t("settings.sections.walletrpc.label", {
                  defaultValue: "Wallet & RPC",
                })}
              >
                <Settings className="h-4 w-4" />
                {t("settings.sections.walletrpc.label", {
                  defaultValue: "Wallet & RPC",
                })}
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Button
                variant="outline"
                size="sm"
                data-testid="wallet-policies-popup"
                className="h-11 w-full justify-start rounded-xl px-3 text-xs font-semibold shadow-sm"
                onClick={() => setWalletPoliciesOpen(true)}
                aria-label={t("settings.sections.walletpolicies.label", {
                  defaultValue: "Wallet Policies",
                })}
              >
                <Shield className="h-4 w-4" />
                {t("settings.sections.walletpolicies.label", {
                  defaultValue: "Wallet Policies",
                })}
              </Button>
            </div>
          </div>

          {/* Vincent OAuth connect / disconnect */}
          <div className="border-t border-border/30 pt-2">
            {vincentConnected ? (
              <div className="flex items-center justify-between rounded-xl border border-accent/25 bg-accent/8 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-xs font-semibold text-txt">
                    {t("vincent.connected", {
                      defaultValue: "Vincent Connected",
                    })}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[10px] text-muted hover:text-danger"
                  onClick={() => void handleVincentDisconnect()}
                  data-testid="vincent-disconnect"
                >
                  <Unlink className="mr-1 h-3 w-3" />
                  {t("vincent.disconnect", { defaultValue: "Disconnect" })}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                data-testid="vincent-connect"
                className="h-11 w-full justify-start rounded-xl px-4 text-xs font-semibold shadow-sm"
                onClick={() => void handleVincentLogin()}
                disabled={vincentLoginBusy}
              >
                {vincentLoginBusy ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Link className="h-4 w-4" />
                )}
                {vincentLoginBusy
                  ? t("vincent.connecting", { defaultValue: "Connecting..." })
                  : t("vincent.connect", { defaultValue: "Connect Vincent" })}
              </Button>
            )}
            {vincentLoginError ? (
              <p className="mt-1 px-1 text-[10px] text-danger">
                {vincentLoginError}
              </p>
            ) : null}
          </div>
        </div>
      }
      >
      <SidebarScrollRegion>
        <SidebarPanel>
          <SidebarTokenList inventoryView={inventoryView} />
        </SidebarPanel>
      </SidebarScrollRegion>
    </Sidebar>
  );
  const stewardConnected = stewardStatus?.connected === true;
  const stewardEvmAddrPresent = Boolean(
    stewardConnected &&
      (stewardStatus?.walletAddresses?.evm || stewardStatus?.evmAddress),
  );
  const stewardSolAddrPresent = Boolean(
    stewardConnected && stewardStatus?.walletAddresses?.solana,
  );
  const hasAnyAddress = Boolean(
    evmAddr || solAddr || stewardEvmAddrPresent || stewardSolAddrPresent,
  );

  // ════════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════════

  // ── Standalone states (no two-panel layout) ─────────────────────
  if (walletLoading && !walletBalances) {
    return (
      <div className="flex flex-1 min-h-0 flex-col">
        <PageLayout
          sidebar={walletSidebar}
          contentInnerClassName="w-full"
        >
          <PagePanel.Loading
            variant="workspace"
            heading={t("wallet.loadingBalances")}
          />
        </PageLayout>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <PageLayout
        sidebar={walletSidebar}
        contentInnerClassName="w-full"
      >
        <div className="grid gap-3">
          {walletError ? (
            <PagePanel.Notice tone="danger">{walletError}</PagePanel.Notice>
          ) : null}

          {inlineError?.message ? (
            <PagePanel.Notice
              tone="danger"
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full border-danger/35 px-3 text-[11px] text-danger shadow-none hover:bg-danger/10"
                  onClick={() => void loadBalances()}
                  title={inlineError.retryTitle ?? t("common.retry")}
                >
                  {t("common.retry")}
                </Button>
              }
            >
              {inlineError.message}
            </PagePanel.Notice>
          ) : null}

          {headerWarning ? (
            <PagePanel.Notice
              tone="accent"
              actions={
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-[11px] font-medium text-accent"
                  onClick={goToRpcSettings}
                >
                  {headerWarning.actionLabel}
                </Button>
              }
            >
              <div className="font-semibold text-txt-strong">
                {headerWarning.title}
              </div>
              <div className="mt-1 text-muted">{headerWarning.body}</div>
            </PagePanel.Notice>
          ) : null}

          {/* Wallet setup card — shown when no wallet is connected */}
          {!hasAnyAddress && (
            <PagePanel variant="workspace">
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent">
                  <Wallet className="h-6 w-6" />
                </div>
                <div className="text-center">
                  <h3 className="text-sm font-semibold text-txt">
                    {t("wallet.setup.title", {
                      defaultValue: "Connect your wallet",
                    })}
                  </h3>
                  <p className="mt-1 max-w-sm text-xs text-muted">
                    {t("wallet.setup.description", {
                      defaultValue:
                        "Connect via Eliza Cloud, Vincent, or configure wallet keys directly to start trading.",
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {elizaCloudConnected ? (
                    <Button
                      variant="default"
                      size="sm"
                      className="rounded-full px-5"
                      onClick={goToRpcSettings}
                    >
                      {t("wallet.setup.importFromCloud", {
                        defaultValue: "Import from Eliza Cloud",
                      })}
                    </Button>
                  ) : null}
                  {!vincentConnected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full px-5"
                      onClick={() => void handleVincentLogin()}
                      disabled={vincentLoginBusy}
                    >
                      {vincentLoginBusy ? (
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Link className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {t("vincent.connect", {
                        defaultValue: "Connect Vincent",
                      })}
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full px-5"
                    onClick={goToRpcSettings}
                  >
                    <Settings className="mr-1.5 h-3.5 w-3.5" />
                    {t("wallet.setup.configureRpc", {
                      defaultValue: "Configure RPC",
                    })}
                  </Button>
                </div>
                {vincentLoginError ? (
                  <p className="text-[10px] text-danger">{vincentLoginError}</p>
                ) : null}
              </div>
            </PagePanel>
          )}

          {singleChainFocus === "bsc" ? (
            <TradePanel
              tradeReady={evmAddr ? tradeReady : false}
              bnbBalance={bnbBalance}
              onAddToken={handleAddToken}
              getBscTradePreflight={getBscTradePreflight}
              getBscTradeQuote={getBscTradeQuote}
              executeBscTrade={executeBscTrade}
              getBscTradeTxStatus={getBscTradeTxStatus}
              stewardConnected={stewardConnected}
            />
          ) : null}
        </div>

        <div className="mt-4 flex flex-1 min-h-0 flex-col">
          <div className="mb-4">
            <WalletChatBadges />
          </div>
          <div className="flex flex-1 min-h-[600px] flex-col">
            <ChatView alignMessagesLeft />
          </div>
        </div>
      </PageLayout>

      {/* ── Wallet & RPC popup ── */}
      <Dialog open={walletRpcOpen} onOpenChange={setWalletRpcOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {stewardConnected
                ? t("settings.sections.wallet.label", {
                    defaultValue: "Wallet",
                  })
                : t("settings.sections.walletrpc.label", {
                    defaultValue: "Wallet & RPC",
                  })}
            </DialogTitle>
          </DialogHeader>
          {stewardConnected && stewardStatus ? (
            <StewardWalletInfoPopup
              stewardStatus={stewardStatus}
              onOpenPolicies={() => {
                setWalletRpcOpen(false);
                setWalletPoliciesOpen(true);
              }}
            />
          ) : (
            <ConfigPageView embedded />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Wallet Policies popup ── */}
      <Dialog open={walletPoliciesOpen} onOpenChange={setWalletPoliciesOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("settings.sections.walletpolicies.label", {
                defaultValue: "Wallet Policies",
              })}
            </DialogTitle>
          </DialogHeader>
          <PolicyControlsView />
        </DialogContent>
      </Dialog>
    </div>
  );
}
