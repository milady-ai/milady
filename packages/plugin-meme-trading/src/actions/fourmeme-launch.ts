/**
 * FOURMEME_LAUNCH — Create a new meme token on Four.meme (BSC).
 *
 * Flow:
 * 1. Login (nonce → sign → access_token)
 * 2. Upload image
 * 3. Get config (raisedToken)
 * 4. POST create → createArg + signature
 * 5. Call TokenManager2.createToken on-chain
 *
 * TODO: Implement fully. Placeholder for now.
 */

import type { Action, HandlerOptions } from '@elizaos/core';
import { FourMemeLaunchSchema } from '../schemas/fourmeme.js';

export const fourMemeLaunchAction: Action = {
  name: 'FOURMEME_LAUNCH',
  similes: ['CREATE_TOKEN_ON_FOURMEME', 'LAUNCH_ON_FOUR', 'FOUR_CREATE'],
  description:
    'Create a new meme token on Four.meme (BSC). Requires name, symbol, description.',

  parameters: [
    {
      name: 'name',
      description: 'Token name',
      required: true,
      schema: { type: 'string' },
    },
    {
      name: 'symbol',
      description: 'Token ticker symbol',
      required: true,
      schema: { type: 'string' },
    },
    {
      name: 'description',
      description: 'Token description',
      required: true,
      schema: { type: 'string' },
    },
    {
      name: 'label',
      description: 'Token category (Meme, AI, Defi, etc.)',
      required: false,
      schema: { type: 'string', default: 'Meme' },
    },
    {
      name: 'imageUrl',
      description: 'URL of the token image (optional)',
      required: false,
      schema: { type: 'string' },
    },
    {
      name: 'raisedToken',
      description: 'Currency to raise (BNB, CAKE, USDT — default: BNB)',
      required: false,
      schema: { type: 'string', default: 'BNB' },
    },
  ],

  examples: [
    [
      {
        name: 'user',
        content: {
          text: 'launch a meme token called "Milady Coin" MLDY on fourmeme',
          actions: ['FOURMEME_LAUNCH'],
        },
      },
    ],
  ],

  validate: async () => true,

  handler: async (runtime, message, state, options) => {
    const params = (options as HandlerOptions)?.parameters as Record<string, unknown> | undefined;

    const parsed = FourMemeLaunchSchema.safeParse({
      name: params?.name,
      symbol: params?.symbol,
      description: params?.description,
      label: params?.label ?? 'Meme',
      imageUrl: params?.imageUrl,
      raisedToken: params?.raisedToken ?? 'BNB',
    });

    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => e.message).join(', ');
      return { success: false, text: `❌ Invalid parameters: ${errors}` };
    }

    // TODO: Implement full launch flow using FourClient from SDK
    // The flow is:
    // 1. FourClient.generateNonce()
    // 2. Sign login message
    // 3. FourClient.login()
    // 4. FourClient.uploadImage()
    // 5. FourClient.getPublicConfig()
    // 6. FourClient.createToken()
    // 7. createTokenOnChain()

    return {
      success: false,
      text: [
        '🚧 **FourMeme Token Launch — Coming Soon**',
        '',
        `Token launch for **${parsed.data.name}** (${parsed.data.symbol}) is not yet implemented.`,
        '',
        'This requires the full FourMeme API flow:',
        '• Wallet login (nonce + signature)',
        '• Image upload',
        '• API-side token creation',
        '• On-chain TokenManager2 call',
        '',
        'Use the Four.meme website for now: <https://four.meme/create>',
      ].join('\n'),
    };
  },
};
