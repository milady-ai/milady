/**
 * Compute the correct `amount` parameter for a Polymarket market order.
 *
 * Per Polymarket SDK docs:
 * - BUY orders: `amount` is in USDC (dollars to spend)
 * - SELL orders: `amount` is in shares
 */
export function computeMarketOrderAmount(
  side: "BUY" | "SELL",
  price: number,
  size: number,
  dollarAmount: number,
  isDollarAmount: boolean
): number {
  if (side === "BUY") {
    // BUY: API expects dollar amount
    return isDollarAmount ? dollarAmount : price * size;
  }
  // SELL: API expects share count
  return isDollarAmount ? Math.floor(dollarAmount / price) : size;
}

/**
 * Recalculate order size when the final price differs from the initial estimate.
 * Only applies when the user specified a dollar amount (not shares).
 */
export function recalculateSize(
  isDollarAmount: boolean,
  dollarAmount: number,
  currentSize: number,
  finalPrice: number
): number {
  if (!isDollarAmount) return currentSize;
  if (finalPrice <= 0) return 0;
  return Math.floor(dollarAmount / finalPrice);
}

interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate order bounds before submission (H3).
 */
export function validateOrderBounds(params: {
  price: number;
  size: number;
  maxTradeSizeUsd: number;
}): ValidationResult {
  const { price, size, maxTradeSizeUsd } = params;

  if (price <= 0 || price >= 1) {
    return { valid: false, reason: `Price $${price} is outside valid range (0, 1)` };
  }

  const orderValue = price * size;
  if (orderValue > maxTradeSizeUsd) {
    return {
      valid: false,
      reason: `Order value $${orderValue.toFixed(2)} exceeds max trade size $${maxTradeSizeUsd}`,
    };
  }

  return { valid: true };
}

/**
 * Validate order size against market minimum (H8).
 */
export function validateMinOrderSize(size: number, minOrderSize: string): ValidationResult {
  const min = parseFloat(minOrderSize);
  if (!Number.isFinite(min) || min <= 0) {
    return { valid: true };
  }
  if (size < min) {
    return { valid: false, reason: `Order size ${size} is below minimum ${min} for this market` };
  }
  return { valid: true };
}

/**
 * Validate user has sufficient balance (H1).
 */
export function validateBalance(
  balance: number | null,
  orderCost: number
): ValidationResult {
  if (balance === null || balance === undefined) {
    return { valid: true };
  }
  if (balance < orderCost) {
    return {
      valid: false,
      reason: `Insufficient balance: $${balance.toFixed(2)} available, $${orderCost.toFixed(2)} required`,
    };
  }
  return { valid: true };
}
