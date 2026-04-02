/**
 * FLAP_LAUNCH — Create a new token on Flap.sh (BSC).
 *
 * This is a complex flow:
 * 1. Upload image to IPFS via Pinata
 * 2. Build & upload metadata JSON to IPFS
 * 3. Mine vanity salt for CREATE2 address
 * 4. Call newTokenV4 on the Portal
 *
 * TODO: Implement fully. Placeholder for now.
 */

import type { Action, HandlerOptions } from '@elizaos/core';
import { FlapLaunchSchema } from '../schemas/flap.js';

export const flapLaunchAction: Action = {
  name: 'FLAP_LAUNCH',
  similes: ['CREATE_TOKEN_ON_FLAP', 'LAUNCH_ON_FLAP', 'FLAP_CREATE'],
  description:
    'Create a new token on Flap.sh (BSC). Requires name, symbol, description, and optionally an image.',

  parameters: [
    {
      name: 'name',
      description: 'Token name (e.g. "Doge Flap")',
      required: true,
      schema: { type: 'string' },
    },
    {
      name: 'symbol',
      description: 'Token ticker symbol (e.g. "DFLAP")',
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
      name: 'imageUrl',
      description: 'URL of the token image (optional)',
      required: false,
      schema: { type: 'string' },
    },
    {
      name: 'initialBuyBnb',
      description: 'Amount of BNB for initial buy alongside launch (optional)',
      required: false,
      schema: { type: 'string' },
    },
  ],

  examples: [
    [
      {
        name: 'user',
        content: {
          text: 'launch a token called "Moon Dog" with symbol MDOG on flap',
          actions: ['FLAP_LAUNCH'],
        },
      },
    ],
  ],

  validate: async () => true,

  handler: async (runtime, message, state, options) => {
    const params = (options as HandlerOptions)?.parameters as Record<string, unknown> | undefined;

    const parsed = FlapLaunchSchema.safeParse({
      name: params?.name,
      symbol: params?.symbol,
      description: params?.description,
      imageUrl: params?.imageUrl,
      initialBuyBnb: params?.initialBuyBnb,
    });

    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => e.message).join(', ');
      return { success: false, text: `❌ Invalid parameters: ${errors}` };
    }

    // TODO: Implement full launch flow
    // 1. Upload image to IPFS (needs Pinata API key)
    // 2. Build metadata JSON + upload
    // 3. Mine vanity salt (CPU-intensive — findSaltEndingByChain)
    // 4. Call newTokenV4 on Portal
    // 5. Optionally do initial buy

    return {
      success: false,
      text: [
        '🚧 **Flap Token Launch — Coming Soon**',
        '',
        `Token launch for **${parsed.data.name}** (${parsed.data.symbol}) is not yet implemented.`,
        '',
        'This requires:',
        '• IPFS image/metadata upload (Pinata)',
        '• Vanity address mining (CPU-intensive)',
        '• On-chain Portal transaction',
        '',
        'Use the Flap.sh website for now: <https://flap.sh/create>',
      ].join('\n'),
    };
  },
};
