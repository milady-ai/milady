/**
 * FLAP_SELL — Sell a token back to the Flap.sh bonding curve for BNB.
 */

import type { Action, HandlerOptions } from '@elizaos/core';
import { FlapSellSchema } from '../schemas/flap.js';
import { FlapAdapter } from '../adapters/flap-adapter.js';
import { getPrivateKey } from '../config.js';
import { validateTokenForTrade, getTokenBalance } from '../utils/validation.js';
import { parseTokensToWei, applySlippage, formatBnb, formatTokens } from '../utils/format.js';
import { buildSellConfirmation, buildTradeResult } from '../utils/confirmation.js';
import { ethers } from 'ethers';

const adapter = new FlapAdapter();

export const flapSellAction: Action = {
  name: 'FLAP_SELL',
  similes: ['SELL_ON_FLAP', 'FLAP_DUMP'],
  description:
    'Sell a token back to the Flap.sh bonding curve (BSC) for BNB.',

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
          text: 'sell all my 0x1234567890abcdef1234567890abcdef12345678 on flap',
          actions: ['FLAP_SELL'],
        },
      },
    ],
  ],

  validate: async () => true,

  handler: async (runtime, message, state, options, callback) => {
    const params = (options as HandlerOptions)?.parameters as Record<string, unknown> | undefined;

    const parsed = FlapSellSchema.safeParse({
      tokenAddress: params?.tokenAddress,
      amountTokens: params?.amountTokens,
      slippagePct: params?.slippagePct ?? 5,
    });

    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => e.message).join(', ');
      return { success: false, text: `❌ Invalid parameters: ${errors}` };
    }

    const { tokenAddress, amountTokens, slippagePct } = parsed.data;

    // Validate token
    const tokenCheck = await validateTokenForTrade(tokenAddress);
    if (!tokenCheck.valid) {
      return { success: false, text: `❌ Token validation failed: ${tokenCheck.error}` };
    }

    // Check Flap status
    const tokenInfo = await adapter.getTokenInfo(tokenAddress);
    if (!tokenInfo || tokenInfo.status !== 'bonding') {
      return {
        success: false,
        text: `❌ Token is not tradable on Flap (status: ${tokenInfo?.status ?? 'not found'})`,
      };
    }

    // Resolve amount
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

    // Quote
    const quote = await adapter.quoteSell(tokenAddress, amountWei);
    quote.minOutput = applySlippage(quote.outputAmount, slippagePct);

    // Execute
    const result = await adapter.executeSell(tokenAddress, amountWei, quote.minOutput, privateKey);

    const resultMsg = buildTradeResult({
      success: result.success,
      protocol: 'flap',
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
