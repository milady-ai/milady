/**
 * Inventory view — unified wallet balances, NFTs, and scoped BSC trading.
 *
 * This is a thin coordinator that delegates rendering to sub-components
 * inside the ./inventory/ directory.
 */

import { client } from "@miladyai/app-core/api";
import { useApp } from "@miladyai/app-core/state";
import { Button, Input } from "@miladyai/ui";
import { useCallback, useEffect, useState } from "react";
import { TradePanel } from "./BscTradePanel";
import {
  CHAIN_CONFIGS,
  type ChainKey,
  chainKeyToWalletRpcChain,
  resolveChainKey,
} from "./chainConfig";
import {
  loadTrackedBscTokens,
  loadTrackedTokens,
  removeTrackedBscToken,
  saveTrackedTokens,
  type TrackedToken,
} from "./inventory";
import { InventoryToolbar } from "./inventory/InventoryToolbar";
import { NftGrid } from "./inventory/NftGrid";
import { TokensTable } from "./inventory/TokensTable";
import { useInventoryData } from "./inventory/useInventoryData";

const WALLET_BACKUP_REMINDER_DISMISSED_KEY =
  "milady.wallet.backupReminderDismissed";

/* ── Component ─────────────────────────────────────────────────────── */

export function InventoryView({ inModal }: { inModal?: boolean } = {}) {
  const {
    walletConfig,
    walletAddresses,
    walletBalances,
    walletNfts,
    walletLoading,
    walletNftsLoading,
    walletExportData,
    walletExportVisible,
    inventoryView,
    inventorySort,
    inventoryChainFocus,
    walletError,
    loadInventory,
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
    handleExportKeys,
    copyToClipboard,
    t,
  } = useApp();

  // ── Tracked tokens state ──────────────────────────────────────────
  const [trackedTokens, setTrackedTokens] = useState<TrackedToken[]>(() =>
    loadTrackedTokens(),
  );
  const [trackedBscTokens, setTrackedBscTokens] =
    useState(loadTrackedBscTokens);
  const [backupReminderDismissed, setBackupReminderDismissed] = useState(false);
  const [exportTokenInput, setExportTokenInput] = useState("");
  const [savingExportToken, setSavingExportToken] = useState(false);
  const [exportPasswordConfigured, setExportPasswordConfigured] =
    useState(false);
  const [walletSetupBusy, setWalletSetupBusy] = useState<
    "create" | "import" | "privy" | null
  >(null);
  const [importChain, setImportChain] = useState<"evm" | "solana">("evm");
  const [importPrivateKey, setImportPrivateKey] = useState("");
  const [privyEnabled, setPrivyEnabled] = useState(false);
  const [privyConfigured, setPrivyConfigured] = useState(false);
  const [privyUserId, setPrivyUserId] = useState("milady-local-user");
  const [walletSetupStep, setWalletSetupStep] = useState<1 | 2 | 3>(1);
  const [walletSetupMode, setWalletSetupMode] = useState<
    "local-create" | "local-import" | "managed-privy" | null
  >(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed =
      window.localStorage.getItem(WALLET_BACKUP_REMINDER_DISMISSED_KEY) === "1";
    setBackupReminderDismissed(dismissed);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadExportPasswordStatus = async () => {
      try {
        const status = await client.getWalletExportPasswordStatus();
        if (!cancelled) {
          setExportPasswordConfigured(Boolean(status.configured));
        }
      } catch {
        if (!cancelled) {
          setExportPasswordConfigured(false);
        }
      }
    };
    void loadExportPasswordStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadPrivyStatus = async () => {
      try {
        const status = await client.getPrivyStatus();
        if (!cancelled) {
          setPrivyEnabled(Boolean(status.enabled));
          setPrivyConfigured(Boolean(status.configured));
        }
      } catch {
        if (!cancelled) {
          setPrivyEnabled(false);
          setPrivyConfigured(false);
        }
      }
    };
    void loadPrivyStatus();
    return () => {
      cancelled = true;
    };
  }, []);

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
  const hasLocalEvmKey = Boolean(walletConfig?.localEvmKeyPresent);
  const hasLocalSolanaKey = Boolean(walletConfig?.localSolanaKeyPresent);
  const hasLocalWallet = hasLocalEvmKey || hasLocalSolanaKey;
  const hasManagedWallet = Boolean(
    walletConfig?.managedEvmAddressPresent ||
      walletConfig?.managedSolanaAddressPresent,
  );
  const walletModeLabel = hasLocalWallet
    ? "Local keys"
    : hasManagedWallet || privyEnabled
      ? "Managed wallet"
      : "Not configured";
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
  const tradeReady = true;
  const bnbBalance = Number.parseFloat(focusedNativeBalance ?? "0") || 0;
  const addresses = [
    evmAddr ? { label: "EVM", address: evmAddr } : null,
    solAddr ? { label: "Solana", address: solAddr } : null,
  ].filter((item): item is { label: string; address: string } => Boolean(item));

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

  const handleCopyPrivateKey = useCallback(
    async (value: string, chainLabel: string) => {
      await copyToClipboard(value);
      setActionNotice(`${chainLabel} private key copied.`, "info", 2200);
    },
    [copyToClipboard, setActionNotice],
  );

  const dismissBackupReminder = useCallback(() => {
    setBackupReminderDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(WALLET_BACKUP_REMINDER_DISMISSED_KEY, "1");
    }
  }, []);

  const handleSaveExportToken = useCallback(async () => {
    const value = exportTokenInput.trim();
    if (!value) {
      setActionNotice("Enter an export password first.", "error", 2400);
      return;
    }
    setSavingExportToken(true);
    try {
      const result = await client.setWalletExportPassword(value, {
        persist: true,
      });
      setExportPasswordConfigured(true);
      setActionNotice(
        result.persisted
          ? "Export password saved."
          : "Export password set for this session.",
        "success",
        2600,
      );
      setExportTokenInput("");
    } catch (err) {
      setActionNotice(
        err instanceof Error ? err.message : "Failed to save export password.",
        "error",
        3600,
      );
    } finally {
      setSavingExportToken(false);
    }
  }, [exportTokenInput, setActionNotice]);

  const handleGenerateLocalWallet = useCallback(async () => {
    setWalletSetupBusy("create");
    try {
      await client.generateWallet("both");
      await loadInventory();
      setWalletSetupStep(3);
      setActionNotice("Created local EVM and Solana wallets.", "success", 2400);
    } catch (err) {
      setActionNotice(
        err instanceof Error ? err.message : "Failed to create local wallets.",
        "error",
        3200,
      );
    } finally {
      setWalletSetupBusy(null);
    }
  }, [loadInventory, setActionNotice]);

  const handleImportLocalWallet = useCallback(async () => {
    const key = importPrivateKey.trim();
    if (!key) {
      setActionNotice("Paste a private key first.", "error", 2200);
      return;
    }
    setWalletSetupBusy("import");
    try {
      const result = await client.importWallet(key, importChain);
      if (!result.success || !result.address) {
        throw new Error(result.error || "Wallet import failed.");
      }
      await loadInventory();
      setImportPrivateKey("");
      setWalletSetupStep(3);
      setActionNotice(
        `Imported ${importChain.toUpperCase()} wallet ${result.address}.`,
        "success",
        2800,
      );
    } catch (err) {
      setActionNotice(
        err instanceof Error ? err.message : "Failed to import wallet.",
        "error",
        3600,
      );
    } finally {
      setWalletSetupBusy(null);
    }
  }, [importChain, importPrivateKey, loadInventory, setActionNotice]);

  const handleSetupManagedWallet = useCallback(async () => {
    if (!privyEnabled) {
      setActionNotice(
        "Managed wallet is not configured on this agent yet.",
        "error",
        2600,
      );
      return;
    }
    const userId = privyUserId.trim();
    if (!userId) {
      setActionNotice("Set a managed wallet user id first.", "error", 2200);
      return;
    }
    setWalletSetupBusy("privy");
    try {
      await client.loginPrivy(userId);
      await loadInventory();
      setWalletSetupStep(3);
      setActionNotice("Managed wallet provisioning requested.", "success", 2600);
    } catch (err) {
      setActionNotice(
        err instanceof Error
          ? err.message
          : "Failed to set up managed wallet.",
        "error",
        3600,
      );
    } finally {
      setWalletSetupBusy(null);
    }
  }, [loadInventory, privyEnabled, privyUserId, setActionNotice]);

  // ════════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════════

  // ── Standalone states (no two-panel layout) ─────────────────────
  if (walletLoading && !walletBalances) {
    return (
      <div className={inModal ? "p-6 h-full overflow-y-auto" : ""}>
        <div className="text-center py-10 text-muted italic mt-6">
          {t("wallet.loadingBalances")}
        </div>
      </div>
    );
  }

  if (!evmAddr && !solAddr) {
    return (
      <div className={inModal ? "p-6 h-full overflow-y-auto" : ""}>
        <div
          className={`mt-4 border px-4 py-6 text-center ${
            inModal
              ? "border-[var(--border)] bg-[rgba(255,255,255,0.04)] backdrop-blur-sm rounded-xl"
              : "border-border bg-card"
          }`}
        >
          <div className="text-sm font-bold mb-1">Wallet setup required</div>
          <p className="text-xs text-muted mb-3">
            Choose how this agent should use wallets. Nothing is auto-created.
          </p>

          <div className="mx-auto mb-3 flex w-full max-w-[42rem] items-center gap-2 text-[10px]">
            <span
              className={`rounded px-2 py-0.5 ${walletSetupStep >= 1 ? "bg-accent/20 text-accent" : "bg-card/50 text-muted"}`}
            >
              1. Choose mode
            </span>
            <span
              className={`rounded px-2 py-0.5 ${walletSetupStep >= 2 ? "bg-accent/20 text-accent" : "bg-card/50 text-muted"}`}
            >
              2. Configure
            </span>
            <span
              className={`rounded px-2 py-0.5 ${walletSetupStep >= 3 ? "bg-accent/20 text-accent" : "bg-card/50 text-muted"}`}
            >
              3. Confirm backup
            </span>
          </div>

          <div className="mx-auto grid w-full max-w-[42rem] gap-3 text-left">
            {walletSetupStep === 1 && (
              <>
                <div className="rounded border border-border/40 bg-card/40 p-3">
                  <div className="mb-2 text-xs font-semibold text-txt-strong">
                    Create local wallets
                  </div>
                  <p className="mb-2 text-[11px] text-muted">
                    New EVM + Solana keys generated on this machine.
                  </p>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setWalletSetupMode("local-create");
                      setWalletSetupStep(2);
                    }}
                  >
                    Use local generated keys
                  </Button>
                </div>

                <div className="rounded border border-border/40 bg-card/40 p-3">
                  <div className="mb-2 text-xs font-semibold text-txt-strong">
                    Import existing local wallet
                  </div>
                  <p className="mb-2 text-[11px] text-muted">
                    Bring your existing private key.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setWalletSetupMode("local-import");
                      setWalletSetupStep(2);
                    }}
                  >
                    Use imported local key
                  </Button>
                </div>

                <div className="rounded border border-border/40 bg-card/40 p-3">
                  <div className="mb-2 text-xs font-semibold text-txt-strong">
                    Use managed wallet (Privy)
                  </div>
                  <p className="mb-2 text-[11px] text-muted">
                    Status:{" "}
                    <span
                      className={
                        privyConfigured ? "text-ok font-medium" : "text-warn"
                      }
                    >
                      {privyConfigured ? "Configured" : "Not configured"}
                    </span>
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setWalletSetupMode("managed-privy");
                      setWalletSetupStep(2);
                    }}
                  >
                    Use managed wallet
                  </Button>
                </div>
              </>
            )}

            {walletSetupStep === 2 && walletSetupMode === "local-create" && (
              <div className="rounded border border-border/40 bg-card/40 p-3">
                <div className="mb-2 text-xs font-semibold text-txt-strong">
                  Create local wallets
                </div>
                <p className="mb-2 text-[11px] text-muted">
                  This creates new EVM and Solana keys.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => void handleGenerateLocalWallet()}
                    disabled={walletSetupBusy !== null}
                  >
                    {walletSetupBusy === "create"
                      ? "Creating..."
                      : "Create local wallets"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setWalletSetupStep(1)}
                  >
                    Back
                  </Button>
                </div>
              </div>
            )}

            {walletSetupStep === 2 && walletSetupMode === "local-import" && (
              <div className="rounded border border-border/40 bg-card/40 p-3">
                <div className="mb-2 text-xs font-semibold text-txt-strong">
                  Import existing local wallet
                </div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Button
                    variant={importChain === "evm" ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2 py-0.5 text-[11px]"
                    onClick={() => setImportChain("evm")}
                  >
                    EVM
                  </Button>
                  <Button
                    variant={importChain === "solana" ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2 py-0.5 text-[11px]"
                    onClick={() => setImportChain("solana")}
                  >
                    Solana
                  </Button>
                </div>
                <Input
                  value={importPrivateKey}
                  onChange={(e) => setImportPrivateKey(e.target.value)}
                  placeholder={`Paste ${importChain.toUpperCase()} private key`}
                  className="mb-2 h-8 text-[11px]"
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleImportLocalWallet()}
                    disabled={walletSetupBusy !== null}
                  >
                    {walletSetupBusy === "import"
                      ? "Importing..."
                      : `Import ${importChain.toUpperCase()} wallet`}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setWalletSetupStep(1)}
                  >
                    Back
                  </Button>
                </div>
              </div>
            )}

            {walletSetupStep === 2 && walletSetupMode === "managed-privy" && (
              <div className="rounded border border-border/40 bg-card/40 p-3">
                <div className="mb-2 text-xs font-semibold text-txt-strong">
                  Use managed wallet (Privy)
                </div>
                <p className="mb-2 text-[11px] text-muted">
                  Status:{" "}
                  <span
                    className={
                      privyConfigured ? "text-ok font-medium" : "text-warn"
                    }
                  >
                    {privyConfigured ? "Configured" : "Not configured"}
                  </span>
                </p>
                <Input
                  value={privyUserId}
                  onChange={(e) => setPrivyUserId(e.target.value)}
                  placeholder="Managed wallet user id"
                  className="mb-2 h-8 text-[11px]"
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleSetupManagedWallet()}
                    disabled={walletSetupBusy !== null || !privyEnabled}
                  >
                    {walletSetupBusy === "privy"
                      ? "Provisioning..."
                      : "Set up managed wallet"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setWalletSetupStep(1)}
                  >
                    Back
                  </Button>
                </div>
              </div>
            )}

            {walletSetupStep === 3 && (
              <div className="rounded border border-warn/50 bg-warn/5 p-3">
                <div className="mb-1 text-xs font-semibold text-txt-strong">
                  Confirm backup
                </div>
                <p className="text-[11px] text-muted">
                  If you chose local keys, back them up immediately after wallet
                  creation.
                </p>
              </div>
            )}
          </div>

          <div className="mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="font-mono"
              onClick={() => setTab("settings")}
            >
              {t("nav.settings")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Wallet layout ───────────────────────────────────────────────
  return (
    <div
      className={`flex min-h-full w-full flex-col ${inModal ? "p-6 h-full overflow-y-auto" : ""}`}
    >
      <InventoryToolbar
        t={t}
        totalUsd={totalUsd}
        inventoryView={inventoryView}
        inventorySort={inventorySort}
        chainFocus={chainFocus}
        walletBalances={walletBalances}
        walletNfts={walletNfts}
        addresses={addresses}
        onCopyAddress={handleCopyAddress}
        setState={setState}
        onChainChange={(chain) => setState("inventoryChainFocus", chain)}
        loadBalances={loadBalances}
        loadNfts={loadNfts}
      />

      <div className="mt-3 flex flex-col gap-2">
        <div className="border-l-2 border-accent/70 pl-3 py-1 text-[11px]">
          <span className="font-semibold text-txt-strong">Wallet mode:</span>{" "}
          <span className="text-accent">{walletModeLabel}</span>
          {privyEnabled && hasLocalWallet && (
            <span className="ml-2 text-muted">
              (Managed wallet available, local keys currently active)
            </span>
          )}
        </div>

        {walletError && (
          <div className="border-l-2 border-danger/70 pl-3 py-1 text-xs text-danger">
            {walletError}
          </div>
        )}

        {inlineError?.message && (
          <div className="flex items-center gap-2 border-l-2 border-danger/70 pl-3 py-1 text-[11px] text-danger">
            <span>{inlineError.message}</span>
            <Button
              variant="link"
              size="sm"
              className="text-[11px] font-medium text-danger h-auto p-0"
              onClick={() => void loadBalances()}
              title={inlineError.retryTitle ?? t("common.retry")}
            >
              {t("common.retry")}
            </Button>
          </div>
        )}

        {headerWarning && (
          <div className="border-l-2 border-accent/70 pl-3 py-1 text-[11px]">
            <div className="font-semibold text-txt-strong">
              {headerWarning.title}
            </div>
            <div className="mt-1 text-muted">{headerWarning.body}</div>
            <Button
              variant="link"
              size="sm"
              className="mt-1 text-[11px] font-medium text-accent h-auto p-0"
              onClick={goToRpcSettings}
            >
              {headerWarning.actionLabel}
            </Button>
          </div>
        )}

        {!backupReminderDismissed && (evmAddr || solAddr) && (
          <div className="border-l-2 border-warn/80 bg-warn/5 pl-3 py-2 text-[11px]">
            <div className="font-semibold text-txt">Wallet safety reminder</div>
            <div className="mt-1 text-muted">
              If you lose this device or app state without a backup, you can
              lose wallet access permanently.
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 py-0.5 text-[10px] border-warn/60 text-txt hover:bg-warn/10"
                onClick={() => void handleExportKeys()}
              >
                Back up now
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 py-0.5 text-[10px] text-muted hover:text-txt"
                onClick={dismissBackupReminder}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <div className="border-l-2 border-danger/70 pl-3 py-1 text-[11px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-danger">
              Private key export
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 py-0.5 text-[10px] border-danger/40 text-danger hover:bg-danger/10"
              onClick={() => void handleExportKeys()}
            >
              {walletExportVisible
                ? "Hide private keys"
                : "Export private keys"}
            </Button>
          </div>
          <div className="mt-1 text-muted">
            Set an export password here, then export keys when needed.
          </div>
          <div className="mt-1 text-muted/80">
            Status:{" "}
            <span
              className={
                exportPasswordConfigured ? "text-ok font-medium" : "text-warn"
              }
            >
              {exportPasswordConfigured ? "Configured" : "Not set"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              type="password"
              value={exportTokenInput}
              onChange={(e) => setExportTokenInput(e.target.value)}
              placeholder="Set export password"
              className="h-7 w-[16rem] max-w-full text-[11px]"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 py-0.5 text-[10px]"
              onClick={() => void handleSaveExportToken()}
              disabled={savingExportToken}
            >
              {savingExportToken ? "Saving..." : "Save password"}
            </Button>
          </div>
          {walletExportVisible && walletExportData && (
            <div className="mt-2 space-y-2">
              {walletExportData.evm && (
                <div className="rounded border border-border/50 bg-card/40 p-2">
                  <div className="mb-1 font-semibold text-txt">EVM</div>
                  <div className="text-muted">
                    Address: {walletExportData.evm.address ?? "n/a"}
                  </div>
                  <div className="mt-1 break-all font-mono text-[10px] text-danger">
                    {walletExportData.evm.privateKey}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-6 px-2 py-0.5 text-[10px]"
                    onClick={() => {
                      const evm = walletExportData.evm;
                      if (!evm) return;
                      void handleCopyPrivateKey(evm.privateKey, "EVM");
                    }}
                  >
                    Copy EVM key
                  </Button>
                </div>
              )}
              {walletExportData.solana && (
                <div className="rounded border border-border/50 bg-card/40 p-2">
                  <div className="mb-1 font-semibold text-txt">Solana</div>
                  <div className="text-muted">
                    Address: {walletExportData.solana.address ?? "n/a"}
                  </div>
                  <div className="mt-1 break-all font-mono text-[10px] text-danger">
                    {walletExportData.solana.privateKey}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-6 px-2 py-0.5 text-[10px]"
                    onClick={() => {
                      const solana = walletExportData.solana;
                      if (!solana) return;
                      void handleCopyPrivateKey(solana.privateKey, "Solana");
                    }}
                  >
                    Copy Solana key
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

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

      <div className="mt-4 flex min-h-[58vh] flex-1 flex-col">
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
  );
}
