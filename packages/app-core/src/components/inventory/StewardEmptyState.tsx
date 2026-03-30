/**
 * Empty state for steward sub-tabs when steward isn't connected or has no data.
 */

import { FileText } from "lucide-react";
import { DESKTOP_SURFACE_PANEL_CLASSNAME } from "../desktop-surface-primitives";
import { StewardLogo } from "../steward/StewardLogo";

interface StewardEmptyStateProps {
  variant: "transactions" | "approvals";
}

export function StewardEmptyState({ variant }: StewardEmptyStateProps) {
  const title =
    variant === "approvals" ? "No pending approvals" : "No transactions yet";
  const description =
    variant === "approvals"
      ? "Transactions that exceed auto-approve limits will appear here."
      : "Transaction history will show up once your agent starts signing.";

  return (
    <div className="mx-auto max-w-[76rem] px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
      <div
        className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} px-6 py-16 text-center`}
      >
        {variant === "approvals" ? (
          <StewardLogo size={40} className="mx-auto opacity-30" />
        ) : (
          <FileText className="mx-auto h-10 w-10 text-muted/30" />
        )}
        <p className="mt-4 text-sm font-medium text-txt">{title}</p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted/70">
          {description}
        </p>
        <p className="mt-4 text-xs text-muted/40">
          Connect a Steward wallet in Settings to get started.
        </p>
      </div>
    </div>
  );
}
