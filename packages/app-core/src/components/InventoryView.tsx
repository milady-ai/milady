/**
 * Inventory view — unified wallet balances, NFTs, and scoped BSC trading.
 *
 * This is a thin coordinator that delegates rendering to sub-components
 * inside the ./inventory/ directory.
 */

import type { StewardStatusResponse } from "@miladyai/app-core/api";
import { useApp } from "@miladyai/app-core/state";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@miladyai/ui";
import {
  Coins,
  Copy,
  Image as ImageIcon,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TradePanel } from "./BscTradePanel";
import {
  CHAIN_CONFIGS,
  type ChainKey,
  chainKeyToWalletRpcChain,
  PRIMARY_CHAIN_KEYS,
  resolveChainKey,
} from "./chainConfig";
import {
  DESKTOP_PAGE_CONTENT_CLASSNAME,
  DESKTOP_RAIL_SUMMARY_CARD_CLASSNAME,
  DESKTOP_SURFACE_PANEL_CLASSNAME,
  DesktopPageFrame,
} from "./desktop-surface-primitives";
import {
  BSC_GAS_READY_THRESHOLD,
  loadTrackedBscTokens,
  loadTrackedTokens,
  removeTrackedBscToken,
  saveTrackedTokens,
  type TrackedToken,
} from "./inventory";
import { ChainIcon } from "./inventory/ChainIcon";
import { NftGrid } from "./inventory/NftGrid";
import { TokensTable } from "./inventory/TokensTable";
import { useInventoryData } from "./inventory/useInventoryData";
import {
  APP_PANEL_SHELL_CLASSNAME,
  APP_SIDEBAR_CARD_ACTIVE_CLASSNAME,
  APP_SIDEBAR_CARD_BASE_CLASSNAME,
  APP_SIDEBAR_CARD_INACTIVE_CLASSNAME,
  APP_SIDEBAR_HEADER_CLASSNAME,
  APP_SIDEBAR_INNER_CLASSNAME,
  APP_SIDEBAR_KICKER_CLASSNAME,
  APP_SIDEBAR_RAIL_CLASSNAME,
} from "./sidebar-shell-styles";

/* ── Component ─────────────────────────────────────────────────────── */

const WALLET_SHELL_CLASS = APP_PANEL_SHELL_CLASSNAME;
const WALLET_SIDEBAR_CLASS = `lg:w-[21rem] lg:max-w-[352px] ${APP_SIDEBAR_RAIL_CLASSNAME}`;
const WALLET_SIDEBAR_KICKER_CLASS = APP_SIDEBAR_KICKER_CLASSNAME;
const WALLET_SIDEBAR_ITEM_BASE_CLASS = APP_SIDEBAR_CARD_BASE_CLASSNAME;
const WALLET_SIDEBAR_ITEM_ACTIVE_CLASS = APP_SIDEBAR_CARD_ACTIVE_CLASSNAME;
const WALLET_SIDEBAR_ITEM_INACTIVE_CLASS = APP_SIDEBAR_CARD_INACTIVE_CLASSNAME;
const WALLET_PANEL_CLASS = DESKTOP_SURFACE_PANEL_CLASSNAME;

function countVisibleAssetsForFocus(
  focus: string,
  rows:
    | Array<{
        chain: string;
        balanceRaw: number;
        valueUsd: number;
        isTracked?: boolean;
      }>
    | undefined,
): number {
  return (rows ?? []).filter((row) => {
    const hasBalance = row.isTracked || row.balanceRaw > 0 || row.valueUsd > 0;
    if (!hasBalance) return false;
    if (focus === "all") return true;
    return resolveChainKey(row.chain) === focus;
  }).length;
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
    inventoryChainFocus,
    walletError,
    loadBalances,
    loadNfts,
    elizaCloudConnected,
    setTab,
    setState,
    setActionNotice,
    executeBscTrade,
    getBscTradePreflight,
    getBscTradeQuote,
    getBscTradeTxStatus,
    getStewardStatus,
    copyToClipboard,
    t,
  } = useApp();

  // ── Tracked tokens state ──────────────────────────────────────────
  const [trackedTokens, setTrackedTokens] = useState<TrackedToken[]>(() =>
    loadTrackedTokens(),
  );
  const [trackedBscTokens, setTrackedBscTokens] =
    useState(loadTrackedBscTokens);

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

  // ── RPC + wallet readiness ───────────────────────────────────────
  const cfg = walletConfig;
  const hasManagedBscRpc = Boolean(cfg?.managedBscRpcReady);
  const cloudManagedAccess = Boolean(
    cfg?.cloudManagedAccess || elizaCloudConnected,
  );

  const goToRpcSettings = useCallback(() => {
    setTab("settings");
    setTimeout(() => {
      document
        .getElementById("wallet-rpc")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }, [setTab]);

  // ── Derived data (hook) ───────────────────────────────────────────
  const {
    chainFocus,
    tokenRows,
    allNfts,
    focusedChainError,
    focusedChainName,
    visibleRows,
    totalUsd,
    visibleChainErrors,
    focusedNativeBalance,
  } = useInventoryData({
    walletBalances,
    walletAddresses,
    walletConfig,
    walletNfts,
    inventorySort,
    inventoryChainFocus,
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
    chainFocus === "bsc" ? bnbBalance >= BSC_GAS_READY_THRESHOLD : true;
  const addresses = [
    evmAddr ? { label: "EVM", address: evmAddr } : null,
    solAddr ? { label: "Solana", address: solAddr } : null,
  ].filter((item): item is { label: string; address: string } => Boolean(item));

  const chainItemMeta = useMemo(() => {
    const totalAssetCount = countVisibleAssetsForFocus("all", tokenRows);
    const items = [
      {
        key: "all",
        label: "All Assets",
        hasAddress: true,
        description:
          totalAssetCount > 0
            ? `${totalAssetCount} assets across connected wallets`
            : "Browse every connected chain from one place",
      },
    ];

    for (const key of PRIMARY_CHAIN_KEYS) {
      const config = CHAIN_CONFIGS[key];
      const assetCount = countVisibleAssetsForFocus(key, tokenRows);
      const chainReady =
        key === "ethereum"
          ? ethereumReady
          : key === "base"
            ? baseReady
            : key === "bsc"
              ? bscReady
              : key === "avax"
                ? avaxReady
                : key === "solana"
                  ? solanaReady
                  : false;
      const hasAddress = key === "solana" ? Boolean(solAddr) : Boolean(evmAddr);

      items.push({
        key,
        label: config.name,
        hasAddress,
        description: !hasAddress
          ? "No wallet address yet"
          : chainReady
            ? assetCount > 0
              ? `${assetCount} visible assets`
              : "Connected and ready"
            : "Needs RPC setup",
      });
    }

    return items;
  }, [
    avaxReady,
    baseReady,
    bscReady,
    ethereumReady,
    evmAddr,
    solAddr,
    solanaReady,
    tokenRows,
  ]);

  const focusedChainLabel =
    focusedChainName ??
    (chainFocus !== "all"
      ? (CHAIN_CONFIGS[chainFocus as keyof typeof CHAIN_CONFIGS]?.name ??
        chainFocus)
      : null);
  const inlineError =
    chainFocus !== "all" && focusedChainError
      ? {
          message: `${focusedChainLabel ?? "Chain"}: ${focusedChainError}`,
          retryTitle: `Retry fetching ${focusedChainLabel ?? "chain"} balances`,
        }
      : null;

  const legacyRpcChain = chainKeyToWalletRpcChain(chainFocus);
  const headerWarning =
    chainFocus !== "all" &&
    legacyRpcChain !== null &&
    cfg?.legacyCustomChains?.includes(legacyRpcChain)
      ? {
          title: `${
            focusedChainLabel ??
            (chainFocus === "bsc"
              ? "BSC"
              : chainFocus === "solana"
                ? "Solana"
                : "EVM")
          } is using legacy raw RPC config.`,
          body: "Re-save a supported provider in Settings to migrate fully.",
          actionLabel: t("wallet.setup.configureRpc"),
        }
      : chainFocus === "bsc" && evmAddr && !bscReady
        ? {
            title: t("wallet.setup.rpcNotConfigured"),
            body: t("portfolioheader.ConnectViaElizaCl"),
            actionLabel: t("wallet.setup.configureRpc"),
          }
        : chainFocus === "solana" && solAddr && !solanaReady
          ? {
              title: "Solana RPC is not configured.",
              body: "Connect via Eliza Cloud or configure HELIUS_API_KEY / SOLANA_RPC_URL in Settings to load Solana balances.",
              actionLabel: t("wallet.setup.configureRpc"),
            }
          : chainFocus !== "all" &&
              chainFocus !== "bsc" &&
              chainFocus !== "solana" &&
              evmAddr &&
              !(chainFocus === "ethereum"
                ? ethereumReady
                : chainFocus === "base"
                  ? baseReady
                  : chainFocus === "avax"
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

  const handleUntrackToken = useCallback(
    (address: string) => {
      const updated = trackedTokens.filter(
        (tk) => tk.address.toLowerCase() !== address.toLowerCase(),
      );
      setTrackedTokens(updated);
      saveTrackedTokens(updated);
      setTrackedBscTokens((prev) => removeTrackedBscToken(address, prev));
      setActionNotice(t("wallet.tokenRemovedManual"), "info", 2200);
    },
    [trackedTokens, setActionNotice, t],
  );

  const handleCopyAddress = useCallback(
    async (address: string) => {
      await copyToClipboard(address);
      setActionNotice(t("wallet.addressCopied"), "success", 2000);
    },
    [copyToClipboard, setActionNotice, t],
  );

  // ════════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════════

  // ── Standalone states (no two-panel layout) ─────────────────────
  if (walletLoading && !walletBalances) {
    return (
      <DesktopPageFrame>
        <div className={`${WALLET_SHELL_CLASS} items-center justify-center`}>
          <div
            className={`${WALLET_PANEL_CLASS} px-6 py-10 text-center text-sm text-muted`}
          >
            {t("wallet.loadingBalances")}
          </div>
        </div>
      </DesktopPageFrame>
    );
  }

  if (!evmAddr && !solAddr) {
    return (
      <DesktopPageFrame>
        <div className={`${WALLET_SHELL_CLASS} items-center justify-center`}>
          <div
            className={`mx-4 w-full max-w-xl ${WALLET_PANEL_CLASS} px-6 py-8 text-center`}
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent">
              <Wallet className="h-6 w-6" />
            </div>
            <div className="text-base font-semibold text-txt-strong">
              {t("wallet.noOnchainWallet")}
            </div>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
              {t("wallet.noOnchainWalletHint")}
            </p>
            <Button
              variant="default"
              size="sm"
              className="mt-5 rounded-full px-5"
              onClick={() => setTab("settings")}
            >
              {t("nav.settings")}
            </Button>
          </div>
        </div>
      </DesktopPageFrame>
    );
  }

  // ── Wallet layout ───────────────────────────────────────────────
  return (
    <DesktopPageFrame>
      <div className={WALLET_SHELL_CLASS}>
        <aside className={WALLET_SIDEBAR_CLASS}>
          <div className={APP_SIDEBAR_INNER_CLASSNAME}>
            <div className={APP_SIDEBAR_HEADER_CLASSNAME}>
              <div className={WALLET_SIDEBAR_KICKER_CLASS}>WALLET</div>
            </div>

            <div className={`mt-4 ${DESKTOP_RAIL_SUMMARY_CARD_CLASSNAME}`}>
              <div
                className="text-[2rem] font-semibold leading-none text-txt-strong"
                data-testid="wallet-balance-value"
              >
                {totalUsd > 0
                  ? `$${totalUsd.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : "$0.00"}
              </div>
              <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/60">
                total balance
              </div>
            </div>

            {/* ── View toggle ── */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                variant="ghost"
                size="sm"
                data-testid="wallet-view-tokens"
                className={`h-10 rounded-xl border text-xs font-semibold ${
                  inventoryView === "tokens"
                    ? WALLET_SIDEBAR_ITEM_ACTIVE_CLASS
                    : "border-border/45 bg-bg/20 text-muted hover:border-border/70 hover:bg-bg/35 hover:text-txt"
                }`}
                onClick={() => {
                  setState("inventoryView", "tokens");
                  if (!walletBalances) void loadBalances();
                }}
              >
                <Coins className="h-3.5 w-3.5" />
                {t("wallet.tokens")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-testid="wallet-view-nfts"
                className={`h-10 rounded-xl border text-xs font-semibold ${
                  inventoryView === "nfts"
                    ? WALLET_SIDEBAR_ITEM_ACTIVE_CLASS
                    : "border-border/45 bg-bg/20 text-muted hover:border-border/70 hover:bg-bg/35 hover:text-txt"
                }`}
                onClick={() => {
                  setState("inventoryView", "nfts");
                  if (!walletNfts) void loadNfts();
                }}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                {t("wallet.nfts")}
              </Button>
            </div>

            {/* ── Chains ── */}
            <div className="mt-4">
              <div className={WALLET_SIDEBAR_KICKER_CLASS}>chains</div>
              <TooltipProvider delayDuration={200} skipDelayDuration={100}>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {chainItemMeta.map((item) => {
                    const isActive = chainFocus === item.key;
                    const label = item.key === "all" ? "All chains" : item.label;
                    const disabled = !item.hasAddress;
                    return (
                      <Tooltip key={item.key}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={disabled ? undefined : () => setState("inventoryChainFocus", item.key)}
                            aria-current={isActive ? "page" : undefined}
                            aria-label={label}
                            aria-disabled={disabled}
                            className={`flex aspect-square items-center justify-center rounded-2xl border transition-colors ${
                              disabled
                                ? "opacity-25 cursor-not-allowed border-border/20 bg-bg/10 text-muted"
                                : isActive
                                  ? "border-accent/30 bg-accent/14 text-txt-strong"
                                  : "border-border/40 bg-bg/20 text-muted hover:border-border/60 hover:text-txt"
                            }`}
                          >
                            {item.key === "all"
                        ? <span className="text-[11px] font-bold uppercase">all</span>
                        : <ChainIcon chain={item.key} size="lg" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          sideOffset={6}
                          className="px-2.5 py-1.5 text-xs font-medium"
                        >
                          {disabled ? `${label} — no wallet configured` : label}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            </div>

            {/* ── Copy + Refresh (stacked under chains) ── */}
            <div className="mt-4 space-y-2">
              {addresses.map((item) => (
                <Button
                  key={`${item.label}-${item.address}`}
                  variant="outline"
                  size="sm"
                  data-testid={`wallet-copy-${item.label.toLowerCase()}-address`}
                  className="h-11 w-full justify-start rounded-xl px-4 text-xs font-semibold shadow-sm"
                  onClick={() => void handleCopyAddress(item.address)}
                >
                  <Copy className="h-4 w-4" />
                  {item.label === "EVM"
                    ? t("wallet.copyEvmAddress")
                    : t("wallet.copySolanaAddress")}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-11 w-full justify-start rounded-xl px-4 text-xs font-semibold shadow-sm"
                onClick={() =>
                  inventoryView === "tokens" ? loadBalances() : loadNfts()
                }
              >
                <RefreshCw className="h-4 w-4" />
                refresh
              </Button>
            </div>
          </div>
        </aside>

        <div className={DESKTOP_PAGE_CONTENT_CLASSNAME}>
          <div className="mx-auto max-w-[76rem] px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
            <section className={`${WALLET_PANEL_CLASS} px-5 py-5 sm:px-6`}>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-txt-strong">
                  Wallet Overview
                </h1>
                <p className="mt-1 text-sm text-muted">
                  Track balances, managed addresses, and trading readiness in one place.
                </p>
              </div>
            </section>

            <div className="mt-4 grid gap-3">
              {stewardStatus?.connected && (
                <div
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-accent/25 bg-accent/10 px-3 py-2 text-[11px] text-accent-fg shadow-sm"
                  data-testid="steward-status-badge"
                >
                  <span>🔐</span>
                  <span>Steward vault connected</span>
                  {stewardStatus.evmAddress && (
                    <span className="ml-1 font-mono text-muted">
                      {stewardStatus.evmAddress.slice(0, 6)}…
                      {stewardStatus.evmAddress.slice(-4)}
                    </span>
                  )}
                </div>
              )}

              {walletError && (
                <div className="rounded-2xl border border-danger/25 bg-danger/8 px-4 py-3 text-sm text-danger shadow-sm">
                  {walletError}
                </div>
              )}

              {inlineError?.message && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/25 bg-danger/8 px-4 py-3 text-sm text-danger shadow-sm">
                  <span>{inlineError.message}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full border-danger/35 px-3 text-[11px] text-danger shadow-none hover:bg-danger/10"
                    onClick={() => void loadBalances()}
                    title={inlineError.retryTitle ?? t("common.retry")}
                  >
                    {t("common.retry")}
                  </Button>
                </div>
              )}

              {headerWarning && (
                <div className="rounded-2xl border border-accent/25 bg-accent/8 px-4 py-3 text-sm shadow-sm">
                  <div className="font-semibold text-txt-strong">
                    {headerWarning.title}
                  </div>
                  <div className="mt-1 text-muted">{headerWarning.body}</div>
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-2 h-auto p-0 text-[11px] font-medium text-accent"
                    onClick={goToRpcSettings}
                  >
                    {headerWarning.actionLabel}
                  </Button>
                </div>
              )}

              {chainFocus === "bsc" && evmAddr && (
                <TradePanel
                  tradeReady={tradeReady}
                  bnbBalance={bnbBalance}
                  onAddToken={handleAddToken}
                  getBscTradePreflight={getBscTradePreflight}
                  getBscTradeQuote={getBscTradeQuote}
                  executeBscTrade={executeBscTrade}
                  getBscTradeTxStatus={getBscTradeTxStatus}
                />
              )}
            </div>

            <div className="mt-4">
              <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/60">
                assets
              </div>
            </div>
            <div
              className={`min-h-[58vh] ${WALLET_PANEL_CLASS} overflow-hidden`}
            >
              {inventoryView === "tokens" ? (
                <TokensTable
                  t={t}
                  walletLoading={walletLoading}
                  walletBalances={walletBalances}
                  visibleRows={visibleRows}
                  visibleChainErrors={visibleChainErrors}
                  inventoryChainFocus={inventoryChainFocus ?? "all"}
                  handleUntrackToken={handleUntrackToken}
                />
              ) : (
                <NftGrid
                  t={t}
                  walletNftsLoading={walletNftsLoading}
                  walletNfts={walletNfts}
                  allNfts={allNfts}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </DesktopPageFrame>
  );
}
