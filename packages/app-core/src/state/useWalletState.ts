/**
 * Wallet / Inventory / Registry / Drop / Whitelist state — extracted from AppContext.
 *
 * Manages:
 * - Wallet addresses, config, balances, NFTs, export flow
 * - Inventory view preferences (sort, filter, chain toggles)
 * - ERC-8004 on-chain registry (register, sync, status)
 * - Drop / mint state and actions
 * - Whitelist status
 *
 * Cross-domain dependencies accepted as params:
 * - `setActionNotice` — from useLifecycleState, used by handleWalletApiKeySave
 * - `agentName`       — from agentStatus?.agentName, used by registry/mint
 * - `characterName`   — from characterDraft?.name, used by registry/mint
 * - `promptModal`     — from AppContext's usePrompt(), used by handleExportKeys
 * - `confirmAction`   — confirmDesktopAction utility, used by handleExportKeys
 */

import type {
  WalletChainKind,
  WalletEntry,
  WalletPrimaryMap,
  WalletSource,
} from "@miladyai/shared/contracts/wallet";
import { normalizeWalletRpcSelections } from "@miladyai/shared/contracts/wallet";
import type { PromptOptions } from "@miladyai/ui";
import { useCallback, useRef, useState } from "react";
import {
  client,
  type DropStatus,
  type MintResult,
  type RegistryStatus,
  type WalletAddresses,
  type WalletBalancesResponse,
  type WalletConfigStatus,
  type WalletConfigUpdateRequest,
  type WalletExportResult,
  type WalletNftsResponse,
  type WhitelistStatus,
} from "../api";
import { confirmDesktopAction } from "../utils";
import {
  loadBrowserEnabled,
  loadWalletEnabled,
  saveBrowserEnabled,
  saveWalletEnabled,
} from "./persistence";
import type { InventoryChainFilters } from "./types";

// ── Types ──────────────────────────────────────────────────────────────

interface WalletStateParams {
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
    once?: boolean,
    busy?: boolean,
  ) => void;
  /** Prompt modal function from AppContext's usePrompt() instance */
  promptModal: (opts: PromptOptions) => Promise<string | null>;
  /** Current agent name (from agentStatus?.agentName) */
  agentName: string | undefined;
  /** Current character draft name (from characterDraft?.name) */
  characterName: string | undefined;
}

function normalizeCloudImportFailureDetail(detail: string): string {
  if (/Invalid Solana address \(base58, 32–44 chars\)/i.test(detail)) {
    return "the connected Eliza Cloud backend is still using the legacy Solana wallet contract";
  }
  return detail;
}

function buildCloudImportNotice(args: {
  warning?: string;
  wallets?: WalletEntry[];
}): { text: string; tone: "info" | "success" } {
  const { warning } = args;
  const hasCloudEvmWallet =
    args.wallets?.some(
      (wallet) => wallet.chain === "evm" && wallet.source === "cloud",
    ) ?? false;
  const hasCloudSolanaWallet =
    args.wallets?.some(
      (wallet) => wallet.chain === "solana" && wallet.source === "cloud",
    ) ?? false;
  if (!warning) {
    if (hasCloudEvmWallet && hasCloudSolanaWallet) {
      return {
        text: "Cloud wallets connected.",
        tone: "success",
      };
    }
    if (hasCloudEvmWallet || hasCloudSolanaWallet) {
      return {
        text: "Cloud wallet connected.",
        tone: "success",
      };
    }
    return {
      text: "Cloud wallet import queued.",
      tone: "success",
    };
  }

  const solanaFailure = warning.match(
    /Cloud solana wallet import failed:\s*(.+)$/i,
  );
  if (hasCloudEvmWallet && hasCloudSolanaWallet && !solanaFailure) {
    return {
      text: "Cloud wallets connected.",
      tone: "success",
    };
  }
  if (hasCloudEvmWallet && solanaFailure) {
    const detail = normalizeCloudImportFailureDetail(solanaFailure[1]);
    return {
      text: `EVM cloud wallet connected. Solana cloud wallet is unavailable because ${detail}.`,
      tone: "info",
    };
  }
  if (solanaFailure) {
    const detail = normalizeCloudImportFailureDetail(solanaFailure[1]);
    return {
      text: `Solana cloud wallet is unavailable because ${detail}.`,
      tone: "info",
    };
  }

  return {
    text: `Cloud wallet import partially applied. ${warning}`,
    tone: "info",
  };
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useWalletState({
  setActionNotice,
  promptModal,
  agentName,
  characterName,
}: WalletStateParams) {
  // ── Feature toggles ────────────────────────────────────────────────
  const [walletEnabled, setWalletEnabledRaw] = useState(loadWalletEnabled);
  const setWalletEnabled = useCallback((v: boolean) => {
    setWalletEnabledRaw(v);
    saveWalletEnabled(v);
  }, []);

  const [browserEnabled, setBrowserEnabledRaw] = useState(loadBrowserEnabled);
  const setBrowserEnabled = useCallback((v: boolean) => {
    setBrowserEnabledRaw(v);
    saveBrowserEnabled(v);
  }, []);

  // ── Wallet / Inventory ─────────────────────────────────────────────
  const [walletAddresses, setWalletAddresses] =
    useState<WalletAddresses | null>(null);
  const [walletConfig, setWalletConfig] = useState<WalletConfigStatus | null>(
    null,
  );
  const [walletBalances, setWalletBalances] =
    useState<WalletBalancesResponse | null>(null);
  const [walletNfts, setWalletNfts] = useState<WalletNftsResponse | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletNftsLoading, setWalletNftsLoading] = useState(false);
  const [inventoryView, setInventoryView] = useState<"tokens" | "nfts">(
    "tokens",
  );
  const [walletExportData, setWalletExportData] =
    useState<WalletExportResult | null>(null);
  const [walletExportVisible, setWalletExportVisible] = useState(false);
  const [walletApiKeySaving, setWalletApiKeySaving] = useState(false);
  const [inventorySort, setInventorySort] = useState<
    "chain" | "symbol" | "value"
  >("value");
  const [inventorySortDirection, setInventorySortDirection] = useState<
    "asc" | "desc"
  >("desc");
  const [inventoryChainFilters, setInventoryChainFilters] =
    useState<InventoryChainFilters>({
      ethereum: true,
      base: true,
      bsc: true,
      avax: true,
      solana: true,
    });
  const [walletError, setWalletError] = useState<string | null>(null);

  // ── Cloud/Local dual-wallet (gated server-side by ENABLE_CLOUD_WALLET) ──
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [primaryMap, setPrimaryMap] = useState<WalletPrimaryMap | null>(null);
  const [primaryRestarting, setPrimaryRestarting] = useState<
    Partial<Record<WalletChainKind, boolean>>
  >({});
  const [primaryPending, setPrimaryPending] = useState<
    Partial<Record<WalletChainKind, boolean>>
  >({});
  const [cloudRefreshing, setCloudRefreshing] = useState(false);

  // ── ERC-8004 Registry ──────────────────────────────────────────────
  const [registryStatus, setRegistryStatus] = useState<RegistryStatus | null>(
    null,
  );
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryRegistering, setRegistryRegistering] = useState(false);
  const [registryError, setRegistryError] = useState<string | null>(null);

  // ── Drop / Mint ────────────────────────────────────────────────────
  const [dropStatus, setDropStatus] = useState<DropStatus | null>(null);
  const [dropLoading, setDropLoading] = useState(false);
  const [mintInProgress, setMintInProgress] = useState(false);
  const [mintResult, setMintResult] = useState<MintResult | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintShiny, setMintShiny] = useState(false);

  // ── Whitelist ──────────────────────────────────────────────────────
  const [whitelistStatus, setWhitelistStatus] =
    useState<WhitelistStatus | null>(null);
  const [whitelistLoading, setWhitelistLoading] = useState(false);

  // ── Synchronous lock to prevent duplicate save clicks ──────────────
  const walletApiKeySavingRef = useRef(false);
  const walletExportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // ── Wallet callbacks ───────────────────────────────────────────────

  const loadWalletConfig = useCallback(async () => {
    try {
      const cfg = await client.getWalletConfig();
      setWalletConfig(cfg);
      setWalletAddresses({
        evmAddress: cfg.evmAddress,
        solanaAddress: cfg.solanaAddress,
      });
      if (Array.isArray(cfg.wallets)) setWallets(cfg.wallets);
      else setWallets([]);
      setPrimaryMap(cfg.primary ?? null);
      setWalletError(null);
      return cfg;
    } catch (err) {
      setWalletError(
        `Failed to load wallet config: ${err instanceof Error ? err.message : "network error"}`,
      );
      return null;
    }
  }, []);

  const setPrimary = useCallback(
    async (chain: WalletChainKind, source: WalletSource) => {
      if (primaryPending[chain]) return;
      setPrimaryPending((prev) => ({ ...prev, [chain]: true }));
      setPrimaryRestarting((prev) => ({ ...prev, [chain]: true }));
      try {
        const hasRequestedSource = wallets.some(
          (wallet) => wallet.chain === chain && wallet.source === source,
        );

        if (!hasRequestedSource) {
          if (source === "cloud") {
            const refreshResult = await client.refreshCloudWallets();
            const refreshed = await loadWalletConfig();
            const hasCloudWallet =
              refreshed?.wallets?.some(
                (wallet) => wallet.chain === chain && wallet.source === "cloud",
              ) ?? false;
            if (!hasCloudWallet) {
              const warning = refreshResult.warnings?.find(
                (value) => typeof value === "string" && value.trim().length > 0,
              );
              throw new Error(
                warning ?? `Cloud ${chain} wallet is not available.`,
              );
            }
          } else {
            await client.generateWallet({ chain, source: "local" });
            const refreshed = await loadWalletConfig();
            const hasLocalWallet =
              refreshed?.wallets?.some(
                (wallet) => wallet.chain === chain && wallet.source === "local",
              ) ?? false;
            if (!hasLocalWallet) {
              throw new Error(`Local ${chain} wallet is not available.`);
            }
          }
        }

        // Optimistic local update for snappier UI.
        setPrimaryMap((prev) =>
          prev
            ? { ...prev, [chain]: source }
            : { evm: "local", solana: "local", [chain]: source },
        );
        setWallets((prev) =>
          prev.map((w) =>
            w.chain === chain ? { ...w, primary: w.source === source } : w,
          ),
        );
        await client.setWalletPrimary({ chain, source });
        // Runtime restart is kicked off server-side. Poll the config a few times
        // so we pick up the new state without unmounting the view.
        const deadline = Date.now() + 15_000;
        let lastErr: unknown = null;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 1_000));
          try {
            await loadWalletConfig();
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (lastErr) {
          setWalletError(
            `Primary updated but reload failed: ${lastErr instanceof Error ? lastErr.message : "network error"}`,
          );
        }
      } catch (err) {
        setWalletError(
          `Failed to set primary wallet: ${err instanceof Error ? err.message : "network error"}`,
        );
        // Roll back optimistic update.
        await loadWalletConfig().catch(() => {});
      } finally {
        setPrimaryPending((prev) => ({ ...prev, [chain]: false }));
        setPrimaryRestarting((prev) => ({ ...prev, [chain]: false }));
      }
    },
    [loadWalletConfig, primaryPending, wallets],
  );

  const refreshCloud = useCallback(async () => {
    if (cloudRefreshing) return;
    setCloudRefreshing(true);
    try {
      await client.refreshCloudWallets();
      await loadWalletConfig();
    } catch (err) {
      setWalletError(
        `Failed to refresh cloud wallets: ${err instanceof Error ? err.message : "network error"}`,
      );
    } finally {
      setCloudRefreshing(false);
    }
  }, [cloudRefreshing, loadWalletConfig]);

  const loadBalances = useCallback(async () => {
    setWalletLoading(true);
    setWalletError(null);
    try {
      const b = await client.getWalletBalances();
      setWalletBalances(b);
    } catch (err) {
      setWalletError(
        `Failed to fetch balances: ${err instanceof Error ? err.message : "network error"}`,
      );
    }
    setWalletLoading(false);
  }, []);

  const loadNfts = useCallback(async () => {
    setWalletNftsLoading(true);
    setWalletError(null);
    try {
      const n = await client.getWalletNfts();
      setWalletNfts(n);
    } catch (err) {
      setWalletError(
        `Failed to fetch NFTs: ${err instanceof Error ? err.message : "network error"}`,
      );
    }
    setWalletNftsLoading(false);
  }, []);

  const handleWalletApiKeySave = useCallback(
    async (config: WalletConfigUpdateRequest) => {
      if (
        Object.keys(config.credentials ?? {}).length === 0 &&
        Object.keys(config.selections ?? {}).length === 0
      ) {
        return false;
      }
      if (walletApiKeySavingRef.current || walletApiKeySaving) return false;
      walletApiKeySavingRef.current = true;
      setWalletApiKeySaving(true);
      setWalletError(null);
      try {
        const selections = normalizeWalletRpcSelections(config.selections);
        const shouldImportCloudWallet =
          selections.evm === "eliza-cloud" &&
          selections.bsc === "eliza-cloud" &&
          selections.solana === "eliza-cloud";
        let cloudImportWarning: string | undefined;

        await client.updateWalletConfig(config);
        if (shouldImportCloudWallet) {
          const refreshResult = await client.refreshCloudWallets();
          cloudImportWarning = Array.isArray(refreshResult.warnings)
            ? refreshResult.warnings.find(
                (warning) =>
                  typeof warning === "string" && warning.trim().length > 0,
              )
            : undefined;
        }
        const loadedWalletConfig = await loadWalletConfig();
        await loadBalances();
        const cloudNotice = buildCloudImportNotice({
          warning: cloudImportWarning,
          wallets: loadedWalletConfig?.wallets,
        });
        setActionNotice(
          shouldImportCloudWallet
            ? cloudNotice.text
            : "Wallet RPC settings saved.",
          shouldImportCloudWallet ? cloudNotice.tone : "success",
        );
        return true;
      } catch (err) {
        setWalletError(
          `Failed to save API keys: ${err instanceof Error ? err.message : "network error"}`,
        );
        return false;
      } finally {
        walletApiKeySavingRef.current = false;
        setWalletApiKeySaving(false);
      }
    },
    [walletApiKeySaving, loadWalletConfig, loadBalances, setActionNotice],
  );

  const handleExportKeys = useCallback(async () => {
    if (walletExportVisible) {
      if (walletExportTimerRef.current) {
        clearTimeout(walletExportTimerRef.current);
        walletExportTimerRef.current = null;
      }
      setWalletExportVisible(false);
      setWalletExportData(null);
      return;
    }
    const confirmed = await confirmDesktopAction({
      title: "Reveal Private Keys",
      message: "This will reveal your private keys.",
      detail:
        "NEVER share your private keys with anyone. Anyone with your private keys can steal all funds in your wallets.",
      confirmLabel: "Continue",
      cancelLabel: "Cancel",
      type: "warning",
    });
    if (!confirmed) return;
    const exportToken = await promptModal({
      title: "Wallet Export Token",
      message: "Enter your wallet export token (MILADY_WALLET_EXPORT_TOKEN):",
      placeholder: "MILADY_WALLET_EXPORT_TOKEN",
      confirmLabel: "Export",
      cancelLabel: "Cancel",
    });
    if (exportToken === null) return;
    if (!exportToken.trim()) {
      setWalletError("Wallet export token is required.");
      return;
    }
    try {
      const data = await client.exportWalletKeys(exportToken.trim());
      setWalletExportData(data);
      setWalletExportVisible(true);
      if (walletExportTimerRef.current) {
        clearTimeout(walletExportTimerRef.current);
      }
      walletExportTimerRef.current = setTimeout(() => {
        walletExportTimerRef.current = null;
        setWalletExportVisible(false);
        setWalletExportData(null);
      }, 60_000);
    } catch (err) {
      setWalletError(
        `Failed to export keys: ${err instanceof Error ? err.message : "network error"}`,
      );
    }
  }, [promptModal, walletExportVisible]);

  // ── Registry callbacks ─────────────────────────────────────────────

  const loadRegistryStatus = useCallback(async () => {
    setRegistryLoading(true);
    setRegistryError(null);
    try {
      const status = await client.getRegistryStatus();
      setRegistryStatus(status);
    } catch (err) {
      setRegistryError(
        err instanceof Error ? err.message : "Failed to load registry status",
      );
    } finally {
      setRegistryLoading(false);
    }
  }, []);

  const registerOnChain = useCallback(async () => {
    setRegistryRegistering(true);
    setRegistryError(null);
    try {
      await client.registerAgent({
        name: characterName || agentName,
      });
      await loadRegistryStatus();
    } catch (err) {
      setRegistryError(
        err instanceof Error ? err.message : "Registration failed",
      );
    } finally {
      setRegistryRegistering(false);
    }
  }, [characterName, agentName, loadRegistryStatus]);

  const syncRegistryProfile = useCallback(async () => {
    setRegistryRegistering(true);
    setRegistryError(null);
    try {
      await client.syncRegistryProfile({
        name: characterName || agentName,
      });
      await loadRegistryStatus();
    } catch (err) {
      setRegistryError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setRegistryRegistering(false);
    }
  }, [characterName, agentName, loadRegistryStatus]);

  // ── Drop / Mint callbacks ──────────────────────────────────────────

  const loadDropStatus = useCallback(async () => {
    setDropLoading(true);
    try {
      const status = await client.getDropStatus();
      setDropStatus(status);
    } catch {
      // Non-critical -- drop may not be configured
    } finally {
      setDropLoading(false);
    }
  }, []);

  const mintFromDrop = useCallback(
    async (shiny: boolean) => {
      setMintInProgress(true);
      setMintShiny(shiny);
      setMintError(null);
      setMintResult(null);
      try {
        const result = await client.mintAgent({
          name: characterName || agentName,
          shiny,
        });
        setMintResult(result);
        await loadRegistryStatus();
        await loadDropStatus();
      } catch (err) {
        setMintError(err instanceof Error ? err.message : "Mint failed");
      } finally {
        setMintInProgress(false);
        setMintShiny(false);
      }
    },
    [characterName, agentName, loadRegistryStatus, loadDropStatus],
  );

  // ── Whitelist callback ─────────────────────────────────────────────

  const loadWhitelistStatus = useCallback(async () => {
    setWhitelistLoading(true);
    try {
      const status = await client.getWhitelistStatus();
      setWhitelistStatus(status);
    } catch {
      // Non-critical
    } finally {
      setWhitelistLoading(false);
    }
  }, []);

  // ── Return ─────────────────────────────────────────────────────────

  return {
    state: {
      browserEnabled,
      walletEnabled,
      walletAddresses,
      walletConfig,
      walletBalances,
      walletNfts,
      walletLoading,
      walletNftsLoading,
      inventoryView,
      walletExportData,
      walletExportVisible,
      walletApiKeySaving,
      inventorySort,
      inventorySortDirection,
      inventoryChainFilters,
      walletError,
      registryStatus,
      registryLoading,
      registryRegistering,
      registryError,
      dropStatus,
      dropLoading,
      mintInProgress,
      mintResult,
      mintError,
      mintShiny,
      whitelistStatus,
      whitelistLoading,
      wallets,
      walletPrimary: primaryMap,
      walletPrimaryRestarting: primaryRestarting,
      walletPrimaryPending: primaryPending,
      cloudRefreshing,
    },
    // Raw setters needed by AppContext for UI binding
    setBrowserEnabled,
    setWalletEnabled,
    setWalletAddresses,
    setInventoryView,
    setInventorySort,
    setInventorySortDirection,
    setInventoryChainFilters,
    setWalletError,
    setRegistryError,
    setMintResult,
    setMintError,
    // Callbacks
    loadWalletConfig,
    loadBalances,
    loadNfts,
    handleWalletApiKeySave,
    handleExportKeys,
    loadRegistryStatus,
    registerOnChain,
    syncRegistryProfile,
    loadDropStatus,
    mintFromDrop,
    loadWhitelistStatus,
    setPrimary,
    refreshCloud,
  };
}
