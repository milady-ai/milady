/**
 * FOURMEME_TRENDING — Show trending meme tokens on Four.meme.
 */

import type { Action, HandlerOptions } from '@elizaos/core';
import { FourMemeTrendingSchema } from '../schemas/fourmeme.js';
import { FourMemeAdapter } from '../adapters/fourmeme-adapter.js';
import { shortAddress } from '../utils/format.js';

const adapter = new FourMemeAdapter();

export const fourMemeTrendingAction: Action = {
  name: 'FOURMEME_TRENDING',
  similes: ['TRENDING_ON_FOURMEME', 'FOUR_TRENDING', 'SHOW_FOUR_TRENDING'],
  description: 'Show trending meme tokens on Four.meme (BSC).',

  parameters: [
    {
      name: 'type',
      description: 'Trending category: hot, volume, newest, graduated (default: hot)',
      required: false,
      schema: { type: 'string', default: 'hot' },
    },
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
        content: { text: 'what\'s hot on fourmeme?', actions: ['FOURMEME_TRENDING'] },
      },
    ],
  ],

  validate: async () => true,

  handler: async (runtime, message, state, options) => {
    const params = (options as HandlerOptions)?.parameters as Record<string, unknown> | undefined;

    const parsed = FourMemeTrendingSchema.safeParse({
      type: params?.type ?? 'hot',
      limit: params?.limit ?? 10,
    });

    if (!parsed.success) {
      return { success: false, text: '❌ Invalid parameters.' };
    }

    const tokens = await adapter.getTrending({
      type: parsed.data.type,
      limit: parsed.data.limit,
    });

    if (tokens.length === 0) {
      return { success: true, text: '4️⃣ No trending FourMeme tokens found right now.' };
    }

    const categoryLabel = parsed.data.type.charAt(0).toUpperCase() + parsed.data.type.slice(1);

    const lines = tokens.map((t, i) => {
      const parts = [`**${i + 1}.** ${t.name || t.symbol} (${t.symbol})`];
      parts.push(`  • Address: ${shortAddress(t.address)}`);
      if (t.priceNative && t.priceNative !== '0') parts.push(`  • Price: ${t.priceNative} BNB`);
      if (t.volume24h) parts.push(`  • 24h Vol: ${t.volume24h}`);
      if (t.marketCap) parts.push(`  • MCap: ${t.marketCap}`);
      if (t.change24h) parts.push(`  • 24h Change: ${t.change24h}`);
      return parts.join('\n');
    });

    return {
      success: true,
      text: `4️⃣ **${categoryLabel} on Four.meme (BSC)**\n\n${lines.join('\n\n')}`,
    };
  },
};
