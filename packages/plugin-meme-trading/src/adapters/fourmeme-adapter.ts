/**
 * FourMeme protocol adapter for BSC.
 *
 * Uses four-flap-meme-sdk for on-chain operations
 * and the FourMeme REST API for token discovery.
 */

import {
  tryBuy,
  trySell,
  buyTokenWithFunds,
  sellToken as sdkSellToken,
  ensureSellApprovalV2,
} from 'four-flap-meme-sdk';
import { ethers } from 'ethers';
import { FOUR_API_BASE, getBscRpcUrl } from '../config.js';
import type { ProtocolAdapter } from './types.js';
import type { TokenInfo, TradeQuote, TradeResult, TrendingToken } from '../types.js';

export class FourMemeAdapter implements ProtocolAdapter {
  readonly name = 'fourmeme' as const;

  private get rpcUrl(): string {
    return getBscRpcUrl();
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo | null> {
    try {
      // Use the REST API for rich token data
      const resp = await fetch(
        `${FOUR_API_BASE}/private/token/get/v2?address=${tokenAddress}`,
      );
      if (!resp.ok) return null;

      const data = (await resp.json()) as any;
      const token = data?.data;
      if (!token) return null;

      return {
        address: tokenAddress,
        name: token.name || '',
        symbol: token.symbol || '',
        status: token.status === 'GRADUATED' ? 'dex' : 'bonding',
        priceNative: token.price || '0',
        reserve: token.raisedAmount || '0',
        circulatingSupply: token.circulatingSupply || '0',
        protocol: 'fourmeme',
      };
    } catch {
      return null;
    }
  }

  async quoteBuy(tokenAddress: string, amountBnbWei: bigint): Promise<TradeQuote> {
    const quote = await tryBuy('BSC', this.rpcUrl, tokenAddress, 0n, amountBnbWei);

    return {
      inputAmount: amountBnbWei,
      outputAmount: quote.estimatedAmount,
      minOutput: 0n, // Caller applies slippage
      fee: quote.estimatedFee,
      protocol: 'fourmeme',
      side: 'buy',
    };
  }

  async quoteSell(tokenAddress: string, amountTokensWei: bigint): Promise<TradeQuote> {
    const quote = await trySell('BSC', this.rpcUrl, tokenAddress, amountTokensWei);

    return {
      inputAmount: amountTokensWei,
      outputAmount: quote.funds,
      minOutput: 0n,
      fee: quote.fee,
      protocol: 'fourmeme',
      side: 'sell',
    };
  }

  async executeBuy(
    tokenAddress: string,
    amountBnbWei: bigint,
    minOutputWei: bigint,
    privateKey: string,
  ): Promise<TradeResult> {
    try {
      const receipt = await buyTokenWithFunds(
        'BSC',
        this.rpcUrl,
        privateKey,
        tokenAddress,
        amountBnbWei,
        minOutputWei,
      );

      return {
        success: true,
        txHash: receipt?.hash || receipt?.transactionHash,
        inputAmount: ethers.formatEther(amountBnbWei),
        outputAmount: '', // Parse from receipt
      };
    } catch (err) {
      return {
        success: false,
        inputAmount: ethers.formatEther(amountBnbWei),
        outputAmount: '0',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async executeSell(
    tokenAddress: string,
    amountTokensWei: bigint,
    minOutputWei: bigint,
    privateKey: string,
  ): Promise<TradeResult> {
    try {
      // Approve TokenManager2 first
      await ensureSellApprovalV2(
        'BSC' as any,
        this.rpcUrl,
        privateKey,
        tokenAddress,
        amountTokensWei,
      );

      const receipt = await sdkSellToken(
        'BSC',
        this.rpcUrl,
        privateKey,
        tokenAddress,
        amountTokensWei,
        minOutputWei,
      );

      return {
        success: true,
        txHash: receipt?.hash || receipt?.transactionHash,
        inputAmount: ethers.formatUnits(amountTokensWei, 18),
        outputAmount: '', // Parse from receipt
      };
    } catch (err) {
      return {
        success: false,
        inputAmount: ethers.formatUnits(amountTokensWei, 18),
        outputAmount: '0',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async getTrending(params?: { type?: string; limit?: number }): Promise<TrendingToken[]> {
    const type = params?.type || 'hot';
    const limit = params?.limit ?? 10;

    // Map our type names to FourMeme API ranking types
    const rankingTypeMap: Record<string, string> = {
      hot: 'HOT',
      volume: 'VOLUME',
      newest: 'NEWEST',
      graduated: 'GRADUATED',
    };

    try {
      const resp = await fetch(`${FOUR_API_BASE}/public/token/ranking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rankingType: rankingTypeMap[type] || 'HOT',
          pageNo: 1,
          pageSize: limit,
        }),
      });

      const data = (await resp.json()) as any;
      const tokens = data?.data?.list ?? data?.data ?? [];

      return tokens.map((t: any) => ({
        address: t.address || t.tokenAddress || '',
        name: t.name || '',
        symbol: t.symbol || '',
        priceNative: t.price || '0',
        volume24h: t.volume24h || t.volume,
        marketCap: t.marketCap,
        change24h: t.change24h || t.priceChange,
        protocol: 'fourmeme' as const,
      }));
    } catch {
      return [];
    }
  }
}
