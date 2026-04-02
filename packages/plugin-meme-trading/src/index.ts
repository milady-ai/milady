/**
 * plugin-meme-trading — ElizaOS actions for Flap.sh + FourMeme on BSC.
 *
 * Provides buy/sell/launch/trending actions for both meme token platforms.
 * Uses four-flap-meme-sdk for all on-chain interactions.
 */

import type { Action } from '@elizaos/core';

// Flap actions
import { flapBuyAction } from './actions/flap-buy.js';
import { flapSellAction } from './actions/flap-sell.js';
import { flapLaunchAction } from './actions/flap-launch.js';
import { flapTrendingAction } from './actions/flap-trending.js';

// FourMeme actions
import { fourMemeBuyAction } from './actions/fourmeme-buy.js';
import { fourMemeSellAction } from './actions/fourmeme-sell.js';
import { fourMemeLaunchAction } from './actions/fourmeme-launch.js';
import { fourMemeTrendingAction } from './actions/fourmeme-trending.js';

/** All meme trading actions, ready to register with ElizaOS runtime */
export const memeActions: Action[] = [
  flapBuyAction,
  flapSellAction,
  flapLaunchAction,
  flapTrendingAction,
  fourMemeBuyAction,
  fourMemeSellAction,
  fourMemeLaunchAction,
  fourMemeTrendingAction,
];

// Named exports
export {
  flapBuyAction,
  flapSellAction,
  flapLaunchAction,
  flapTrendingAction,
  fourMemeBuyAction,
  fourMemeSellAction,
  fourMemeLaunchAction,
  fourMemeTrendingAction,
};

// Re-export types and adapters
export type { TokenInfo, TradeQuote, TradeResult, TrendingToken } from './types.js';
export type { ProtocolAdapter } from './adapters/types.js';
export { FlapAdapter } from './adapters/flap-adapter.js';
export { FourMemeAdapter } from './adapters/fourmeme-adapter.js';
