/**
 * BalancesSection — EVM chain cards and Solana balance display.
 */
import type {
  EvmChainBalance,
  EvmTokenBalance,
  SolanaTokenBalance,
  WalletAddresses as WalletAddressesResponse,
  WalletBalancesResponse,
} from "@miladyai/shared/contracts/wallet";
import {
  formatBalance,
  formatUsd,
  getExplorerAddressUrl,
  getSolanaExplorerUrl,
  truncateAddress,
} from "./helpers";
import { SectionHeader } from "./primitives";

// ── BalancesSection ─────────────────────────────────────────────────────

export function BalancesSection({
  balances,
  addresses,
}: {
  balances: WalletBalancesResponse;
  addresses: WalletAddressesResponse | null;
}) {
  const hasEvm = balances.evm && balances.evm.chains.length > 0;
  const hasSolana = balances.solana;

  if (!hasEvm && !hasSolana) {
    return (
      <div className="space-y-4">
        <SectionHeader title="BALANCES" />
        <div className="border border-border bg-surface p-6 text-center">
          <span className="font-mono text-xs text-text-muted">
            No balances found
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="BALANCES" />

      {/* EVM Chains */}
      {hasEvm &&
        balances.evm?.chains.map((chain) => (
          <EvmChainCard
            key={chain.chainId}
            chain={chain}
            address={addresses?.evmAddress ?? balances.evm?.address ?? ""}
          />
        ))}

      {/* Solana */}
      {hasSolana && balances.solana && (
        <SolanaBalanceCard
          solana={balances.solana}
          address={addresses?.solanaAddress ?? balances.solana?.address ?? ""}
        />
      )}
    </div>
  );
}

// ── EvmChainCard ────────────────────────────────────────────────────────

function EvmChainCard({
  chain,
  address,
}: {
  chain: EvmChainBalance;
  address: string;
}) {
  const explorerUrl = getExplorerAddressUrl(chain.chainId, address);

  return (
    <div className="border border-border bg-surface overflow-hidden">
      {/* Chain header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-dark-secondary border-b border-border">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="font-mono text-xs font-medium text-text-light tracking-wide">
            {chain.chain.toUpperCase()}
          </span>
          <span className="font-mono text-[10px] text-text-subtle">
            (Chain {chain.chainId})
          </span>
        </div>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-brand hover:text-brand-hover transition-colors"
          >
            VIEW ON EXPLORER →
          </a>
        )}
      </div>

      {/* Native balance */}
      <div className="px-4 py-3 border-b border-border-subtle">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-surface-elevated border border-border flex items-center justify-center">
              <span className="font-mono text-[10px] font-bold text-text-light">
                {chain.nativeSymbol.slice(0, 3)}
              </span>
            </div>
            <div>
              <p className="font-mono text-sm font-medium text-text-light">
                {formatBalance(chain.nativeBalance)}{" "}
                <span className="text-text-muted">{chain.nativeSymbol}</span>
              </p>
              <p className="font-mono text-[10px] text-text-subtle">
                {formatUsd(chain.nativeValueUsd)}
              </p>
            </div>
          </div>
          <span className="font-mono text-[10px] tracking-wider text-text-subtle px-2 py-0.5 border border-border-subtle">
            NATIVE
          </span>
        </div>
      </div>

      {/* Token balances */}
      {chain.tokens.length > 0 ? (
        <div className="divide-y divide-border-subtle">
          {chain.tokens.map((token) => (
            <TokenRow key={token.contractAddress} token={token} />
          ))}
        </div>
      ) : (
        <div className="px-4 py-3 text-center">
          <span className="font-mono text-[10px] text-text-subtle">
            No ERC-20 tokens found
          </span>
        </div>
      )}

      {/* Chain error */}
      {chain.error && (
        <div className="px-4 py-2 bg-status-stopped/5 border-t border-status-stopped/20">
          <span className="font-mono text-[10px] text-status-stopped">
            {chain.error}
          </span>
        </div>
      )}
    </div>
  );
}

// ── TokenRow ────────────────────────────────────────────────────────────

function TokenRow({ token }: { token: EvmTokenBalance | SolanaTokenBalance }) {
  const symbol = token.symbol || "???";
  const isEvm = "contractAddress" in token;

  return (
    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-hover/30 transition-colors">
      <div className="flex items-center gap-3">
        {token.logoUrl ? (
          <img
            src={token.logoUrl}
            alt={symbol}
            className="w-6 h-6 rounded-full bg-surface-elevated"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-surface-elevated border border-border flex items-center justify-center">
            <span className="font-mono text-[8px] font-bold text-text-muted">
              {symbol.slice(0, 2)}
            </span>
          </div>
        )}
        <div>
          <p className="font-mono text-xs text-text-light">
            {formatBalance(token.balance)}{" "}
            <span className="text-text-muted">{symbol}</span>
          </p>
          {token.name && (
            <p className="font-mono text-[10px] text-text-subtle">
              {token.name}
            </p>
          )}
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono text-xs text-text-light tabular-nums">
          {formatUsd(token.valueUsd)}
        </p>
        <p className="font-mono text-[10px] text-text-subtle">
          {isEvm
            ? truncateAddress((token as EvmTokenBalance).contractAddress, 4)
            : truncateAddress((token as SolanaTokenBalance).mint, 4)}
        </p>
      </div>
    </div>
  );
}

// ── SolanaBalanceCard ───────────────────────────────────────────────────

function SolanaBalanceCard({
  solana,
  address,
}: {
  solana: NonNullable<WalletBalancesResponse["solana"]>;
  address: string;
}) {
  const explorerUrl = getSolanaExplorerUrl(address);

  return (
    <div className="border border-border bg-surface overflow-hidden">
      {/* Chain header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-dark-secondary border-b border-border">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-500" />
          <span className="font-mono text-xs font-medium text-text-light tracking-wide">
            SOLANA
          </span>
        </div>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[10px] text-brand hover:text-brand-hover transition-colors"
        >
          VIEW ON SOLSCAN →
        </a>
      </div>

      {/* SOL balance */}
      <div className="px-4 py-3 border-b border-border-subtle">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-surface-elevated border border-border flex items-center justify-center">
              <span className="font-mono text-[10px] font-bold text-purple-400">
                SOL
              </span>
            </div>
            <div>
              <p className="font-mono text-sm font-medium text-text-light">
                {formatBalance(solana.solBalance)}{" "}
                <span className="text-text-muted">SOL</span>
              </p>
              <p className="font-mono text-[10px] text-text-subtle">
                {formatUsd(solana.solValueUsd)}
              </p>
            </div>
          </div>
          <span className="font-mono text-[10px] tracking-wider text-text-subtle px-2 py-0.5 border border-border-subtle">
            NATIVE
          </span>
        </div>
      </div>

      {/* SPL tokens */}
      {solana.tokens.length > 0 ? (
        <div className="divide-y divide-border-subtle">
          {solana.tokens.map((token) => (
            <TokenRow key={token.mint} token={token} />
          ))}
        </div>
      ) : (
        <div className="px-4 py-3 text-center">
          <span className="font-mono text-[10px] text-text-subtle">
            No SPL tokens found
          </span>
        </div>
      )}
    </div>
  );
}
