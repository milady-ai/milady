/**
 * Flap.sh protocol adapter for BSC.
 *
 * Uses four-flap-meme-sdk's FlapPortal / FlapPortalWriter
 * for all on-chain interactions.
 */

import {
  FlapPortal,
  FlapPortalWriter,
  TokenStatus,
  ensureFlapSellApproval,
  type TokenStateV5,
} from 'four-flap-meme-sdk';
import { ethers } from 'ethers';
import { BSC_CONTRACTS, getBscRpcUrl, FLAP_GRAPHQL } from '../config.js';
import type { ProtocolAdapter } from './types.js';
import type { TokenInfo, TradeQuote, TradeResult, TrendingToken } from '../types.js';

const ZERO_ADDRESS = BSC_CONTRACTS.ZERO_ADDRESS;

function mapStatus(status: number): TokenInfo['status'] {
  switch (status) {
    case TokenStatus.Tradable:
      return 'bonding';
    case TokenStatus.DEX:
      return 'dex';
    case TokenStatus.Killed:
      return 'killed';
    default:
      return 'unknown';
  }
}

export class FlapAdapter implements ProtocolAdapter {
  readonly name = 'flap' as const;

  private get rpcUrl(): string {
    return getBscRpcUrl();
  }

  private get portalAddress(): string {
    return BSC_CONTRACTS.FLAP_PORTAL;
  }

  private getPortal(): FlapPortal {
    return new FlapPortal({
      rpcUrl: this.rpcUrl,
      portalAddress: this.portalAddress,
    });
  }

  private getWriter(privateKey: string): FlapPortalWriter {
    return new FlapPortalWriter({
      rpcUrl: this.rpcUrl,
      portalAddress: this.portalAddress,
      privateKey,
    });
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo | null> {
    try {
      const portal = this.getPortal();
      const state: TokenStateV5 = await portal.getTokenV5(tokenAddress);

      // Invalid tokens have status 0
      if (state.status === TokenStatus.Invalid) {
        return null;
      }

      return {
        address: tokenAddress,
        name: '', // Flap Portal doesn't return name — need ERC20 call
        symbol: '', // Same — fill from ERC20
        status: mapStatus(state.status),
        priceNative: ethers.formatEther(state.price),
        reserve: ethers.formatEther(state.reserve),
        circulatingSupply: ethers.formatEther(state.circulatingSupply),
        protocol: 'flap',
      };
    } catch {
      return null;
    }
  }

  async quoteBuy(tokenAddress: string, amountBnbWei: bigint): Promise<TradeQuote> {
    const portal = this.getPortal();

    const expectedOutput = await portal.quoteExactInput({
      inputToken: ZERO_ADDRESS,
      outputToken: tokenAddress,
      inputAmount: amountBnbWei,
    });

    // Flap BSC fee is 1%
    const fee = amountBnbWei / 100n;

    return {
      inputAmount: amountBnbWei,
      outputAmount: expectedOutput,
      minOutput: 0n, // Caller applies slippage
      fee,
      protocol: 'flap',
      side: 'buy',
    };
  }

  async quoteSell(tokenAddress: string, amountTokensWei: bigint): Promise<TradeQuote> {
    const portal = this.getPortal();

    const expectedBnb = await portal.quoteExactInput({
      inputToken: tokenAddress,
      outputToken: ZERO_ADDRESS,
      inputAmount: amountTokensWei,
    });

    const fee = expectedBnb / 100n;

    return {
      inputAmount: amountTokensWei,
      outputAmount: expectedBnb,
      minOutput: 0n,
      fee,
      protocol: 'flap',
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
      const writer = this.getWriter(privateKey);
      const tx = await writer.swapExactInput(
        {
          inputToken: ZERO_ADDRESS,
          outputToken: tokenAddress,
          inputAmount: amountBnbWei,
          minOutputAmount: minOutputWei,
          permitData: '0x',
        },
        amountBnbWei,
      );

      return {
        success: true,
        txHash: tx.hash,
        inputAmount: ethers.formatEther(amountBnbWei),
        outputAmount: '', // Parse from receipt events
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
      // Ensure approval first
      await ensureFlapSellApproval(
        'BSC' as any,
        this.rpcUrl,
        privateKey,
        tokenAddress,
        amountTokensWei,
      );

      const writer = this.getWriter(privateKey);
      const tx = await writer.swapExactInput(
        {
          inputToken: tokenAddress,
          outputToken: ZERO_ADDRESS,
          inputAmount: amountTokensWei,
          minOutputAmount: minOutputWei,
          permitData: '0x',
        },
        0n, // No msg.value for sell
      );

      return {
        success: true,
        txHash: tx.hash,
        inputAmount: ethers.formatUnits(amountTokensWei, 18),
        outputAmount: '', // Parse from receipt events
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

  async getTrending(params?: { limit?: number }): Promise<TrendingToken[]> {
    // Flap uses GraphQL API for token listings
    const limit = params?.limit ?? 10;

    try {
      const response = await fetch(FLAP_GRAPHQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query TrendingTokens($limit: Int!) {
              tokens(
                orderBy: VOLUME_DESC
                first: $limit
                filter: { chain: BSC, status: TRADABLE }
              ) {
                address
                name
                symbol
                price
                volume24h
                marketCap
              }
            }
          `,
          variables: { limit },
        }),
      });

      const data = await response.json() as any;
      const tokens = data?.data?.tokens ?? [];

      return tokens.map((t: any) => ({
        address: t.address,
        name: t.name || '',
        symbol: t.symbol || '',
        priceNative: t.price || '0',
        volume24h: t.volume24h,
        marketCap: t.marketCap,
        protocol: 'flap' as const,
      }));
    } catch {
      // GraphQL schema may differ — return empty
      return [];
    }
  }
}
