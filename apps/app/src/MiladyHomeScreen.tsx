/**
 * Milady home screen — the brand override for the stock elizaOS HomeScreen.
 *
 * Wired through the `homeScreen` boot-config slot (see main.tsx). It renders the
 * shared HomeScreen (so it stays in sync with the upstream layout) but injects a
 * gold wallet widget beside the clock: live portfolio total + address, tapping
 * through to the wallet/inventory view. Identical to the elizaOS home today, just
 * Milady-gold with the wallet — the rest of the brand customization lands here.
 */
import {
  HomeScreen,
  type HomeScreenProps,
  type HomeTileTarget,
} from "@elizaos/ui";
import { useApp } from "@elizaos/app-core";
import type { WalletAddresses, WalletBalancesResponse } from "@elizaos/shared";
import * as React from "react";

const GOLD = "#f0b90b";

function parseUsd(value: string | null | undefined): number {
  const n = Number.parseFloat((value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatUsd(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });
}

function shortenAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= 11 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/** Sum every USD value the balances response carries (no precomputed total). */
function sumPortfolioUsd(balances: WalletBalancesResponse | null): number {
  if (!balances) return 0;
  let total = 0;
  for (const chain of balances.evm?.chains ?? []) {
    total += parseUsd(chain.nativeValueUsd);
    for (const token of chain.tokens ?? []) total += parseUsd(token.valueUsd);
  }
  if (balances.solana) {
    total += parseUsd(balances.solana.solValueUsd);
    for (const token of balances.solana.tokens ?? [])
      total += parseUsd(token.valueUsd);
  }
  return total;
}

function WalletGlyph(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
      <path d="M16 12h.01" />
    </svg>
  );
}

/** Gold wallet pill shown beside the clock; taps through to the wallet view. */
function MiladyWalletWidget({
  onOpen,
}: {
  onOpen: () => void;
}): React.JSX.Element | null {
  const app = useApp() as {
    walletEnabled?: boolean;
    walletAddresses?: WalletAddresses | null;
    walletBalances?: WalletBalancesResponse | null;
    loadBalances?: () => void;
    loadWalletConfig?: () => void;
  };
  const {
    walletEnabled,
    walletAddresses,
    walletBalances,
    loadBalances,
    loadWalletConfig,
  } = app;

  // Wallet data is lazy — the home is the first surface that needs it, so kick
  // the fetch on mount (the inventory view / sidebar widget do the same).
  React.useEffect(() => {
    loadWalletConfig?.();
    loadBalances?.();
  }, [loadWalletConfig, loadBalances]);

  if (walletEnabled === false) return null;

  const address =
    walletAddresses?.evmAddress ?? walletAddresses?.solanaAddress ?? null;
  const short = shortenAddress(address);
  const total = sumPortfolioUsd(walletBalances ?? null);

  return (
    <button
      type="button"
      data-testid="home-wallet"
      onClick={onOpen}
      aria-label="Open wallet"
      className="flex flex-col items-end gap-0.5 rounded-2xl border px-3 py-2 text-right backdrop-blur-2xl backdrop-saturate-150 transition-colors focus-visible:outline-none focus-visible:ring-2"
      style={{
        borderColor: "rgba(240,185,11,0.32)",
        background: "rgba(240,185,11,0.10)",
      }}
    >
      <span
        className="flex items-center gap-1.5 text-sm font-semibold tabular-nums"
        style={{ color: GOLD }}
      >
        <WalletGlyph />
        {formatUsd(total)}
      </span>
      <span className="text-[11px] tabular-nums text-white/60">
        {short ?? "Set up wallet"}
      </span>
    </button>
  );
}

export function MiladyHomeScreen(
  props: Omit<HomeScreenProps, "clockAccessory">,
): React.JSX.Element {
  const openWallet = React.useCallback(() => {
    const target: HomeTileTarget = { kind: "tab", tab: "inventory" };
    props.onOpenTile(target);
  }, [props]);

  return (
    <HomeScreen
      {...props}
      clockAccessory={<MiladyWalletWidget onOpen={openWallet} />}
    />
  );
}
