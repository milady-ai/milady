/**
 * FLAP_BUY — Buy a token on the Flap.sh bonding curve using BNB.
 */

import type { Action, HandlerOptions, Memory } from '@elizaos/core';
import { FlapBuySchema, type FlapBuyParams } from '../schemas/flap.js';
import { FlapAdapter } from '../adapters/flap-adapter.js';
import { getPrivateKey } from '../config.js';
import { validateTokenForTrade } from '../utils/validation.js';
import { parseBnbToWei, applySlippage, formatBnb, formatTokens, shortAddress } from '../utils/format.js';
import { buildBuyConfirmation, buildTradeResult } from '../utils/confirmation.js';
import { TokenStatus } from 'four-flap-meme-sdk';

const adapter = new FlapAdapter();

export const flapBuyAction: Action = {
  name: 'FLAP_BUY',
  similes: ['BUY_ON_FLAP', 'FLAP_PURCHASE', 'BUY_FLAP_TOKEN'],
  description:
    'Buy a token on the Flap.sh bonding curve (BSC) using BNB. Requires a valid token address and an amount of BNB to spend.',

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
          text: 'buy 0.1 BNB of 0x1234567890abcdef1234567890abcdef12345678 on flap',
          actions: ['FLAP_BUY'],
        },
      },
    ],
  ],

  validate: async (_runtime, _message) => {
    // Always valid — actual validation happens in handler
    return true;
  },

  handler: async (runtime, message, state, options, callback) => {
    const params = (options as HandlerOptions)?.parameters as Record<string, unknown> | undefined;

    // 1. Parse & validate params
    const parsed = FlapBuySchema.safeParse({
      tokenAddress: params?.tokenAddress,
      amountBnb: params?.amountBnb,
      slippagePct: params?.slippagePct ?? 5,
    });

    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => e.message).join(', ');
      return { success: false, text: `❌ Invalid parameters: ${errors}` };
    }

    const { tokenAddress, amountBnb, slippagePct } = parsed.data;

    // 2. Validate token on-chain
    const tokenCheck = await validateTokenForTrade(tokenAddress);
    if (!tokenCheck.valid) {
      return { success: false, text: `❌ Token validation failed: ${tokenCheck.error}` };
    }

    // 3. Check token status on Flap
    const tokenInfo = await adapter.getTokenInfo(tokenAddress);
    if (!tokenInfo || tokenInfo.status !== 'bonding') {
      return {
        success: false,
        text: `❌ Token is not tradable on Flap bonding curve (status: ${tokenInfo?.status ?? 'not found'})`,
      };
    }

    // 4. Get quote
    const amountWei = parseBnbToWei(amountBnb);
    const quote = await adapter.quoteBuy(tokenAddress, amountWei);
    quote.minOutput = applySlippage(quote.outputAmount, slippagePct);

    // 5. Show confirmation
    const confirmMsg = buildBuyConfirmation({
      action: 'FLAP_BUY',
      tokenAddress,
      tokenName: tokenCheck.name,
      tokenSymbol: tokenCheck.symbol,
      protocol: 'flap',
      quote,
    });

    // For now, auto-confirm (TODO: implement actual confirmation flow)
    // In production, return the confirmation message and wait for user reply

    // 6. Execute
    const privateKey = getPrivateKey();
    const result = await adapter.executeBuy(tokenAddress, amountWei, quote.minOutput, privateKey);

    const resultMsg = buildTradeResult({
      success: result.success,
      protocol: 'flap',
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
