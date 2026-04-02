/**
 * FLAP_TRENDING — Show trending tokens on Flap.sh (BSC).
 */

import type { Action, HandlerOptions } from '@elizaos/core';
import { FlapTrendingSchema } from '../schemas/flap.js';
import { FlapAdapter } from '../adapters/flap-adapter.js';
import { shortAddress } from '../utils/format.js';

const adapter = new FlapAdapter();

export const flapTrendingAction: Action = {
  name: 'FLAP_TRENDING',
  similes: ['TRENDING_ON_FLAP', 'FLAP_HOT', 'SHOW_FLAP_TRENDING'],
  description: 'Show trending tokens on the Flap.sh bonding curve (BSC).',

  parameters: [
    {
      name: 'limit',
      description: 'Number of tokens to show (default: 10)',
      required: false,
      schema: { type: 'number', default: 10 },
    },
  ],

  examples: [
    [
      {
        name: 'user',
        content: { text: 'what\'s trending on flap?', actions: ['FLAP_TRENDING'] },
      },
    ],
  ],

  validate: async () => true,

  handler: async (runtime, message, state, options) => {
    const params = (options as HandlerOptions)?.parameters as Record<string, unknown> | undefined;
    const parsed = FlapTrendingSchema.safeParse({ limit: params?.limit ?? 10 });

    if (!parsed.success) {
      return { success: false, text: '❌ Invalid parameters.' };
    }

    const tokens = await adapter.getTrending({ limit: parsed.data.limit });

    if (tokens.length === 0) {
      return { success: true, text: '🦋 No trending Flap tokens found right now.' };
    }

    const lines = tokens.map((t, i) => {
      const parts = [`**${i + 1}.** ${t.name || t.symbol} (${t.symbol})`];
      parts.push(`  • Address: ${shortAddress(t.address)}`);
      if (t.priceNative && t.priceNative !== '0') parts.push(`  • Price: ${t.priceNative} BNB`);
      if (t.volume24h) parts.push(`  • 24h Vol: ${t.volume24h}`);
      if (t.marketCap) parts.push(`  • MCap: ${t.marketCap}`);
      return parts.join('\n');
    });

    return {
      success: true,
      text: `🦋 **Trending on Flap.sh (BSC)**\n\n${lines.join('\n\n')}`,
    };
  },
};
