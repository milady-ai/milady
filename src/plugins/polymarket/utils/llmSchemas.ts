import { z } from "zod";

// Coerce numeric strings to numbers for LLM outputs that quote numbers
const coercedNumber = z.union([
  z.number(),
  z.string()
    .refine((s) => Number.isFinite(parseFloat(s)), { message: "Not a valid number" })
    .transform((s) => parseFloat(s)),
]);

const coercedPositiveNumber = coercedNumber.pipe(z.number().positive());
const coercedNonNegativeNumber = coercedNumber.pipe(z.number().nonnegative());

export const PlaceOrderParamsSchema = z.object({
  tokenId: z.string().optional(),
  marketName: z.string().optional(),
  outcome: z.string().transform((s) => s.toLowerCase().trim()).pipe(z.enum(["yes", "no"])).optional(),
  side: z.string().optional(),
  price: coercedNonNegativeNumber.optional(),
  dollarAmount: coercedPositiveNumber.optional(),
  shares: coercedPositiveNumber.optional(),
  size: coercedPositiveNumber.optional(),
  orderType: z.string().optional(),
  feeRateBps: z.string().optional(),
  error: z.string().optional(),
}).passthrough();

export const CancelOrderParamsSchema = z.object({
  orderIds: z.array(z.string()).optional().nullable(),
  cancelAll: z.boolean().optional(),
  tokenId: z.string().optional().nullable(),
  error: z.string().optional(),
}).passthrough();

export const ClosePositionParamsSchema = z.object({
  tokenId: z.string().optional().nullable(),
  marketName: z.string().optional().nullable(),
  cancelOpenOrders: z.boolean().optional(),
  orderType: z.enum(["market", "limit"]).optional(),
  error: z.string().optional(),
}).passthrough();
