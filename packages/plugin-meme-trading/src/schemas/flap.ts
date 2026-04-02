/**
 * Zod schemas for Flap.sh action parameter validation.
 */

import { z } from 'zod';

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

export const FlapBuySchema = z.object({
  tokenAddress: bscAddress.describe(
    'The BSC contract address of the Flap token to buy',
  ),
  amountBnb: positiveAmount.describe('Amount of BNB to spend (e.g. "0.1")'),
  slippagePct: slippage.describe('Slippage tolerance percentage (default: 5)'),
});
export type FlapBuyParams = z.infer<typeof FlapBuySchema>;

export const FlapSellSchema = z.object({
  tokenAddress: bscAddress.describe('The BSC contract address of the token to sell'),
  amountTokens: z
    .string()
    .describe('Amount of tokens to sell, or "all" for full balance'),
  slippagePct: slippage,
});
export type FlapSellParams = z.infer<typeof FlapSellSchema>;

export const FlapLaunchSchema = z.object({
  name: z.string().min(1).max(32).describe('Token name (e.g. "Doge Flap")'),
  symbol: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9]+$/, 'Symbol must be uppercase alphanumeric')
    .describe('Token ticker symbol (e.g. "DFLAP")'),
  description: z
    .string()
    .min(1)
    .max(1000)
    .describe('Token description'),
  imageUrl: z.string().url().optional().describe('URL of the token image'),
  initialBuyBnb: positiveAmount
    .optional()
    .describe('Amount of BNB for initial buy alongside launch'),
});
export type FlapLaunchParams = z.infer<typeof FlapLaunchSchema>;

export const FlapTrendingSchema = z.object({
  limit: z.number().min(1).max(50).default(10).describe('Number of tokens to show'),
});
export type FlapTrendingParams = z.infer<typeof FlapTrendingSchema>;
