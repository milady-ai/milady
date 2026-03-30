export interface BillingSettingsResponse {
  settings?: {
    autoTopUp?: {
      enabled?: boolean;
      hasPaymentMethod?: boolean;
      threshold?: number;
      amount?: number;
    };
    limits?: {
      minAmount?: number;
      maxAmount?: number;
    };
  };
}

export interface CreditsSummaryResponse {
  organization?: {
    creditBalance?: number;
    autoTopUpEnabled?: boolean;
    autoTopUpThreshold?: number;
    autoTopUpAmount?: number;
    hasPaymentMethod?: boolean;
  };
  agentsSummary?: {
    total?: number;
    totalAllocated?: number;
    totalSpent?: number;
    totalAvailable?: number;
    withBudget?: number;
    paused?: number;
  };
  pricing?: {
    creditsPerDollar?: number;
    minimumTopUp?: number;
  };
}

export function formatMoney(value?: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
