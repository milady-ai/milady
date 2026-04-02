/**
 * FOURMEME_SELL — Sell a meme token on Four.meme for BNB.
 */

import type { Action, HandlerOptions } from '@elizaos/core';
import { FourMemeSellSchema } from '../schemas/fourmeme.js';
import { FourMemeAdapter } from '../adapters/fourmeme-adapter.js';
import { getPrivateKey } from '../config.js';
import { validateTokenForTrade, getTokenBalance } from '../utils/validation.js';
import { parseTokensToWei, applySlippage, formatBnb, formatTokens } from '../utils/format.js';
import { buildTradeResult } from '../utils/confirmation.js';
import { ethers } from 'ethers';

const adapter = new FourMemeAdapter();

export const fourMemeSellAction: Action = {
  name: 'FOURMEME_SELL',
  similes: ['SELL_ON_FOURMEME', 'FOUR_SELL', 'SELL_ON_FOUR'],
  description: 'Sell a meme token on Four.meme (BSC) for BNB.',

  parameters: [
    {
      name: 'tokenAddress',
      description: 'The BSC contract address of the token to sell',
      required: true,
      schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
    },
    {
      name: 'amountTokens',
      description: 'Amount of tokens to sell, or "all" for full balance',
      required: true,
      schema: { type: 'string' },
    },
    {
      name: 'slippagePct',
      description: 'Slippage tolerance percentage (default: 5)',
      required: false,
      schema: { type: 'number', default: 5 },
    },
  ],

  examples: [
    [
      {
        name: 'user',
        content: {
          text: 'sell all my PEPE on fourmeme',
          actions: ['FOURMEME_SELL'],
        },
      },
    ],
  ],

  validate: async () => true,

  handler: async (runtime, message, state, options) => {
    const params = (options as HandlerOptions)?.parameters as Record<string, unknown> | undefined;

    const parsed = FourMemeSellSchema.safeParse({
      tokenAddress: params?.tokenAddress,
      amountTokens: params?.amountTokens,
      slippagePct: params?.slippagePct ?? 5,
    });

    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => e.message).join(', ');
      return { success: false, text: `❌ Invalid parameters: ${errors}` };
    }

    const { tokenAddress, amountTokens, slippagePct } = parsed.data;

    const tokenCheck = await validateTokenForTrade(tokenAddress);
    if (!tokenCheck.valid) {
      return { success: false, text: `❌ Token validation failed: ${tokenCheck.error}` };
    }

    const privateKey = getPrivateKey();
    const wallet = new ethers.Wallet(privateKey);
    let amountWei: bigint;

    if (amountTokens.toLowerCase() === 'all') {
      amountWei = await getTokenBalance(tokenAddress, wallet.address);
      if (amountWei === 0n) {
        return { success: false, text: '❌ You have no balance of this token.' };
      }
    } else {
      amountWei = parseTokensToWei(amountTokens, tokenCheck.decimals);
    }

    let quote;
    try {
      quote = await adapter.quoteSell(tokenAddress, amountWei);
    } catch (err) {
      return {
        success: false,
        text: `❌ Failed to get sell quote: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    quote.minOutput = applySlippage(quote.outputAmount, slippagePct);

    const result = await adapter.executeSell(tokenAddress, amountWei, quote.minOutput, privateKey);

    const resultMsg = buildTradeResult({
      success: result.success,
      protocol: 'fourmeme',
      side: 'sell',
      tokenSymbol: tokenCheck.symbol,
      inputAmount: formatTokens(amountWei, tokenCheck.decimals),
      outputAmount: formatBnb(quote.outputAmount),
      txHash: result.txHash,
      error: result.error,
    });

    return { success: result.success, text: resultMsg };
  },
};
