/**
 * Formatting utilities for meme trading output.
 * Note: Discord/WhatsApp don't support markdown tables — use bullet lists.
 */

import { ethers } from 'ethers';

/** Format a bigint wei value to a human-readable BNB string */
export function formatBnb(wei: bigint, decimals = 4): string {
  const formatted = ethers.formatEther(wei);
  const num = parseFloat(formatted);
  return num.toFixed(decimals);
}

/** Format a bigint token value to a human-readable string */
export function formatTokens(wei: bigint, tokenDecimals = 18, displayDecimals = 2): string {
  const formatted = ethers.formatUnits(wei, tokenDecimals);
  const num = parseFloat(formatted);
  if (num > 1_000_000) return `${(num / 1_000_000).toFixed(displayDecimals)}M`;
  if (num > 1_000) return `${(num / 1_000).toFixed(displayDecimals)}K`;
  return num.toFixed(displayDecimals);
}

/** Truncate an address for display: 0x1234...abcd */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Parse a user-provided BNB amount string to wei bigint */
export function parseBnbToWei(amountBnb: string): bigint {
  return ethers.parseEther(amountBnb);
}

/** Parse a user-provided token amount string to wei bigint */
export function parseTokensToWei(amount: string, decimals = 18): bigint {
  return ethers.parseUnits(amount, decimals);
}

/** Calculate min output with slippage */
export function applySlippage(amount: bigint, slippagePct: number): bigint {
  const bps = BigInt(Math.floor((100 - slippagePct) * 100));
  return (amount * bps) / 10000n;
}

/** BSCScan transaction link */
export function bscScanTx(txHash: string): string {
  return `https://bscscan.com/tx/${txHash}`;
}

/** BSCScan token link */
export function bscScanToken(address: string): string {
  return `https://bscscan.com/token/${address}`;
}
