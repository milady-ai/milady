/**
 * Shared types for the meme trading plugin.
 */

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  status: 'bonding' | 'dex' | 'killed' | 'unknown';
  priceNative: string; // Price in native currency (BNB)
  reserve: string; // Reserve in native currency
  circulatingSupply: string;
  protocol: 'flap' | 'fourmeme';
}

export interface TradeQuote {
  inputAmount: bigint;
  outputAmount: bigint;
  minOutput: bigint; // After slippage
  fee: bigint;
  priceImpactPct?: number;
  protocol: 'flap' | 'fourmeme';
  side: 'buy' | 'sell';
}

export interface TradeResult {
  success: boolean;
  txHash?: string;
  inputAmount: string;
  outputAmount: string;
  error?: string;
}

export interface TrendingToken {
  address: string;
  name: string;
  symbol: string;
  priceNative: string;
  volume24h?: string;
  marketCap?: string;
  change24h?: string;
  protocol: 'flap' | 'fourmeme';
}
