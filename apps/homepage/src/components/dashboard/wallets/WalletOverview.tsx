/**
 * WalletOverview — displays provider info, chain badges, and addresses.
 */
import type {
  StewardStatusResponse,
  WalletAddresses as WalletAddressesResponse,
} from "@elizaos/shared/contracts/wallet";
import {
  getExplorerAddressUrl,
  getSolanaExplorerUrl,
  truncateAddress,
} from "./helpers";
import { AddressRow, ChainBadge, SectionHeader } from "./primitives";

export function WalletOverview({
  addresses,
  steward,
  walletProvider,
  copiedField,
  onCopy,
}: {
  addresses: WalletAddressesResponse | null;
  steward: StewardStatusResponse | null;
  walletProvider: string;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader title="WALLET OVERVIEW" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border">
        {/* Provider */}
        <div className="bg-surface p-4">
          <dt className="font-mono text-[10px] tracking-wider text-text-subtle mb-2">
            PROVIDER
          </dt>
          <dd className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-[11px] tracking-wide border ${
                walletProvider === "steward"
                  ? "border-brand/30 bg-brand/8 text-brand"
                  : walletProvider.includes("disconnected")
                    ? "border-status-stopped/30 bg-status-stopped/5 text-status-stopped"
                    : "border-border bg-surface-elevated text-text-light"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  walletProvider === "steward"
                    ? "bg-brand"
                    : walletProvider.includes("disconnected")
                      ? "bg-status-stopped"
                      : "bg-text-muted"
                }`}
              />
              {walletProvider.toUpperCase()}
            </span>
          </dd>
        </div>

        {/* Chains */}
        <div className="bg-surface p-4">
          <dt className="font-mono text-[10px] tracking-wider text-text-subtle mb-2">
            CHAINS
          </dt>
          <dd className="flex items-center gap-2 flex-wrap">
            {addresses?.evmAddress && (
              <ChainBadge
                chain="EVM"
                color="text-blue-400 border-blue-500/30 bg-blue-500/8"
              />
            )}
            {addresses?.solanaAddress && (
              <ChainBadge
                chain="SOLANA"
                color="text-purple-400 border-purple-500/30 bg-purple-500/8"
              />
            )}
          </dd>
        </div>
      </div>

      {/* EVM Address */}
      {addresses?.evmAddress && (
        <AddressRow
          label="EVM ADDRESS"
          address={addresses.evmAddress}
          field="evm"
          copiedField={copiedField}
          onCopy={onCopy}
          explorerUrl={getExplorerAddressUrl(8453, addresses.evmAddress)}
        />
      )}

      {/* Solana Address */}
      {addresses?.solanaAddress && (
        <AddressRow
          label="SOLANA ADDRESS"
          address={addresses.solanaAddress}
          field="solana"
          copiedField={copiedField}
          onCopy={onCopy}
          explorerUrl={getSolanaExplorerUrl(addresses.solanaAddress)}
        />
      )}

      {/* Steward Info */}
      {steward?.configured && steward.agentId && (
        <div className="border border-border-subtle bg-dark-secondary/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-wider text-text-subtle">
              STEWARD AGENT:
            </span>
            <span className="font-mono text-xs text-text-light">
              {truncateAddress(steward.agentId)}
            </span>
            {steward.connected ? (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-status-running">
                <span className="w-1.5 h-1.5 rounded-full bg-status-running" />
                CONNECTED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-status-stopped">
                <span className="w-1.5 h-1.5 rounded-full bg-status-stopped" />
                DISCONNECTED
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
