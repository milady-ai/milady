/**
 * VaultStatusCard — displays vault health, EVM + Solana addresses, and balances.
 *
 * Renders a health badge (ok = green, degraded = yellow, error = red),
 * copyable wallet addresses, and balance info from the steward/vault endpoints.
 */

import { Button, StatusBadge } from "@miladyai/ui";
import { Copy, Shield } from "lucide-react";
import { useCallback, useState } from "react";
import type { StewardStatusResponse } from "@miladyai/shared/contracts/wallet";
import type { VincentVaultStatus } from "./useVincentDashboard";

interface VaultStatusCardProps {
  stewardStatus: StewardStatusResponse | null;
  vaultStatus: VincentVaultStatus | null;
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;
}

function CopyableAddress({
  label,
  address,
  onCopy,
}: {
  label: string;
  address: string;
  onCopy: (text: string, label: string) => void;
}) {
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
        onClick={() => onCopy(address, label)}
        aria-label={`Copy ${label}`}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function BalancePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-start gap-0.5 rounded-xl border border-border/30 bg-card/60 px-3 py-2 min-w-[100px]">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted/70">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums text-txt">
        {value}
      </span>
    </div>
  );
}

export function VaultStatusCard({
  stewardStatus,
  vaultStatus,
  setActionNotice,
}: VaultStatusCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = useCallback(
    (text: string, label: string) => {
      void navigator.clipboard.writeText(text).then(() => {
        setCopiedField(label);
        setActionNotice(`${label} copied`, "success", 2000);
        setTimeout(() => setCopiedField(null), 2000);
      });
    },
    [setActionNotice],
  );

  // Resolve addresses from either the vaultStatus (new endpoint) or stewardStatus (existing)
  const evmAddress =
    vaultStatus?.evmAddress ??
    stewardStatus?.walletAddresses?.evm ??
    stewardStatus?.evmAddress ??
    null;
  const solanaAddress =
    vaultStatus?.solanaAddress ??
    stewardStatus?.walletAddresses?.solana ??
    null;

  // Resolve health from either source
  const health =
    vaultStatus?.vaultHealth ?? stewardStatus?.vaultHealth ?? null;

  const healthTone =
    health === "ok"
      ? ("success" as const)
      : health === "degraded"
        ? ("warning" as const)
        : health === "error"
          ? ("danger" as const)
          : ("muted" as const);

  const healthLabel =
    health === "ok"
      ? "Healthy"
      : health === "degraded"
        ? "Degraded"
        : health === "error"
          ? "Error"
          : "Unknown";

  const hasAnyData = stewardStatus !== null || vaultStatus !== null;

  if (!hasAnyData) {
    return (
      <div className="rounded-[28px] border border-border/18 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_92%,transparent),color-mix(in_srgb,var(--bg)_98%,transparent))] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted/50" />
          <span className="text-sm text-muted">Vault data unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-border/18 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_92%,transparent),color-mix(in_srgb,var(--bg)_98%,transparent))] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold text-txt">Vault Status</span>
        </div>
        {health && (
          <StatusBadge
            label={healthLabel}
            tone={healthTone}
            withDot
          />
        )}
      </div>

      {/* Addresses */}
      {(evmAddress || solanaAddress) && (
        <div className="space-y-2">
          {evmAddress && (
            <CopyableAddress
              label={copiedField === "EVM Address" ? "Copied!" : "EVM Address"}
              address={evmAddress}
              onCopy={handleCopy}
            />
          )}
          {solanaAddress && (
            <CopyableAddress
              label={
                copiedField === "Solana Address" ? "Copied!" : "Solana Address"
              }
              address={solanaAddress}
              onCopy={handleCopy}
            />
          )}
        </div>
      )}

      {/* Balances from vaultStatus (new endpoint) */}
      {vaultStatus &&
        (vaultStatus.nativeBalance ||
          vaultStatus.tokenBalance ||
          vaultStatus.treasuryValueUsd) && (
          <div className="flex flex-wrap gap-2">
            {vaultStatus.nativeBalance && (
              <BalancePill
                label="Native Balance"
                value={vaultStatus.nativeBalance}
              />
            )}
            {vaultStatus.tokenBalance && (
              <BalancePill
                label="Token Balance"
                value={vaultStatus.tokenBalance}
              />
            )}
            {vaultStatus.treasuryValueUsd && (
              <BalancePill
                label="Treasury USD"
                value={vaultStatus.treasuryValueUsd}
              />
            )}
          </div>
        )}

      {/* Fallback if no addresses found */}
      {!evmAddress && !solanaAddress && (
        <p className="text-xs text-muted">No vault addresses available yet.</p>
      )}
    </div>
  );
}
