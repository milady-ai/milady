/**
 * FOURMEME_BUY — Buy a meme token on Four.meme using BNB.
 */

import type { Action, HandlerOptions } from '@elizaos/core';
import { FourMemeBuySchema } from '../schemas/fourmeme.js';
import { FourMemeAdapter } from '../adapters/fourmeme-adapter.js';
import { getPrivateKey } from '../config.js';
import { validateTokenForTrade } from '../utils/validation.js';
import { parseBnbToWei, applySlippage, formatBnb, formatTokens } from '../utils/format.js';
import { buildBuyConfirmation, buildTradeResult } from '../utils/confirmation.js';

const adapter = new FourMemeAdapter();

export const fourMemeBuyAction: Action = {
  name: 'FOURMEME_BUY',
  similes: ['BUY_ON_FOURMEME', 'FOUR_BUY', 'BUY_ON_FOUR', 'BUY_FOURMEME'],
  description:
    'Buy a meme token on Four.meme (BSC) using BNB. Requires a valid token address and BNB amount.',

  parameters: [
    {
      name: 'tokenAddress',
      description: 'The BSC contract address of the token to buy (0x...)',
      required: true,
      schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
    },
    {
      name: 'amountBnb',
      description: 'Amount of BNB to spend (e.g. "0.1")',
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
          text: 'buy 0.05 BNB of 0xabcdef1234567890abcdef1234567890abcdef12 on fourmeme',
          actions: ['FOURMEME_BUY'],
        },
      },
    ],
  ],

  validate: async () => true,

  handler: async (runtime, message, state, options, callback) => {
    const params = (options as HandlerOptions)?.parameters as Record<string, unknown> | undefined;

    const parsed = FourMemeBuySchema.safeParse({
      tokenAddress: params?.tokenAddress,
      amountBnb: params?.amountBnb,
      slippagePct: params?.slippagePct ?? 5,
    });

    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => e.message).join(', ');
      return { success: false, text: `❌ Invalid parameters: ${errors}` };
    }

    const { tokenAddress, amountBnb, slippagePct } = parsed.data;

    // Validate token
    const tokenCheck = await validateTokenForTrade(tokenAddress);
    if (!tokenCheck.valid) {
      return { success: false, text: `❌ Token validation failed: ${tokenCheck.error}` };
    }

    // Get quote
    const amountWei = parseBnbToWei(amountBnb);

    let quote;
    try {
      quote = await adapter.quoteBuy(tokenAddress, amountWei);
    } catch (err) {
      return {
        success: false,
        text: `❌ Failed to get quote from FourMeme. Token may not be listed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    quote.minOutput = applySlippage(quote.outputAmount, slippagePct);

    // Execute
    const privateKey = getPrivateKey();
    const result = await adapter.executeBuy(tokenAddress, amountWei, quote.minOutput, privateKey);

    const resultMsg = buildTradeResult({
      success: result.success,
      protocol: 'fourmeme',
      side: 'buy',
      tokenSymbol: tokenCheck.symbol,
      inputAmount: amountBnb,
      outputAmount: formatTokens(quote.outputAmount),
      txHash: result.txHash,
      error: result.error,
    });

    return { success: result.success, text: resultMsg };
  },
};
