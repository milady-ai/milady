/**
 * Shared helpers for wallet dashboard components.
 */

// ── Constants ───────────────────────────────────────────────────────────

export const REFRESH_INTERVAL_MS = 30_000;

export const CHAIN_EXPLORERS: Record<number, { name: string; url: string }> = {
  1: { name: "Etherscan", url: "https://etherscan.io" },
  8453: { name: "BaseScan", url: "https://basescan.org" },
  56: { name: "BscScan", url: "https://bscscan.com" },
  84532: { name: "Base Sepolia", url: "https://sepolia.basescan.org" },
  97: { name: "BSC Testnet", url: "https://testnet.bscscan.com" },
};

export const SOLANA_EXPLORER = "https://solscan.io";

// ── Helpers ─────────────────────────────────────────────────────────────

export function truncateAddress(addr: string, chars = 6): string {
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
}

export function formatBalance(balance: string, decimals = 4): string {
  const num = Number.parseFloat(balance);
  if (Number.isNaN(num)) return "0";
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  return num.toFixed(decimals);
}

export function formatUsd(value: string): string {
  const num = Number.parseFloat(value);
  if (Number.isNaN(num) || num === 0) return "$0.00";
  if (num < 0.01) return "<$0.01";
  return `$${num.toFixed(2)}`;
}

export function getExplorerAddressUrl(
  chainId: number,
  address: string,
): string | null {
  const explorer = CHAIN_EXPLORERS[chainId];
  if (!explorer) return null;
  return `${explorer.url}/address/${address}`;
}

export function getSolanaExplorerUrl(address: string): string {
  return `${SOLANA_EXPLORER}/account/${address}`;
}
