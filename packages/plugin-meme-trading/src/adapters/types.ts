/**
 * Shared adapter interface for meme trading protocols.
 */

import type { TokenInfo, TradeQuote, TradeResult, TrendingToken } from '../types.js';

export interface ProtocolAdapter {
  readonly name: 'flap' | 'fourmeme';

  /**
   * Get token info from chain.
   * Returns null if token doesn't exist on this protocol.
   */
  getTokenInfo(tokenAddress: string): Promise<TokenInfo | null>;

  /**
   * Get a buy quote: how many tokens for X BNB?
   */
  quoteBuy(tokenAddress: string, amountBnbWei: bigint): Promise<TradeQuote>;

  /**
   * Get a sell quote: how much BNB for X tokens?
   */
  quoteSell(tokenAddress: string, amountTokensWei: bigint): Promise<TradeQuote>;

  /**
   * Execute a buy trade.
   */
  executeBuy(
    tokenAddress: string,
    amountBnbWei: bigint,
    minOutputWei: bigint,
    privateKey: string,
  ): Promise<TradeResult>;

  /**
   * Execute a sell trade.
   */
  executeSell(
    tokenAddress: string,
    amountTokensWei: bigint,
    minOutputWei: bigint,
    privateKey: string,
  ): Promise<TradeResult>;

  /**
   * Get trending tokens.
   */
  getTrending(params?: { type?: string; limit?: number }): Promise<TrendingToken[]>;
}
