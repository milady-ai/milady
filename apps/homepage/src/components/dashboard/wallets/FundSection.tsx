/**
 * FundSection — QR code + copy address for funding the agent wallet.
 */

import type {
  WalletAddresses as WalletAddressesResponse,
  WalletBalancesResponse,
} from "@elizaos/shared/contracts/wallet";
import { useEffect, useState } from "react";
import {
  getExplorerAddressUrl,
  getSolanaExplorerUrl,
  truncateAddress,
} from "./helpers";
import { CopyIcon, ExternalLinkIcon } from "./icons";
import { SectionHeader } from "./primitives";
import { generateQrDataUrl } from "./qr-code";

export function FundSection({
  addresses,
  balances: _balances,
  copiedField,
  onCopy,
}: {
  addresses: WalletAddressesResponse | null;
  balances: WalletBalancesResponse | null;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
}) {
  void _balances; // reserved for future total balance display
  const primaryAddress =
    addresses?.evmAddress ?? addresses?.solanaAddress ?? null;
  const isEvm = Boolean(addresses?.evmAddress);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!primaryAddress) return;
    let cancelled = false;
    generateQrDataUrl(primaryAddress).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [primaryAddress]);

  if (!primaryAddress) return null;

  const explorerUrl = isEvm
    ? getExplorerAddressUrl(8453, primaryAddress)
    : getSolanaExplorerUrl(primaryAddress);

  return (
    <div className="space-y-4">
      <SectionHeader title="FUND WALLET" />

      <div className="border border-brand/20 bg-brand/5 overflow-hidden">
        <div className="px-4 py-2.5 bg-brand/8 border-b border-brand/20">
          <span className="font-mono text-[10px] tracking-wider text-brand font-semibold">
            SEND {isEvm ? "ETH / TOKENS" : "SOL / SPL"} HERE
          </span>
        </div>

        <div className="p-5 flex flex-col md:flex-row items-center gap-6">
          {/* QR Code */}
          <div className="shrink-0">
            <div className="w-[140px] h-[140px] bg-white p-2 border border-border">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR code for ${truncateAddress(primaryAddress)}`}
                  className="w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-4 h-4 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
                </div>
              )}
            </div>
            <p className="font-mono text-[9px] text-text-subtle text-center mt-2">
              SCAN TO SEND
            </p>
          </div>

          {/* Address + Actions */}
          <div className="flex-1 min-w-0 space-y-4">
            <div>
              <p className="font-mono text-[10px] tracking-wider text-text-subtle mb-2">
                {isEvm ? "EVM" : "SOLANA"} WALLET ADDRESS
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-sm text-brand break-all bg-dark-secondary px-3 py-2 border border-border select-all">
                  {primaryAddress}
                </code>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onCopy(primaryAddress, "fund")}
                className={`flex items-center gap-2 px-4 py-2.5 font-mono text-[11px] tracking-wide border transition-all duration-150 ${
                  copiedField === "fund"
                    ? "border-status-running/30 bg-status-running/10 text-status-running"
                    : "border-brand/30 bg-brand/8 text-brand hover:bg-brand/15"
                }`}
              >
                <CopyIcon />
                {copiedField === "fund" ? "COPIED!" : "COPY ADDRESS"}
              </button>

              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 font-mono text-[11px] tracking-wide border border-border text-text-muted hover:text-text-light hover:border-text-muted transition-all duration-150"
                >
                  <ExternalLinkIcon />
                  VIEW ON EXPLORER
                </a>
              )}
            </div>

            {/* Second address if both chains */}
            {addresses?.evmAddress && addresses?.solanaAddress && (
              <div className="pt-2 border-t border-border-subtle">
                <p className="font-mono text-[10px] tracking-wider text-text-subtle mb-1">
                  ALSO ACCEPTS ON {isEvm ? "SOLANA" : "EVM"}
                </p>
                <code className="font-mono text-xs text-text-muted break-all">
                  {isEvm ? addresses.solanaAddress : addresses.evmAddress}
                </code>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
