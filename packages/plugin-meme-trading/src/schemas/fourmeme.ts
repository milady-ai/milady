/**
 * Zod schemas for FourMeme action parameter validation.
 */

import { z } from 'zod';
import { FOURMEME_LABELS } from '../config.js';

const bscAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid BSC address (must be 0x + 40 hex chars)');

const positiveAmount = z
  .string()
  .refine(
    (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
    'Amount must be a positive number',
  );

const slippage = z.number().min(0.1).max(50).default(5);

export const FourMemeBuySchema = z.object({
  tokenAddress: bscAddress.describe(
    'The BSC contract address of the FourMeme token to buy',
  ),
  amountBnb: positiveAmount.describe('Amount of BNB to spend (e.g. "0.1")'),
  slippagePct: slippage.describe('Slippage tolerance percentage (default: 5)'),
});
export type FourMemeBuyParams = z.infer<typeof FourMemeBuySchema>;

export const FourMemeSellSchema = z.object({
  tokenAddress: bscAddress.describe('The BSC contract address of the token to sell'),
  amountTokens: z
    .string()
    .describe('Amount of tokens to sell, or "all" for full balance'),
  slippagePct: slippage,
});
export type FourMemeSellParams = z.infer<typeof FourMemeSellSchema>;

export const FourMemeLaunchSchema = z.object({
  name: z.string().min(1).max(32).describe('Token name'),
  symbol: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9]+$/, 'Symbol must be uppercase alphanumeric')
    .describe('Token ticker symbol'),
  description: z.string().min(1).max(1000).describe('Token description'),
  label: z
    .enum(FOURMEME_LABELS)
    .default('Meme')
    .describe('Token category label'),
  imageUrl: z.string().url().optional().describe('URL of the token image'),
  raisedToken: z
    .enum(['BNB', 'CAKE', 'USDT'])
    .default('BNB')
    .describe('Currency used to raise (default BNB)'),
});
export type FourMemeLaunchParams = z.infer<typeof FourMemeLaunchSchema>;

export const FourMemeTrendingSchema = z.object({
  type: z
    .enum(['hot', 'volume', 'newest', 'graduated'])
    .default('hot')
    .describe('Trending category'),
  limit: z.number().min(1).max(50).default(10).describe('Number of tokens to show'),
});
export type FourMemeTrendingParams = z.infer<typeof FourMemeTrendingSchema>;
