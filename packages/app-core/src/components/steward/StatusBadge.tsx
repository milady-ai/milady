/**
 * Color-coded status badges for transaction statuses.
 */

import type { StewardTxStatus } from "@miladyai/shared/contracts/wallet";

const STATUS_STYLES: Record<
  StewardTxStatus,
  { bg: string; text: string; label: string }
> = {
  pending: {
    bg: "bg-status-warning-bg border-status-warning/25",
    text: "text-status-warning",
    label: "Pending",
  },
  approved: {
    bg: "bg-status-info-bg border-status-info/25",
    text: "text-status-info",
    label: "Approved",
  },
  rejected: {
    bg: "bg-status-danger-bg border-status-danger/25",
    text: "text-status-danger",
    label: "Rejected",
  },
  signed: {
    bg: "bg-status-success-bg border-status-success/25",
    text: "text-status-success",
    label: "Signed",
  },
  broadcast: {
    bg: "bg-cyan-500/15 border-cyan-500/25",
    text: "text-cyan-400",
    label: "Broadcast",
  },
  confirmed: {
    bg: "bg-status-success-bg border-status-success/25",
    text: "text-status-success",
    label: "Confirmed",
  },
  failed: {
    bg: "bg-status-danger-bg border-status-danger/25",
    text: "text-status-danger",
    label: "Failed",
  },
};

export function TxStatusBadge({ status }: { status: StewardTxStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}
