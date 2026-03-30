/**
 * Types and constants for policy controls.
 */
import type { StewardPolicyType } from "../../../lib/cloud-api";

export const POLICY_TYPE_META: Record<
  StewardPolicyType,
  { label: string; description: string; icon: string }
> = {
  "spending-limit": {
    label: "SPENDING LIMIT",
    description: "Cap transaction amounts per-tx, daily, and weekly",
    icon: "💰",
  },
  "approved-addresses": {
    label: "APPROVED ADDRESSES",
    description: "Whitelist or blacklist destination addresses",
    icon: "📋",
  },
  "auto-approve-threshold": {
    label: "AUTO-APPROVE THRESHOLD",
    description: "Auto-approve transactions below a certain value",
    icon: "⚡",
  },
  "time-window": {
    label: "TIME WINDOW",
    description: "Only allow transactions during specified hours/days",
    icon: "🕐",
  },
  "rate-limit": {
    label: "RATE LIMIT",
    description: "Limit the number of transactions per hour/day",
    icon: "🚦",
  },
};

export function generatePolicyId(type: StewardPolicyType): string {
  return `${type}-${Date.now().toString(36)}`;
}

export function getDefaultConfig(
  type: StewardPolicyType,
): Record<string, unknown> {
  switch (type) {
    case "spending-limit":
      return { maxPerTx: "0.1", maxPerDay: "1.0", maxPerWeek: "5.0" };
    case "approved-addresses":
      return { addresses: [], mode: "whitelist" };
    case "auto-approve-threshold":
      return { threshold: "0.01" };
    case "time-window":
      return {
        allowedHours: [{ start: 9, end: 17 }],
        allowedDays: [1, 2, 3, 4, 5],
      };
    case "rate-limit":
      return { maxTxPerHour: 10, maxTxPerDay: 50 };
    default:
      return {};
  }
}
