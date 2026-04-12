/**
 * useVincentDashboard — aggregated data hook for the Vincent overlay app.
 *
 * Polls the established steward endpoints every 15 s when Vincent is
 * connected, and also attempts the three new Vincent-specific endpoints
 * (/api/vincent/vault-status, /api/vincent/trading-profile,
 * /api/vincent/strategy).  404s from those endpoints are treated as
 * "not yet implemented" and the corresponding state stays null, so the
 * UI renders gracefully before the backend task ships.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "../../api";
import type {
  StewardPendingApproval,
  StewardStatusResponse,
  StewardTxRecord,
} from "@miladyai/shared/contracts/wallet";

// ── New endpoint types (will be satisfied by the backend task) ──────────

export interface VincentVaultStatus {
  connected: boolean;
  connectedAt: number | null;
  vaultHealth: "ok" | "degraded" | "error" | null;
  evmAddress: string | null;
  solanaAddress: string | null;
  nativeBalance: string | null;
  tokenBalance: string | null;
  treasuryValueUsd: string | null;
}

export interface VincentStrategy {
  name: "dca" | "rebalance" | "threshold" | "manual" | null;
  params: Record<string, unknown>;
  intervalSeconds: number;
  dryRun: boolean;
  running: boolean;
}

export interface VincentTradingProfile {
  totalPnl: string;
  winRate: number;
  totalSwaps: number;
  volume24h: string;
  tokenBreakdown: Array<{ symbol: string; pnl: string; swaps: number }>;
}

// ── Hook state shape ──────────────────────────────────────────────────────

export interface VincentDashboardState {
  // Vincent OAuth status
  vincentConnected: boolean;
  vincentConnectedAt: number | null;

  // Steward vault status (GET /api/wallet/steward-status)
  stewardStatus: StewardStatusResponse | null;

  // Aggregated vault + balances (GET /api/vincent/vault-status)
  vaultStatus: VincentVaultStatus | null;

  // Current strategy config (GET /api/vincent/strategy)
  strategy: VincentStrategy | null;

  // P&L analytics (GET /api/vincent/trading-profile)
  tradingProfile: VincentTradingProfile | null;

  // Transaction history (GET /api/wallet/steward-history)
  txHistory: StewardTxRecord[];
  txHistoryTotal: number;

  // Approval queue (GET /api/wallet/steward-pending)
  pendingApprovals: StewardPendingApproval[];

  // Loading + error state
  loading: boolean;
  error: string | null;

  // Manual refresh
  refresh: () => void;
}

const POLL_INTERVAL_MS = 15_000;

async function fetchOrNull<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function useVincentDashboard(): VincentDashboardState {
  const [vincentConnected, setVincentConnected] = useState(false);
  const [vincentConnectedAt, setVincentConnectedAt] = useState<number | null>(
    null,
  );
  const [stewardStatus, setStewardStatus] =
    useState<StewardStatusResponse | null>(null);
  const [vaultStatus, setVaultStatus] = useState<VincentVaultStatus | null>(
    null,
  );
  const [strategy, setStrategy] = useState<VincentStrategy | null>(null);
  const [tradingProfile, setTradingProfile] =
    useState<VincentTradingProfile | null>(null);
  const [txHistory, setTxHistory] = useState<StewardTxRecord[]>([]);
  const [txHistoryTotal, setTxHistoryTotal] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState<
    StewardPendingApproval[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    try {
      // Always check Vincent OAuth status first
      const vincentStatusResult = await client.vincentStatus();
      if (!mountedRef.current) return;
      setVincentConnected(vincentStatusResult.connected);
      setVincentConnectedAt(vincentStatusResult.connectedAt);

      // Fetch steward + vault data in parallel
      const [
        stewardResult,
        vaultStatusResult,
        strategyResult,
        tradingProfileResult,
        historyResult,
        pendingResult,
      ] = await Promise.allSettled([
        client.getStewardStatus(),
        fetchOrNull<VincentVaultStatus>("/api/vincent/vault-status"),
        fetchOrNull<VincentStrategy>("/api/vincent/strategy"),
        fetchOrNull<VincentTradingProfile>("/api/vincent/trading-profile"),
        vincentStatusResult.connected
          ? client.getStewardHistory({ limit: 200 })
          : Promise.resolve({ records: [], total: 0, offset: 0, limit: 200 }),
        vincentStatusResult.connected
          ? client.getStewardPending()
          : Promise.resolve([]),
      ]);

      if (!mountedRef.current) return;

      if (stewardResult.status === "fulfilled") {
        setStewardStatus(stewardResult.value);
      }
      if (vaultStatusResult.status === "fulfilled") {
        setVaultStatus(vaultStatusResult.value);
      }
      if (strategyResult.status === "fulfilled" && strategyResult.value) {
        // API wraps in { connected, strategy: {...} }
        const raw = strategyResult.value as
          | VincentStrategy
          | { strategy: VincentStrategy };
        setStrategy(
          "strategy" in raw && raw.strategy ? raw.strategy : raw as VincentStrategy,
        );
      }
      if (tradingProfileResult.status === "fulfilled" && tradingProfileResult.value) {
        // API wraps in { connected, profile: {...} }
        const raw = tradingProfileResult.value as
          | VincentTradingProfile
          | { profile: VincentTradingProfile };
        setTradingProfile(
          "profile" in raw && raw.profile ? raw.profile : raw as VincentTradingProfile,
        );
      }
      if (historyResult.status === "fulfilled") {
        const h = historyResult.value;
        // getStewardHistory wraps records in an object;
        // the Promise.resolve fallback already matches that shape.
        const records = Array.isArray(h)
          ? (h as StewardTxRecord[])
          : (h as { records: StewardTxRecord[]; total: number }).records ?? [];
        const total = Array.isArray(h)
          ? records.length
          : ((h as { total: number }).total ?? 0);
        setTxHistory(records);
        setTxHistoryTotal(total);
      }
      if (pendingResult.status === "fulfilled") {
        const pending = pendingResult.value;
        setPendingApprovals(Array.isArray(pending) ? pending : []);
      }

      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    void fetchAll();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchAll]);

  // Start polling when connected, stop when disconnected
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (vincentConnected) {
      intervalRef.current = setInterval(() => void fetchAll(), POLL_INTERVAL_MS);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [vincentConnected, fetchAll]);

  const refresh = useCallback(() => {
    setLoading(true);
    void fetchAll();
  }, [fetchAll]);

  return {
    vincentConnected,
    vincentConnectedAt,
    stewardStatus,
    vaultStatus,
    strategy,
    tradingProfile,
    txHistory,
    txHistoryTotal,
    pendingApprovals,
    loading,
    error,
    refresh,
  };
}
