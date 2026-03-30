/**
 * WalletsPanel — top-level wallet dashboard for a managed agent.
 *
 * Sub-components live in ./wallets/ to keep each file under 500 LOC.
 */

import type {
  StewardStatusResponse,
  WalletAddresses as WalletAddressesResponse,
  WalletBalancesResponse,
} from "@miladyai/shared/contracts/wallet";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ManagedAgent } from "../../lib/AgentProvider";
import { CloudApiClient } from "../../lib/cloud-api";
import { CLOUD_BASE } from "../../lib/runtime-config";
import { BalancesSection } from "./wallets/BalancesSection";
import { FundSection } from "./wallets/FundSection";
import { REFRESH_INTERVAL_MS } from "./wallets/helpers";
import { NoWalletState, WalletsSkeleton } from "./wallets/primitives";
import { WalletOverview } from "./wallets/WalletOverview";

// ── Types ───────────────────────────────────────────────────────────────

interface WalletData {
  addresses: WalletAddressesResponse | null;
  balances: WalletBalancesResponse | null;
  steward: StewardStatusResponse | null;
}

interface WalletsPanelProps {
  managedAgent: ManagedAgent;
}

// ── Main Component ──────────────────────────────────────────────────────

export function WalletsPanel({ managedAgent }: WalletsPanelProps) {
  const [data, setData] = useState<WalletData>({
    addresses: null,
    balances: null,
    steward: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchWalletData = useCallback(async () => {
    if (!managedAgent.sourceUrl && !managedAgent.client) return;

    // For cloud agents without a matched sandbox, fall back to the cloud API
    // token so requests can be authenticated through the cloud proxy.
    const cloudToken = managedAgent.cloudClient?.getToken();
    let client: CloudApiClient;
    if (managedAgent.source !== "cloud" && managedAgent.client) {
      client = managedAgent.client;
    } else if (
      managedAgent.source === "cloud" &&
      managedAgent.cloudAgentId &&
      cloudToken
    ) {
      // Route through cloud proxy to avoid 401 on direct agent URLs
      client = new CloudApiClient({
        url: `${CLOUD_BASE}/api/v1/milady/agents/${managedAgent.cloudAgentId}`,
        type: "cloud",
        authToken: cloudToken,
      });
    } else {
      const authToken = managedAgent.apiToken ?? cloudToken;
      client = new CloudApiClient({
        url: managedAgent.sourceUrl ?? "",
        type: managedAgent.source === "cloud" ? "cloud" : "remote",
        authToken,
      });
    }

    try {
      const [addresses, balances, steward] = await Promise.allSettled([
        client.getWalletAddresses(),
        client.getWalletBalances(),
        client.getStewardStatus(),
      ]);

      setData({
        addresses: addresses.status === "fulfilled" ? addresses.value : null,
        balances: balances.status === "fulfilled" ? balances.value : null,
        steward: steward.status === "fulfilled" ? steward.value : null,
      });
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch wallet data",
      );
    } finally {
      setLoading(false);
    }
  }, [managedAgent]);

  useEffect(() => {
    fetchWalletData();
    intervalRef.current = setInterval(fetchWalletData, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchWalletData]);

  const handleCopy = useCallback(async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  }, []);

  if (loading) {
    return <WalletsSkeleton />;
  }

  const hasEvmWallet = Boolean(data.addresses?.evmAddress);
  const hasSolanaWallet = Boolean(data.addresses?.solanaAddress);
  const hasAnyWallet = hasEvmWallet || hasSolanaWallet;

  if (!hasAnyWallet && !error) {
    return <NoWalletState />;
  }

  const walletProvider = data.steward?.configured
    ? data.steward.connected
      ? "steward"
      : "steward (disconnected)"
    : "privy";

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 border border-status-stopped/30 bg-status-stopped/5">
          <span className="w-2 h-2 rounded-full bg-status-stopped shrink-0" />
          <span className="font-mono text-xs text-status-stopped">{error}</span>
        </div>
      )}

      {/* Wallet Overview */}
      <WalletOverview
        addresses={data.addresses}
        steward={data.steward}
        walletProvider={walletProvider}
        copiedField={copiedField}
        onCopy={handleCopy}
      />

      {/* Balances */}
      {data.balances && (
        <BalancesSection balances={data.balances} addresses={data.addresses} />
      )}

      {/* Fund Your Agent */}
      {hasAnyWallet && (
        <FundSection
          addresses={data.addresses}
          balances={data.balances}
          copiedField={copiedField}
          onCopy={handleCopy}
        />
      )}

      {/* Auto-refresh indicator */}
      <div className="flex items-center gap-2 pt-2">
        <div className="w-1.5 h-1.5 rounded-full bg-status-running animate-[status-pulse_2s_ease-in-out_infinite]" />
        <span className="font-mono text-[10px] text-text-subtle tracking-wide">
          LIVE · 30S
        </span>
      </div>
    </div>
  );
}
