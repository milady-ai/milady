/**
 * Confirmation flow for trade execution.
 * Shows a preview before executing on-chain.
 */

import type { TradeQuote } from '../types.js';
import { formatBnb, formatTokens, shortAddress, bscScanToken } from './format.js';

export interface ConfirmationContext {
  action: string;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  protocol: 'flap' | 'fourmeme';
  quote: TradeQuote;
}

/**
 * Build a confirmation message for a buy trade.
 * Uses bullet-list format (Discord/WhatsApp compatible).
 */
export function buildBuyConfirmation(ctx: ConfirmationContext): string {
  const protocolName = ctx.protocol === 'flap' ? 'Flap.sh' : 'Four.meme';
  const emoji = ctx.protocol === 'flap' ? '🦋' : '4️⃣';

  return [
    `${emoji} **${protocolName} Buy Preview**`,
    '',
    `• **Token:** ${ctx.tokenName} (${ctx.tokenSymbol})`,
    `• **Address:** ${shortAddress(ctx.tokenAddress)}`,
    `• **Spending:** ${formatBnb(ctx.quote.inputAmount)} BNB`,
    `• **Expected:** ${formatTokens(ctx.quote.outputAmount)} ${ctx.tokenSymbol}`,
    `• **Min received:** ${formatTokens(ctx.quote.minOutput)} ${ctx.tokenSymbol} (after slippage)`,
    ctx.quote.fee > 0n ? `• **Fee:** ~${formatBnb(ctx.quote.fee)} BNB` : '',
    '',
    `Reply **"confirm"** to execute or **"cancel"** to abort.`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Build a confirmation message for a sell trade.
 */
export function buildSellConfirmation(ctx: ConfirmationContext): string {
  const protocolName = ctx.protocol === 'flap' ? 'Flap.sh' : 'Four.meme';
  const emoji = ctx.protocol === 'flap' ? '🦋' : '4️⃣';

  return [
    `${emoji} **${protocolName} Sell Preview**`,
    '',
    `• **Token:** ${ctx.tokenName} (${ctx.tokenSymbol})`,
    `• **Address:** ${shortAddress(ctx.tokenAddress)}`,
    `• **Selling:** ${formatTokens(ctx.quote.inputAmount)} ${ctx.tokenSymbol}`,
    `• **Expected:** ${formatBnb(ctx.quote.outputAmount)} BNB`,
    `• **Min received:** ${formatBnb(ctx.quote.minOutput)} BNB (after slippage)`,
    ctx.quote.fee > 0n ? `• **Fee:** ~${formatBnb(ctx.quote.fee)} BNB` : '',
    '',
    `Reply **"confirm"** to execute or **"cancel"** to abort.`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Build a trade execution result message.
 */
export function buildTradeResult(params: {
  success: boolean;
  protocol: 'flap' | 'fourmeme';
  side: 'buy' | 'sell';
  tokenSymbol: string;
  inputAmount: string;
  outputAmount: string;
  txHash?: string;
  error?: string;
}): string {
  if (!params.success) {
    return `❌ Trade failed: ${params.error || 'Unknown error'}`;
  }

  const protocolName = params.protocol === 'flap' ? 'Flap.sh' : 'Four.meme';
  const emoji = params.side === 'buy' ? '✅' : '💰';

  if (params.side === 'buy') {
    return [
      `${emoji} **Bought on ${protocolName}!**`,
      `• Spent: ${params.inputAmount} BNB`,
      `• Received: ${params.outputAmount} ${params.tokenSymbol}`,
      params.txHash ? `• Tx: <${`https://bscscan.com/tx/${params.txHash}`}>` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    `${emoji} **Sold on ${protocolName}!**`,
    `• Sold: ${params.inputAmount} ${params.tokenSymbol}`,
    `• Received: ${params.outputAmount} BNB`,
    params.txHash ? `• Tx: <${`https://bscscan.com/tx/${params.txHash}`}>` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
